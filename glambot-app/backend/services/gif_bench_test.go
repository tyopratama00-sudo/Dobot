package services

import (
	"image"
	"image/color"
	"testing"

	xdraw "golang.org/x/image/draw"
)

// Benchmark untuk dua titik panas generator GIF. Keduanya pernah jadi sumber
// "GIF live lama muncul di halaman QR", dan dua-duanya tidak kelihatan dari
// membaca kode saja — jadi disimpan supaya regresi berikutnya cepat ketahuan.
//
//	go test ./services -bench . -benchtime 20x -run '^$'

// Ukuran nyata: burst = liveview Canon, rect = satu slot di output GIF live
// (liveGIFWidth 448; canvas 464x696 → tinggi 672).
var (
	benchBurst = image.NewRGBA(image.Rect(0, 0, 1024, 680))
	benchSlot  = image.Rect(20, 40, 428, 260)
)

// Baseline historis: cover-fit lama (Scale + crop, separable dua pass).
// drawCoverTransformed tanpa rotasi harus setara ini — kalau jauh lebih lambat,
// artinya jalur cepatnya lolos dan jatuh ke Transform yang non-separable.
func BenchmarkBurstCoverBaseline(b *testing.B) {
	sb := benchBurst.Bounds()
	aspect := float64(benchSlot.Dx()) / float64(benchSlot.Dy())
	newH := int(float64(sb.Dx()) / aspect)
	offY := sb.Min.Y + (sb.Dy()-newH)/2
	crop := image.Rect(sb.Min.X, offY, sb.Max.X, offY+newH)

	dst := image.NewRGBA(benchSlot)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		xdraw.CatmullRom.Scale(dst, benchSlot, benchBurst, crop, xdraw.Over, nil)
	}
}

func BenchmarkBurstIdentity(b *testing.B) {
	dst := image.NewRGBA(benchSlot)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		drawCoverTransformed(dst, benchSlot, benchBurst, identityTransform)
	}
}

func BenchmarkBurstZoomPan(b *testing.B) {
	dst := image.NewRGBA(benchSlot)
	tf := LiveStripSlotTransform{Scale: 1.8, OffsetX: 0.1}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		drawCoverTransformed(dst, benchSlot, benchBurst, tf)
	}
}

// Rotasi memang lebih mahal (Transform non-separable) — tapi hanya slot yang
// benar-benar diputar user yang membayarnya.
func BenchmarkBurstRotated(b *testing.B) {
	dst := image.NewRGBA(benchSlot)
	tf := LiveStripSlotTransform{Scale: 1.2, Angle: 15}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		drawCoverTransformed(dst, benchSlot, benchBurst, tf)
	}
}

// Konversi palet: satu frame. GIF live punya 30 frame, jadi kalikan 30 untuk
// biaya per GIF. Ini yang dulu memakan ~8 detik sendirian.
func BenchmarkPalettedLiveFrame(b *testing.B) {
	src := image.NewRGBA(image.Rect(0, 0, 448, 672))
	for y := 0; y < 672; y++ {
		for x := 0; x < 448; x++ {
			src.SetRGBA(x, y, color.RGBA{
				R: uint8((x * 7) % 256),
				G: uint8((y * 5) % 256),
				B: uint8((x + y) % 256),
				A: 255,
			})
		}
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		paletted(src)
	}
}

// Pembanding langsung: implementasi yang digantikan.
func BenchmarkPalettedLiveFrameStdlib(b *testing.B) {
	src := image.NewRGBA(image.Rect(0, 0, 448, 672))
	bounds := src.Bounds()
	pal := standardPalette()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		dst := image.NewPaletted(bounds, pal)
		xdraw.FloydSteinberg.Draw(dst, bounds, src, bounds.Min)
	}
}
