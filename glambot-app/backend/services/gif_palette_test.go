package services

import (
	"image"
	"image/color"
	"math"
	"testing"

	xdraw "golang.org/x/image/draw"
)

// paletted() ditulis manual demi kecepatan (LUT, bukan pemindaian palet linear).
// Test ini menjaga agar percepatan itu tidak diam-diam menurunkan kualitas:
// hasilnya dibandingkan langsung dengan xdraw.FloydSteinberg — implementasi yang
// digantikan — di atas gambar bergradasi yang meniru foto (kulit, langit).

func gradientImage(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			fx := float64(x) / float64(w)
			fy := float64(y) / float64(h)
			img.SetRGBA(x, y, color.RGBA{
				// Gradasi halus + sedikit ripple: kasus terberat buat banding.
				R: uint8(40 + 200*fx*(0.7+0.3*math.Sin(fy*6))),
				G: uint8(30 + 180*fy),
				B: uint8(60 + 150*(1-fx)*(0.6+0.4*math.Cos(fx*5))),
				A: 255,
			})
		}
	}
	return img
}

// meanAbsErr rata-rata selisih |asli - hasil| per kanal, dalam satuan 0-255.
func meanAbsErr(src *image.RGBA, out *image.Paletted) float64 {
	b := src.Bounds()
	var sum float64
	var n int
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			sr, sg, sb, _ := src.At(x, y).RGBA()
			dr, dg, db, _ := out.At(x, y).RGBA()
			sum += math.Abs(float64(int(sr>>8) - int(dr>>8)))
			sum += math.Abs(float64(int(sg>>8) - int(dg>>8)))
			sum += math.Abs(float64(int(sb>>8) - int(db>>8)))
			n += 3
		}
	}
	return sum / float64(n)
}

func TestPalettedQualityMatchesFloydSteinberg(t *testing.T) {
	src := gradientImage(448, 672)
	bounds := src.Bounds()

	// Hasil implementasi cepat.
	fast := paletted(src)

	// Hasil implementasi lama, palet yang sama.
	ref := image.NewPaletted(bounds, standardPalette())
	xdraw.FloydSteinberg.Draw(ref, bounds, src, bounds.Min)

	fastErr := meanAbsErr(src, fast)
	refErr := meanAbsErr(src, ref)

	t.Logf("mean abs error — cepat: %.3f, referensi: %.3f", fastErr, refErr)

	// Boleh sedikit berbeda (kuantisasi LUT 5-bit + urutan pembulatan difusi),
	// tapi tidak boleh jadi lebih buruk secara berarti.
	if fastErr > refErr*1.15+0.5 {
		t.Errorf("kualitas turun: mean abs error %.3f vs referensi %.3f", fastErr, refErr)
	}

	// Palet & dimensi hasil harus identik supaya image/gif memperlakukan sama.
	if len(fast.Palette) != len(ref.Palette) {
		t.Errorf("ukuran palet beda: %d vs %d", len(fast.Palette), len(ref.Palette))
	}
	if !fast.Bounds().Eq(ref.Bounds()) {
		t.Errorf("bounds beda: %v vs %v", fast.Bounds(), ref.Bounds())
	}
}

// Warna rata harus terkonversi bersih — kalau difusi error bocor, bidang polos
// akan berbintik dan itu paling kelihatan di frame GIF.
func TestPalettedFlatColorStaysFlat(t *testing.T) {
	for _, c := range []color.RGBA{
		{R: 0, G: 0, B: 0, A: 255},
		{R: 255, G: 255, B: 255, A: 255},
		{R: 0x33, G: 0x66, B: 0x99, A: 255}, // tepat di palet websafe
	} {
		src := image.NewRGBA(image.Rect(0, 0, 64, 64))
		for y := 0; y < 64; y++ {
			for x := 0; x < 64; x++ {
				src.SetRGBA(x, y, c)
			}
		}
		out := paletted(src)
		first := out.Pix[0]
		for i, v := range out.Pix {
			if v != first {
				t.Fatalf("warna %v: pixel %d = index %d, harusnya seragam %d", c, i, v, first)
			}
		}
		if e := meanAbsErr(src, out); e > 0.5 {
			t.Errorf("warna %v: error %.2f — warna palet eksak harusnya ~0", c, e)
		}
	}
}
