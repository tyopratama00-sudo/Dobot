package services

import (
	"image"
	"image/color"
	"math"
	"testing"
)

// Transform slot untuk GIF live gampang meleset tanpa ketahuan — hasilnya cuma
// "framing burst agak geser" yang baru kelihatan setelah sesi nyata. Test ini
// mengunci matematikanya: warna src meng-encode koordinatnya, jadi dari warna
// pixel hasil kita bisa hitung balik src mana yang mendarat di situ.

// src 400x300: warna meng-encode koordinat (R = x/w, G = y/h) supaya dari
// warna pixel dst kita bisa hitung balik src mana yang mendarat di situ.
func makeCoordSrc() *image.RGBA {
	const w, h = 400, 300
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetRGBA(x, y, color.RGBA{
				R: uint8(x * 255 / (w - 1)),
				G: uint8(y * 255 / (h - 1)),
				B: 128,
				A: 255,
			})
		}
	}
	return img
}

// decode balik: warna → koordinat src.
func decodeXY(c color.RGBA) (float64, float64) {
	return float64(c.R) / 255 * 399, float64(c.G) / 255 * 299
}

func checkAt(t *testing.T, dst *image.RGBA, px, py int, wantX, wantY float64, label string) {
	t.Helper()
	gx, gy := decodeXY(dst.RGBAAt(px, py))
	const tol = 6 // toleransi kuantisasi warna 8-bit + resampling
	if gx < wantX-tol || gx > wantX+tol || gy < wantY-tol || gy > wantY+tol {
		t.Errorf("%s: dst(%d,%d) → src(%.1f,%.1f), harusnya ≈(%.1f,%.1f)",
			label, px, py, gx, gy, wantX, wantY)
	}
}

func TestDrawCoverTransformed(t *testing.T) {
	src := makeCoordSrc()
	rect := image.Rect(0, 0, 100, 100)
	// cover = max(100/400, 100/300) = 1/3

	t.Run("identitas = cover-fit center crop", func(t *testing.T) {
		dst := image.NewRGBA(rect)
		drawCoverTransformed(dst, rect, src, identityTransform)
		// Tengah rect = tengah src.
		checkAt(t, dst, 50, 50, 200, 150, "center")
		// Pojok kiri-atas: 50px ke kiri pada skala 1/3 = 150px src.
		checkAt(t, dst, 0, 0, 50, 0, "top-left")
		// Sisi kanan: crop horizontal, src x=350 di tepi kanan.
		checkAt(t, dst, 99, 50, 348, 150, "right-edge")
	})

	t.Run("zoom 2x memperlihatkan setengah bagian tengah", func(t *testing.T) {
		dst := image.NewRGBA(rect)
		drawCoverTransformed(dst, rect, src, LiveStripSlotTransform{Scale: 2})
		checkAt(t, dst, 50, 50, 200, 150, "center tetap")
		// skala 2/3 → 50px dst = 75px src.
		checkAt(t, dst, 0, 0, 125, 75, "top-left")
	})

	t.Run("offset menggeser titik tengah", func(t *testing.T) {
		dst := image.NewRGBA(rect)
		// Geser +0.25 lebar slot ke kanan → pusat src mendarat di x=75.
		drawCoverTransformed(dst, rect, src, LiveStripSlotTransform{
			Scale: 1, OffsetX: 0.25,
		})
		checkAt(t, dst, 75, 50, 200, 150, "pusat bergeser")
		// dst x=50 kini 25px di kiri pusat = 75px src.
		checkAt(t, dst, 50, 50, 125, 150, "kiri pusat")
	})

	t.Run("rotasi tetap menutupi seluruh slot", func(t *testing.T) {
		for _, angle := range []float64{15, 45, 90, -30, 180} {
			dst := image.NewRGBA(rect)
			drawCoverTransformed(dst, rect, src, LiveStripSlotTransform{
				Scale: 1, Angle: angle,
			})
			// Tiap pixel slot harus solid — kalau ada yang tembus, artinya
			// perhitungan needCover kurang dan sudut slot bakal bolong.
			for y := rect.Min.Y; y < rect.Max.Y; y++ {
				for x := rect.Min.X; x < rect.Max.X; x++ {
					if a := dst.RGBAAt(x, y).A; a < 250 {
						t.Fatalf("angle %.0f°: dst(%d,%d) alpha=%d — slot bolong", angle, x, y, a)
					}
				}
			}
			// Pusat harus tetap pusat berapa pun rotasinya.
			checkAt(t, dst, 50, 50, 200, 150, "center@rot")
		}
	})

	t.Run("slot potret dari sumber lanskap", func(t *testing.T) {
		// Slot 60x120 (potret) dari src 400x300 (lanskap): cover harus fit ke
		// tinggi lalu crop sisi — kasus paling umum di strip photobooth.
		pr := image.Rect(0, 0, 60, 120)
		dst := image.NewRGBA(pr)
		drawCoverTransformed(dst, pr, src, identityTransform)
		for y := pr.Min.Y; y < pr.Max.Y; y++ {
			for x := pr.Min.X; x < pr.Max.X; x++ {
				if a := dst.RGBAAt(x, y).A; a < 250 {
					t.Fatalf("potret: dst(%d,%d) alpha=%d — slot bolong", x, y, a)
				}
			}
		}
		checkAt(t, dst, 30, 60, 200, 150, "center potret")
	})

	t.Run("nilai rusak jatuh ke identitas", func(t *testing.T) {
		for _, bad := range []LiveStripSlotTransform{
			{Scale: 0},
			{Scale: -3},
			{Scale: math.NaN()},
			{Scale: math.Inf(1)},
		} {
			if got := bad.normalized(); got != identityTransform {
				t.Errorf("normalized(%+v) = %+v, harusnya identitas", bad, got)
			}
		}
		// Skala valid tapi offset rusak: skala dipertahankan, offset dinolkan.
		got := LiveStripSlotTransform{Scale: 1.5, OffsetX: math.NaN()}.normalized()
		if got.Scale != 1.5 || got.OffsetX != 0 {
			t.Errorf("offset NaN: %+v, harusnya scale 1.5 & offsetX 0", got)
		}
	})
}
