package services

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"os"
	"path/filepath"
	"photobooth/config"
	"sync"
	"time"

	xdraw "golang.org/x/image/draw"
)

// Ukuran kanvas GIF — dinaikkan (480×720) untuk hasil lebih tajam sesuai foto
// full-res DSLR, tetap aspect 2:3 (mengikuti frame strip default 464×696).
// Slideshow ini hanya ~3 frame jadi kenaikan resolusi murah untuk ukuran file.
const (
	gifCanvasWidth  = 480
	gifCanvasHeight = 720
	gifFrameDelay   = 70 // 100ths of a second → 0.7s per foto raw
)

// GenerateAnimationOptions parameter generator GIF.
type GenerateAnimationOptions struct {
	SessionID        string
	SelectedRawPaths []string // path absolut ke foto raw terpilih (urut posisi)
}

// gifGenLocks registry mutex per (sesi, artefak). Memastikan generasi satu
// artefak tidak race — request kedua menunggu yang pertama, lalu memakai cache.
// gifGenLocksM melindungi akses ke map itu sendiri.
var (
	gifGenLocks  = map[string]*sync.Mutex{}
	gifGenLocksM sync.Mutex
)

// Kunci artefak. Slideshow & live strip DIKUNCI TERPISAH walau satu sesi:
// keduanya menulis file berbeda, jadi menyatukan lock-nya cuma bikin request
// /gif-live dari HP antre di belakang generasi slideshow yang tidak ia butuhkan.
const (
	lockKindAnim = "|anim"
	lockKindLive = "|live"
)

func sessionLock(key string) *sync.Mutex {
	gifGenLocksM.Lock()
	defer gifGenLocksM.Unlock()
	mu, ok := gifGenLocks[key]
	if !ok {
		mu = &sync.Mutex{}
		gifGenLocks[key] = mu
	}
	return mu
}

// ForgetGifSession menghapus lock milik sesi dari peta supaya tidak menumpuk
// di memori seiring banyak sesi (kiosk dipakai berbulan-bulan).
// Dipanggil setelah session benar-benar selesai.
func ForgetGifSession(sessionID string) {
	if sessionID == "" {
		return
	}
	gifGenLocksM.Lock()
	// Satu sesi punya beberapa lock (satu per artefak) — buang semuanya.
	for _, kind := range []string{lockKindAnim, lockKindLive} {
		delete(gifGenLocks, sessionID+kind)
	}
	gifGenLocksM.Unlock()
}

// AnimationOutputPath path file GIF hasil untuk satu sesi.
func AnimationOutputPath(sessionID string) string {
	return filepath.Join(
		config.App.StoragePath,
		"sessions", sessionID, "animation.gif",
	)
}

// GenerateSessionGIF membuat animated GIF untuk satu sesi.
// Idempotent: kalau file sudah ada dan lebih baru dari semua source,
// langsung pakai cache. Aman dipanggil ulang.
func GenerateSessionGIF(opts GenerateAnimationOptions) (string, error) {
	if opts.SessionID == "" {
		return "", fmt.Errorf("session id wajib")
	}
	if len(opts.SelectedRawPaths) == 0 {
		return "", fmt.Errorf("tidak ada foto raw untuk di-animate")
	}

	mu := sessionLock(opts.SessionID + lockKindAnim)
	mu.Lock()
	defer mu.Unlock()

	outPath := AnimationOutputPath(opts.SessionID)
	if upToDate(outPath, opts) {
		return outPath, nil
	}

	if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}

	frames := buildGIFFrames(opts)
	if len(frames.images) == 0 {
		return "", fmt.Errorf("tidak ada frame yang berhasil di-decode")
	}

	anim := &gif.GIF{
		Image:     frames.images,
		Delay:     frames.delays,
		LoopCount: 0, // 0 = loop forever
	}
	if err := writeGIFAtomic(outPath, anim); err != nil {
		return "", err
	}

	log.Printf("🎞️  GIF generated for session %s (%d frames) → %s",
		opts.SessionID, len(frames.images), outPath)
	return outPath, nil
}

// writeGIFAtomic menulis GIF lewat file sementara lalu rename. Menulis langsung
// ke path final bikin ada jendela beberapa detik dimana file cuma separuh jadi —
// dan di jendela itu uploader Drive (atau HP customer) bisa saja membacanya,
// lalu yang tersimpan/terkirim adalah GIF rusak. Rename bersifat atomik, jadi
// pembaca selalu dapat versi lama yang utuh atau versi baru yang utuh.
func writeGIFAtomic(outPath string, anim *gif.GIF) error {
	tmpPath := outPath + ".tmp"

	out, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("create gif: %w", err)
	}

	if err := gif.EncodeAll(out, anim); err != nil {
		out.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("encode gif: %w", err)
	}
	if err := out.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close gif: %w", err)
	}

	if err := os.Rename(tmpPath, outPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename gif: %w", err)
	}
	return nil
}

type frameSet struct {
	images []*image.Paletted
	delays []int
}

func buildGIFFrames(opts GenerateAnimationOptions) frameSet {
	out := frameSet{}

	// Slideshow: tiap raw photo terpilih ditampilkan satu per satu, loop.
	for _, raw := range opts.SelectedRawPaths {
		img := decodeImage(raw)
		if img == nil {
			continue
		}
		frame := scaleToCanvas(img)
		out.images = append(out.images, paletted(frame))
		out.delays = append(out.delays, gifFrameDelay)
	}

	return out
}

func decodeImage(path string) image.Image {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("⚠️  gif: open %s: %v", path, err)
		return nil
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		log.Printf("⚠️  gif: decode %s: %v", path, err)
		return nil
	}
	return img
}

// scaleToCanvas mengecilkan/memperbesar src ke kanvas standar gif.
// Aspek rasio dipertahankan, sisa kanvas diisi background gelap supaya
// hasil GIF konsisten di semua HP (no letterbox abu-abu yang ganggu).
func scaleToCanvas(src image.Image) *image.RGBA {
	canvas := image.NewRGBA(image.Rect(0, 0, gifCanvasWidth, gifCanvasHeight))
	bg := color.RGBA{R: 14, G: 14, B: 18, A: 255}
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: bg}, image.Point{}, draw.Src)

	sb := src.Bounds()
	srcW := sb.Dx()
	srcH := sb.Dy()
	if srcW <= 0 || srcH <= 0 {
		return canvas
	}

	scaleW := float64(gifCanvasWidth) / float64(srcW)
	scaleH := float64(gifCanvasHeight) / float64(srcH)
	scale := scaleW
	if scaleH < scale {
		scale = scaleH
	}
	dstW := int(float64(srcW) * scale)
	dstH := int(float64(srcH) * scale)
	dstX := (gifCanvasWidth - dstW) / 2
	dstY := (gifCanvasHeight - dstH) / 2

	dstRect := image.Rect(dstX, dstY, dstX+dstW, dstY+dstH)
	xdraw.CatmullRom.Scale(canvas, dstRect, src, sb, xdraw.Over, nil)
	return canvas
}

// palLUTBits bit per kanal untuk tabel lookup warna (6 → kubus 64³ = 256 KB).
//
// 5 bit sempat dicoba dan terlalu kasar di ujung skala: bucket paling bawah
// berpusat di 4, yang tetangga terdekatnya (6,6,6) dari grayscale ramp — bukan
// hitam pekat — jadi area hitam solid berubah jadi abu-abu gelap. 6 bit
// memberi pusat bucket 2, dan hitam kembali memetakan ke hitam.
const palLUTBits = 6
const palLUTSide = 1 << palLUTBits

var (
	palLUT     []uint8   // kubus RGB → index palet
	palRGB     [][3]int32 // index palet → komponen RGB (hindari type assert per pixel)
	palLUTOnce sync.Once
)

// paletteLUT membangun (sekali) tabel warna→index palet.
//
// Alasannya: color.Palette.Index memindai LINEAR seluruh 256 entri untuk SETIAP
// pixel. Pada frame GIF live 448×672 itu ~77 juta perbandingan per frame, dan
// GIF live punya 30 frame — jadi konversi palet sendirian memakan detik-detikan,
// jauh melampaui biaya menggambar burst-nya. Dengan tabel ini biayanya jadi
// satu indexing per pixel.
func paletteLUT() ([]uint8, [][3]int32) {
	palLUTOnce.Do(func() {
		pal := standardPalette()

		palRGB = make([][3]int32, len(pal))
		for i, c := range pal {
			r, g, b, _ := c.RGBA()
			palRGB[i] = [3]int32{int32(r >> 8), int32(g >> 8), int32(b >> 8)}
		}

		const step = 256 / palLUTSide
		lut := make([]uint8, palLUTSide*palLUTSide*palLUTSide)
		i := 0
		for r := 0; r < palLUTSide; r++ {
			for g := 0; g < palLUTSide; g++ {
				for b := 0; b < palLUTSide; b++ {
					// Pusat bucket, bukan tepinya — separuh error kuantisasi.
					lut[i] = uint8(pal.Index(color.RGBA{
						R: uint8(r*step + step/2),
						G: uint8(g*step + step/2),
						B: uint8(b*step + step/2),
						A: 255,
					}))
					i++
				}
			}
		}
		palLUT = lut
	})
	return palLUT, palRGB
}

func clamp255(v int32) int32 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return v
}

// paletted mengkonversi RGBA ke *image.Paletted (256 colors) yang dibutuhkan
// oleh image/gif. Pakai Floyd-Steinberg dithering biar gradasi (kulit, langit)
// tidak banding parah.
//
// Ditulis manual (bukan xdraw.FloydSteinberg) semata demi kecepatan: algoritma
// difusi errornya sama persis, yang diganti hanya cara mencari warna terdekat —
// lewat paletteLUT, bukan pemindaian linear 256 entri per pixel.
//
// Asumsi: src opaque. Semua frame GIF di sini memang begitu (slideshow mengisi
// background dulu; kanvas GIF live berbasis framed strip yang opaque).
func paletted(src *image.RGBA) *image.Paletted {
	bounds := src.Bounds()
	pal := standardPalette()
	dst := image.NewPaletted(bounds, pal)

	w, h := bounds.Dx(), bounds.Dy()
	if w <= 0 || h <= 0 {
		return dst
	}
	lut, rgb := paletteLUT()

	// Dua baris akumulator error (baris berjalan & berikutnya), 3 kanal per
	// pixel. Diberi padding 1 pixel di kiri-kanan supaya difusi ke x-1 / x+1
	// di tepi baris tidak perlu dicek batasnya.
	stride := (w + 2) * 3
	cur := make([]int32, stride)
	next := make([]int32, stride)

	for y := 0; y < h; y++ {
		srcOff := src.PixOffset(bounds.Min.X, bounds.Min.Y+y)
		dstOff := dst.PixOffset(bounds.Min.X, bounds.Min.Y+y)

		for x := 0; x < w; x++ {
			i := (x + 1) * 3
			p := srcOff + x*4

			r := clamp255(int32(src.Pix[p+0]) + cur[i+0])
			g := clamp255(int32(src.Pix[p+1]) + cur[i+1])
			b := clamp255(int32(src.Pix[p+2]) + cur[i+2])

			const shift = 8 - palLUTBits
			pi := lut[(r>>shift)<<(2*palLUTBits)|(g>>shift)<<palLUTBits|(b>>shift)]
			dst.Pix[dstOff+x] = pi

			pc := rgb[pi]
			er, eg, eb := r-pc[0], g-pc[1], b-pc[2]

			// Floyd-Steinberg: 7/16 kanan, 3/16 kiri-bawah, 5/16 bawah,
			// 1/16 kanan-bawah.
			cur[i+3] += er * 7 / 16
			cur[i+4] += eg * 7 / 16
			cur[i+5] += eb * 7 / 16

			next[i-3] += er * 3 / 16
			next[i-2] += eg * 3 / 16
			next[i-1] += eb * 3 / 16

			next[i+0] += er * 5 / 16
			next[i+1] += eg * 5 / 16
			next[i+2] += eb * 5 / 16

			next[i+3] += er / 16
			next[i+4] += eg / 16
			next[i+5] += eb / 16
		}

		cur, next = next, cur
		for i := range next {
			next[i] = 0
		}
	}

	return dst
}

// standardPalette pakai websafe palette (216 warna) ditambah grayscale ramp
// dan beberapa warna kulit umum. Cukup buat foto kasual tanpa
// quantize per-frame yang lebih mahal.
var standardPaletteCache color.Palette
var standardPaletteOnce sync.Once

func standardPalette() color.Palette {
	standardPaletteOnce.Do(func() {
		p := make(color.Palette, 0, 256)
		levels := []uint8{0x00, 0x33, 0x66, 0x99, 0xCC, 0xFF}
		for _, r := range levels {
			for _, g := range levels {
				for _, b := range levels {
					p = append(p, color.RGBA{R: r, G: g, B: b, A: 0xFF})
				}
			}
		}
		// Grayscale ramp (40 levels) untuk fotografi kulit & shading.
		for i := 0; i < 40; i++ {
			v := uint8(i * 255 / 39)
			p = append(p, color.RGBA{R: v, G: v, B: v, A: 0xFF})
		}
		standardPaletteCache = p
	})
	return standardPaletteCache
}

// cacheUpToDate: outPath ada & tidak lebih tua dari source mana pun (path
// kosong/gagal stat diabaikan). Cache <100ms dianggap belum stabil.
func cacheUpToDate(outPath string, sourcePaths ...string) bool {
	stat, err := os.Stat(outPath)
	if err != nil {
		return false
	}
	outMod := stat.ModTime()
	for _, p := range sourcePaths {
		if p == "" {
			continue
		}
		s, err := os.Stat(p)
		if err != nil {
			continue
		}
		if s.ModTime().After(outMod) {
			return false
		}
	}
	return time.Since(outMod) >= 100*time.Millisecond
}

// upToDate cek apakah GIF cache masih valid (lebih baru dari semua source).
func upToDate(outPath string, opts GenerateAnimationOptions) bool {
	return cacheUpToDate(outPath, opts.SelectedRawPaths...)
}
