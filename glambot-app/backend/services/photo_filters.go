package services

import (
	"image"
	"image/draw"
	"math"
	"math/rand"
)

// Replikasi filter frontend (lib/filters.ts) untuk burst frame GIF live yang
// masih mentah — cukup mirip secara visual, tak perlu identik bit-per-bit.

// StripFilters daftar filter yang valid (selain "original"). Dipakai handler
// untuk memvalidasi input sebelum disimpan.
var StripFilters = map[string]bool{
	"original": true, "warm": true, "cool": true, "vintage": true,
	"dramatic": true, "mono": true, "sepia": true, "vivid": true,
	"soft": true, "film": true, "noir": true, "sunset": true,
	"mint": true, "pastel": true, "blush": true, "moody": true,
}

// ApplyStripFilter mengembalikan salinan src dengan filter diterapkan. Filter
// kosong / "original" / tak dikenal → salinan apa adanya.
func ApplyStripFilter(src image.Image, filter string) *image.RGBA {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(dst, dst.Bounds(), src, b.Min, draw.Src)

	switch filter {
	case "warm":
		colorMatrixF(dst, matWarm)
	case "cool":
		colorMatrixF(dst, matCool)
	case "vintage":
		colorMatrixF(dst, matSepia)
		brightnessF(dst, 0.05)
		contrastF(dst, -0.1)
	case "dramatic":
		contrastF(dst, 0.3)
		saturationF(dst, 0.4)
	case "mono":
		grayscaleF(dst)
		contrastF(dst, 0.12)
	case "sepia":
		colorMatrixF(dst, matSepia)
		contrastF(dst, 0.05)
	case "vivid":
		saturationF(dst, 0.5)
		contrastF(dst, 0.12)
	case "soft":
		saturationF(dst, -0.15)
		contrastF(dst, -0.12)
		brightnessF(dst, 0.06)
	case "film":
		saturationF(dst, -0.1)
		colorMatrixF(dst, matFilm)
		noiseF(dst, 25)
	case "noir":
		grayscaleF(dst)
		contrastF(dst, 0.35)
		brightnessF(dst, -0.05)
	case "sunset":
		colorMatrixF(dst, matSunset)
		saturationF(dst, 0.2)
	case "mint":
		colorMatrixF(dst, matMint)
		brightnessF(dst, 0.04)
	case "pastel":
		saturationF(dst, -0.25)
		brightnessF(dst, 0.1)
		contrastF(dst, -0.18)
	case "blush":
		colorMatrixF(dst, matBlush)
		brightnessF(dst, 0.05)
		saturationF(dst, -0.05)
	case "moody":
		saturationF(dst, -0.3)
		contrastF(dst, 0.22)
		brightnessF(dst, -0.06)
		colorMatrixF(dst, matMoody)
	default:
		// original / kosong / tak dikenal → tanpa perubahan.
	}
	return dst
}

// clamp8 membulatkan & meng-clamp ke [0,255] (meniru Uint8ClampedArray Fabric).
func clamp8(v float64) uint8 {
	v = math.Round(v)
	if v <= 0 {
		return 0
	}
	if v >= 255 {
		return 255
	}
	return uint8(v)
}

// Matriks ColorMatrix 4×5 (sama persis dengan filters.ts).
var (
	matWarm = [20]float64{
		1.1, 0, 0, 0, 0.05,
		0, 1.0, 0, 0, 0.03,
		0, 0, 0.9, 0, 0,
		0, 0, 0, 1, 0,
	}
	matCool = [20]float64{
		0.9, 0, 0, 0, 0,
		0, 1.0, 0, 0, 0.02,
		0, 0, 1.1, 0, 0.05,
		0, 0, 0, 1, 0,
	}
	matFilm = [20]float64{
		1.05, 0, 0, 0, 0.03,
		0, 1.0, 0, 0, 0.02,
		0, 0, 0.92, 0, 0,
		0, 0, 0, 1, 0,
	}
	matSunset = [20]float64{
		1.15, 0, 0, 0, 0.06,
		0, 0.95, 0, 0, 0,
		0, 0, 1.0, 0, 0.02,
		0, 0, 0, 1, 0,
	}
	matMint = [20]float64{
		0.92, 0, 0, 0, 0,
		0, 1.06, 0, 0, 0.02,
		0, 0, 1.02, 0, 0.02,
		0, 0, 0, 1, 0,
	}
	matBlush = [20]float64{
		1.08, 0, 0, 0, 0.05,
		0, 0.96, 0, 0, 0.01,
		0, 0, 1.0, 0, 0.03,
		0, 0, 0, 1, 0,
	}
	matMoody = [20]float64{
		0.95, 0, 0, 0, 0,
		0, 0.98, 0, 0, 0,
		0, 0, 1.06, 0, 0.02,
		0, 0, 0, 1, 0,
	}
	// Fabric Sepia = ColorMatrix dengan koefisien standar sepia.
	matSepia = [20]float64{
		0.393, 0.769, 0.189, 0, 0,
		0.349, 0.686, 0.168, 0, 0,
		0.272, 0.534, 0.131, 0, 0,
		0, 0, 0, 1, 0,
	}
)

// colorMatrixF: data[c] = r*m0 + g*m1 + b*m2 + a*m3 + m4*255 (offset ×255 spt
// Fabric). Alpha dibiarkan (colorsOnly), sesuai default Fabric ColorMatrix.
func colorMatrixF(im *image.RGBA, m [20]float64) {
	p := im.Pix
	for o := 0; o < len(p); o += 4 {
		r := float64(p[o])
		g := float64(p[o+1])
		b := float64(p[o+2])
		a := float64(p[o+3])
		nr := r*m[0] + g*m[1] + b*m[2] + a*m[3] + m[4]*255
		ng := r*m[5] + g*m[6] + b*m[7] + a*m[8] + m[9]*255
		nb := r*m[10] + g*m[11] + b*m[12] + a*m[13] + m[14]*255
		p[o] = clamp8(nr)
		p[o+1] = clamp8(ng)
		p[o+2] = clamp8(nb)
	}
}

// brightnessF: tambah round(val*255) ke tiap channel (spt Fabric Brightness).
func brightnessF(im *image.RGBA, val float64) {
	add := math.Round(val * 255)
	p := im.Pix
	for o := 0; o < len(p); o += 4 {
		p[o] = clamp8(float64(p[o]) + add)
		p[o+1] = clamp8(float64(p[o+1]) + add)
		p[o+2] = clamp8(float64(p[o+2]) + add)
	}
}

// contrastF: f = 259*(c+255)/(255*(259-c)), c = floor(val*255); new = f*(v-128)+128.
func contrastF(im *image.RGBA, val float64) {
	c := math.Floor(val * 255)
	f := 259 * (c + 255) / (255 * (259 - c))
	p := im.Pix
	for o := 0; o < len(p); o += 4 {
		p[o] = clamp8(f*(float64(p[o])-128) + 128)
		p[o+1] = clamp8(f*(float64(p[o+1])-128) + 128)
		p[o+2] = clamp8(f*(float64(p[o+2])-128) + 128)
	}
}

// saturationF meniru Fabric Saturation: adjust = -val; tiap channel non-max
// digeser (max-channel)*adjust.
func saturationF(im *image.RGBA, val float64) {
	adjust := -val
	p := im.Pix
	for o := 0; o < len(p); o += 4 {
		r := float64(p[o])
		g := float64(p[o+1])
		b := float64(p[o+2])
		mx := r
		if g > mx {
			mx = g
		}
		if b > mx {
			mx = b
		}
		if mx != r {
			r += (mx - r) * adjust
		}
		if mx != g {
			g += (mx - g) * adjust
		}
		if mx != b {
			b += (mx - b) * adjust
		}
		p[o] = clamp8(r)
		p[o+1] = clamp8(g)
		p[o+2] = clamp8(b)
	}
}

// grayscaleF: mode 'average' (default Fabric Grayscale) → (r+g+b)/3.
func grayscaleF(im *image.RGBA) {
	p := im.Pix
	for o := 0; o < len(p); o += 4 {
		v := clamp8((float64(p[o]) + float64(p[o+1]) + float64(p[o+2])) / 3)
		p[o] = v
		p[o+1] = v
		p[o+2] = v
	}
}

// noiseF: tambah noise acak yang sama untuk r,g,b tiap pixel (spt Fabric Noise).
// Seed tetap supaya hasil deterministik antar-regenerate (tidak "bergetar").
func noiseF(im *image.RGBA, n float64) {
	rng := rand.New(rand.NewSource(1))
	p := im.Pix
	for o := 0; o < len(p); o += 4 {
		d := (0.5 - rng.Float64()) * n
		p[o] = clamp8(float64(p[o]) + d)
		p[o+1] = clamp8(float64(p[o+1]) + d)
		p[o+2] = clamp8(float64(p[o+2]) + d)
	}
}
