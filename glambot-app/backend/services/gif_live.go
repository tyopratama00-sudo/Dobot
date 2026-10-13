package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/png"
	"log"
	"math"
	"os"
	"path/filepath"
	"photobooth/config"
	"regexp"
	"strings"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/math/f64"
)

// GIF #2 ("animated strip"): framed strip sebagai layer dasar + burst frames
// di tiap slot; beberapa frame terakhir polos supaya settle ke hasil final.

const (
	liveGIFWidth      = 448 // dinaikkan dari 320 → strip live lebih tajam
	liveGIFAnimTicks  = 25  // tick yang menampilkan burst overlay
	liveGIFHoldTicks  = 5   // tick terakhir tanpa overlay (settle ke final)
	liveGIFFrameDelay = 10  // 100ths sec → 0.1s per frame ≈ 10 fps
)

// LiveStripPhoto data per-slot untuk generator GIF live.
type LiveStripPhoto struct {
	PhotoID     string
	Position    int
	BurstFrames []string // path absolut burst frames (urut)
}

// LiveStripSlot koordinat slot dari frame design (kanvas asli).
type LiveStripSlot struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	// Shape: "rect" | "ellipse" | "circle". Dipakai untuk masking burst supaya
	// tidak nyembul keluar lubang non-persegi. Default rect kalau kosong.
	Shape string `json:"shape"`
}

// LiveStripSlotTransform zoom/rotate/geser satu slot hasil editan user di
// photo editor, dinyatakan RELATIF terhadap cover-fit slot (bukan pixel
// sumber). Lihat collectSlotTransforms di frontend untuk sisi penghasilnya.
//
// Kenapa relatif: burst frame adalah liveview mentah yang resolusi & aspect-nya
// beda dari foto DSLR yang diedit user. Dengan basis cover-fit, generator cukup
// cover-fit burst dulu lalu terapkan angka di bawah — framing-nya cocok tanpa
// perlu tahu dimensi asli foto yang diedit.
type LiveStripSlotTransform struct {
	Scale   float64 `json:"scale"`   // 1 = persis cover, 2 = zoom 2×
	Angle   float64 `json:"angle"`   // derajat, searah jarum jam
	OffsetX float64 `json:"offsetX"` // geser pusat, dalam satuan lebar slot
	OffsetY float64 `json:"offsetY"` // geser pusat, dalam satuan tinggi slot
}

// identityTransform = foto pas cover di tengah slot, tanpa rotasi. Dipakai
// untuk sesi lama yang belum menyimpan slot_transforms.
var identityTransform = LiveStripSlotTransform{Scale: 1}

// normalized mengembalikan salinan yang aman dipakai: nilai non-finite atau
// skala <= 0 (JSON rusak / sesi lama) jatuh balik ke identitas supaya matriks
// affine-nya tidak pernah singular.
func (t LiveStripSlotTransform) normalized() LiveStripSlotTransform {
	if math.IsNaN(t.Scale) || math.IsInf(t.Scale, 0) || t.Scale <= 0 {
		return identityTransform
	}
	if math.IsNaN(t.Angle) || math.IsInf(t.Angle, 0) {
		t.Angle = 0
	}
	if math.IsNaN(t.OffsetX) || math.IsInf(t.OffsetX, 0) {
		t.OffsetX = 0
	}
	if math.IsNaN(t.OffsetY) || math.IsInf(t.OffsetY, 0) {
		t.OffsetY = 0
	}
	return t
}

// ParseSlotTransformsJSON decode slot_transforms dari kolom sessions. Kolom
// kosong / JSON rusak bukan error fatal — caller lanjut tanpa transform
// (cover-fit polos, perilaku lama).
func ParseSlotTransformsJSON(raw string) []LiveStripSlotTransform {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var out []LiveStripSlotTransform
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		log.Printf("⚠️  slot_transforms invalid, pakai cover-fit: %v", err)
		return nil
	}
	return out
}

// LiveStripOptions parameter generator GIF #2.
type LiveStripOptions struct {
	SessionID       string
	FramedImagePath string // path absolut ke framed strip (base layer)
	FrameSVGPath    string // path absolut ke SVG frame asli; opsional, dipakai
	// hanya untuk cache invalidation (kalau SVG di-update setelah GIF di-cache,
	// regenerate). Frame overlay sendiri diturunkan dari FramedImagePath.
	CanvasWidth  int // dari frames.canvas_width (mis. 464)
	CanvasHeight int // dari frames.canvas_height (mis. 696)
	Slots        []LiveStripSlot
	Photos       []LiveStripPhoto // urut sesuai position; len harus match Slots
	// Transforms hasil editan user per slot, urut slot. Boleh kosong (sesi lama
	// / user tidak mengubah apa-apa) → tiap slot pakai cover-fit polos. Kalau
	// panjangnya tidak match Slots, entri yang kurang juga jatuh ke cover-fit.
	Transforms []LiveStripSlotTransform
	// Filter strip yang dipilih user (mis. "warm", "mono"). Diterapkan ke tiap
	// burst frame supaya animasi konsisten dengan hasil akhir. "" / "original"
	// = tanpa filter.
	Filter string
}

// ParseSlotsJSON decode slots JSONB dari frames table.
func ParseSlotsJSON(raw []byte) ([]LiveStripSlot, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("slots kosong")
	}
	var slots []LiveStripSlot
	if err := json.Unmarshal(raw, &slots); err != nil {
		return nil, err
	}
	return slots, nil
}

// LiveStripOutputPath path file GIF #2. Nama file di-versioned (v14) supaya
// cache dari logic compositing lama otomatis di-skip — naikkan suffix-nya tiap
// kali cara compositing berubah.
func LiveStripOutputPath(sessionID string) string {
	return filepath.Join(
		config.App.StoragePath,
		"sessions", sessionID, "animation-live-v14.gif",
	)
}

// GenerateLiveStripGIF buat animated GIF dimana tiap slot di strip frame
// "hidup" dengan rentetan liveview frame sebelum settle ke foto final.
func GenerateLiveStripGIF(opts LiveStripOptions) (string, error) {
	if opts.SessionID == "" {
		return "", fmt.Errorf("session id wajib")
	}
	if opts.FramedImagePath == "" {
		return "", fmt.Errorf("framed strip path wajib")
	}
	if opts.CanvasWidth <= 0 || opts.CanvasHeight <= 0 {
		return "", fmt.Errorf("canvas dimension invalid")
	}
	if len(opts.Slots) == 0 {
		return "", fmt.Errorf("slots kosong")
	}

	// Lock khusus artefak live strip (bukan per-sesi): GIF #1 menulis file
	// berbeda, jadi keduanya boleh jalan bersamaan. Menyatukan lock-nya bikin
	// request /gif-live dari HP antre di belakang generasi slideshow.
	mu := sessionLock(opts.SessionID + lockKindLive)
	mu.Lock()
	defer mu.Unlock()

	outPath := LiveStripOutputPath(opts.SessionID)
	if liveStripCacheValid(outPath, opts) {
		return outPath, nil
	}

	framedSrc := decodeImage(opts.FramedImagePath)
	if framedSrc == nil {
		return "", fmt.Errorf("gagal decode framed strip")
	}

	// Skala output: 320 wide, tinggi proporsional dengan canvas design.
	outW := liveGIFWidth
	outH := outW * opts.CanvasHeight / opts.CanvasWidth

	framedScaled := image.NewRGBA(image.Rect(0, 0, outW, outH))
	xdraw.CatmullRom.Scale(
		framedScaled, framedScaled.Bounds(),
		framedSrc, framedSrc.Bounds(),
		xdraw.Over, nil,
	)

	// Skala koordinat slot dari design coords (canvas_width × canvas_height)
	// ke output coords.
	scaleX := float64(outW) / float64(opts.CanvasWidth)
	scaleY := float64(outH) / float64(opts.CanvasHeight)
	slotRects := make([]image.Rectangle, 0, len(opts.Slots))
	slotShapes := make([]string, 0, len(opts.Slots))
	for _, s := range opts.Slots {
		x0 := int(s.X * scaleX)
		y0 := int(s.Y * scaleY)
		x1 := int((s.X + s.Width) * scaleX)
		y1 := int((s.Y + s.Height) * scaleY)
		slotRects = append(slotRects, image.Rect(x0, y0, x1, y1))
		slotShapes = append(slotShapes, strings.ToLower(strings.TrimSpace(s.Shape)))
	}

	// Frame overlay = TOP layer penutup burst. Utamakan PNG yang di-embed di
	// SVG frame (alpha asli → dekorasi yang menjuntai ke area foto tetap di
	// depan burst); kalau SVG vector murni, fall back clone-and-punch.
	var frameOverlay *image.RGBA
	if opts.FrameSVGPath != "" {
		if raw := loadFrameOverlayPNG(opts.FrameSVGPath, opts.CanvasWidth, opts.CanvasHeight); raw != nil {
			frameOverlay = image.NewRGBA(image.Rect(0, 0, outW, outH))
			xdraw.CatmullRom.Scale(
				frameOverlay, frameOverlay.Bounds(),
				raw, raw.Bounds(),
				xdraw.Over, nil,
			)
		}
	}
	if frameOverlay == nil {
		frameOverlay = buildFrameOverlay(framedScaled, slotRects, slotShapes)
	}

	// Pre-load burst frames per photo (decode sekali, pakai berulang).
	type loadedBurst struct {
		frames []image.Image
	}
	bursts := make([]loadedBurst, len(opts.Photos))
	totalBurstFound := 0
	applyFilter := opts.Filter != "" && opts.Filter != "original"
	for i, ph := range opts.Photos {
		for _, p := range ph.BurstFrames {
			img := decodeImage(p)
			if img != nil {
				// Terapkan filter strip yang sama dengan hasil akhir supaya
				// burst di animasi tidak "beda warna" dengan foto final.
				if applyFilter {
					img = ApplyStripFilter(img, opts.Filter)
				}
				bursts[i].frames = append(bursts[i].frames, img)
			}
		}
		totalBurstFound += len(bursts[i].frames)
	}

	// Kalau tidak ada burst sama sekali, GIF #2 jadi tidak ada gunanya
	// (tinggal static strip). Bail out.
	if totalBurstFound == 0 {
		return "", fmt.Errorf("tidak ada burst frame untuk session %s — GIF live tidak tersedia", opts.SessionID)
	}

	if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}

	images := make([]*image.Paletted, 0, liveGIFAnimTicks+liveGIFHoldTicks)
	delays := make([]int, 0, liveGIFAnimTicks+liveGIFHoldTicks)

	// Animasi: tick 0..liveGIFAnimTicks-1 → overlay burst di slot
	for tick := 0; tick < liveGIFAnimTicks; tick++ {
		canvas := image.NewRGBA(framedScaled.Bounds())
		draw.Draw(canvas, canvas.Bounds(), framedScaled, image.Point{}, draw.Src)

		for i, slot := range slotRects {
			// HANYA burst milik slot ini. Slot tanpa burst dibiarkan diam
			// menampilkan foto finalnya — ditambal burst foto lain bikin slot
			// tampak tertukar dibanding hasil akhir.
			if i >= len(bursts) || len(bursts[i].frames) == 0 {
				continue
			}
			frames := bursts[i].frames
			// Pilih burst frame proporsional dengan progress tick.
			idx := tick * len(frames) / liveGIFAnimTicks
			if idx >= len(frames) {
				idx = len(frames) - 1
			}
			// Dua masker: area transparan frameOverlay (biar tidak menimpa
			// dekorasi) + bentuk slot (biar tidak nyembul ke sudut rect).
			shape := ""
			if i < len(slotShapes) {
				shape = slotShapes[i]
			}
			// Zoom/rotate/geser yang user set di editor untuk slot ini; slot di
			// luar jangkauan Transforms pakai cover-fit polos.
			tf := identityTransform
			if i < len(opts.Transforms) {
				tf = opts.Transforms[i].normalized()
			}
			drawBurstMasked(canvas, slot, shape, frames[idx], frameOverlay, tf)
		}

		// Pasang frame design di atas burst supaya dekorasi frame (border,
		// pattern atas/bawah) tetap di depan foto burst — konsisten dengan
		// settle state yang ambil framedScaled apa adanya.
		draw.Draw(canvas, canvas.Bounds(), frameOverlay, image.Point{}, draw.Over)

		images = append(images, paletted(canvas))
		delays = append(delays, liveGIFFrameDelay)
	}

	// Hold: settle ke framed strip (overlay dilepas → foto final terlihat).
	for h := 0; h < liveGIFHoldTicks; h++ {
		images = append(images, paletted(framedScaled))
		// Frame terakhir di-hold paling lama biar terasa "selesai".
		delay := liveGIFFrameDelay
		if h == liveGIFHoldTicks-1 {
			delay = 60
		}
		delays = append(delays, delay)
	}

	anim := &gif.GIF{
		Image:     images,
		Delay:     delays,
		LoopCount: 0,
	}
	if err := writeGIFAtomic(outPath, anim); err != nil {
		return "", err
	}

	log.Printf("🎞️  Live strip GIF for session %s (%d frames, %d burst sources) → %s",
		opts.SessionID, len(images), totalBurstFound, outPath)
	return outPath, nil
}

// drawBurstMasked menggambar burst hanya di pixel tempat frameOverlay
// transparan (lubang foto), jadi burst selalu di BELAKANG dekorasi frame
// apa pun bentuk lubangnya.
func drawBurstMasked(dst *image.RGBA, rect image.Rectangle, shape string, src image.Image, overlay *image.RGBA, tf LiveStripSlotTransform) {
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return
	}
	// Render burst ke buffer sementara seukuran rect.
	tmp := image.NewRGBA(rect)
	drawCoverTransformed(tmp, rect, src, tf)

	// Slot oval/lingkaran → burst dibatasi ke dalam elips (pakai persamaan
	// elips ternormalisasi), supaya tidak nyembul ke sudut rect.
	ellipse := shape == "ellipse" || shape == "circle"
	cx := (float64(rect.Min.X) + float64(rect.Max.X)) / 2
	cy := (float64(rect.Min.Y) + float64(rect.Max.Y)) / 2
	rx := float64(rect.Dx()) / 2
	ry := float64(rect.Dy()) / 2

	clip := rect.Intersect(dst.Bounds()).Intersect(overlay.Bounds())
	for y := clip.Min.Y; y < clip.Max.Y; y++ {
		for x := clip.Min.X; x < clip.Max.X; x++ {
			// Di luar elips slot → lewati (jaga sudut rect tetap kosong).
			if ellipse && rx > 0 && ry > 0 {
				nx := (float64(x) + 0.5 - cx) / rx
				ny := (float64(y) + 0.5 - cy) / ry
				if nx*nx+ny*ny > 1.0 {
					continue
				}
			}
			// Overlay transparan di sini = lubang foto → boleh gambar burst.
			if overlay.RGBAAt(x, y).A >= 128 {
				continue
			}
			// Burst yang dirotasi/di-geser bisa menyisakan pixel kosong atau
			// setengah-transparan di pinggir. Hanya pixel yang benar-benar solid
			// yang boleh menimpa; sisanya biarkan foto final dari framed strip
			// yang terlihat — jauh lebih rapi daripada fringe gelap 1px.
			px := tmp.RGBAAt(x, y)
			if px.A < 250 {
				continue
			}
			dst.SetRGBA(x, y, px)
		}
	}
}

// drawCoverTransformed gambar src ke rect dengan "cover" semantics (penuhi
// rect, crop yang melebar — mirip object-fit: cover di CSS), lalu terapkan
// zoom/rotate/geser hasil editan user DI ATAS cover itu.
//
// Basis cover ini yang bikin transform dari editor tetap valid walau burst
// frame (liveview) resolusi & aspect-nya beda dari foto DSLR yang diedit:
// keduanya sama-sama diukur dari titik "pas menutupi slot".
//
// tf identitas (Scale 1, sisanya 0) menghasilkan cover-fit polos — perilaku
// lama sebelum fitur ini, dipakai sesi yang belum punya slot_transforms.
func drawCoverTransformed(
	dst *image.RGBA,
	rect image.Rectangle,
	src image.Image,
	tf LiveStripSlotTransform,
) {
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return
	}
	sb := src.Bounds()
	if sb.Dx() <= 0 || sb.Dy() <= 0 {
		return
	}

	rectW := float64(rect.Dx())
	rectH := float64(rect.Dy())
	srcW := float64(sb.Dx())
	srcH := float64(sb.Dy())

	// Skala cover: src harus menutupi rect di kedua sumbu.
	cover := math.Max(rectW/srcW, rectH/srcH)

	// Rotasi butuh src lebih besar supaya sudut rect tidak bocor. Rumusnya sama
	// dengan minCoverScale di frontend (slotTransform.ts): untuk menutupi rect
	// w×h pada sudut θ, src harus menutupi bounding box rect yang diputar balik.
	rad := tf.Angle * math.Pi / 180
	cos, sin := math.Abs(math.Cos(rad)), math.Abs(math.Sin(rad))
	needCover := math.Max(
		(rectW*cos+rectH*sin)/srcW,
		(rectW*sin+rectH*cos)/srcH,
	)
	scale := math.Max(cover*tf.Scale, needCover)

	// Titik tengah tujuan = tengah rect + geseran user (offset dalam satuan
	// dimensi slot, jadi dikali lebar/tinggi rect di ruang output).
	cx := float64(rect.Min.X) + rectW/2 + tf.OffsetX*rectW
	cy := float64(rect.Min.Y) + rectH/2 + tf.OffsetY*rectH

	// Pusat src — dipakai dua jalur di bawah.
	scx := srcW/2 + float64(sb.Min.X)
	scy := srcH/2 + float64(sb.Min.Y)

	// ── JALUR CEPAT: tanpa rotasi ────────────────────────────────────────
	// Tanpa rotasi ini cuma skala + geser, dan itu tugasnya Scale yang
	// separable (dua pass 1-D). Kernel.Transform di x/image TIDAK punya
	// fast-path ke Scale — matriks tanpa rotasi pun tetap lewat jalur
	// non-separable yang jauh lebih mahal. Zoom & geser jauh lebih sering
	// dipakai daripada rotate, jadi jalur ini yang menanggung mayoritas frame.
	if math.Mod(tf.Angle, 360) == 0 {
		// Balik arah pemetaan: dst = (src - pusatSrc)·scale + (cx, cy),
		// jadi src = (dst - (cx, cy))/scale + pusatSrc.
		toSrcX := func(dx float64) float64 { return (dx-cx)/scale + scx }
		toSrcY := func(dy float64) float64 { return (dy-cy)/scale + scy }
		toDstX := func(sx float64) float64 { return (sx-scx)*scale + cx }
		toDstY := func(sy float64) float64 { return (sy-scy)*scale + cy }

		// Crop WAJIB di dalam bounds src. Lewat satu pixel saja — gampang
		// terjadi hanya gara-gara pembulatan — x/image membuang jalur
		// per-tipe-nya dan jatuh ke scaleX_Image generic yang ~4× lebih lambat.
		//
		// Jadi crop di-clamp, DAN rect tujuannya dipetakan ulang dari crop yang
		// sudah ter-clamp. Meng-clamp crop saja akan menggepengkan gambar;
		// memetakan keduanya menjaga skala tetap benar. Sisa dst yang tak
		// tergambar tetap transparan → ditambal guard alpha di pemanggil.
		sx0 := math.Max(toSrcX(float64(rect.Min.X)), float64(sb.Min.X))
		sy0 := math.Max(toSrcY(float64(rect.Min.Y)), float64(sb.Min.Y))
		sx1 := math.Min(toSrcX(float64(rect.Max.X)), float64(sb.Max.X))
		sy1 := math.Min(toSrcY(float64(rect.Max.Y)), float64(sb.Max.Y))

		crop := image.Rect(
			int(math.Round(sx0)), int(math.Round(sy0)),
			int(math.Round(sx1)), int(math.Round(sy1)),
		).Intersect(sb)
		dr := image.Rect(
			int(math.Round(toDstX(sx0))), int(math.Round(toDstY(sy0))),
			int(math.Round(toDstX(sx1))), int(math.Round(toDstY(sy1))),
		).Intersect(rect)

		if crop.Dx() > 0 && crop.Dy() > 0 && dr.Dx() > 0 && dr.Dy() > 0 {
			xdraw.CatmullRom.Scale(dst, dr, src, crop, xdraw.Src, nil)
			return
		}
	}

	// ── JALUR ROTASI ─────────────────────────────────────────────────────
	// Matriks affine src→dst: translate ke titik tengah src, skala, rotasi,
	// lalu pindahkan ke (cx, cy). Ditulis sudah dalam bentuk terkomposisi;
	// kolom ketiga bikin titik tengah src mendarat tepat di (cx, cy).
	sc, ss := math.Cos(rad), math.Sin(rad)
	a := scale * sc
	b := -scale * ss
	c := scale * ss
	d := scale * sc
	m := f64.Aff3{
		a, b, cx - (a*scx + b*scy),
		c, d, cy - (c*scx + d*scy),
	}

	// dst di sini adalah buffer per-slot yang bounds-nya persis rect, jadi
	// Transform otomatis ter-clip ke slot — burst yang di-zoom besar tidak
	// mungkin menodai slot tetangga.
	xdraw.CatmullRom.Transform(dst, m, src, sb, xdraw.Src, nil)
}

// frameEmbeddedPNGRe menangkap base64 PNG di dalam SVG frame
// (xlink:href="data:image/png;base64,...") — PNG itu yang punya window
// transparan di posisi foto berikut dekorasinya.
var frameEmbeddedPNGRe = regexp.MustCompile(`xlink:href="data:image/png;base64,([^"]+)"`)

// loadFrameOverlayPNG extract PNG dari SVG frame lalu render ke ukuran canvas;
// hasilnya RGBA dengan alpha asli. Return nil kalau SVG vector murni / decode
// gagal — caller wajib fall back ke buildFrameOverlay.
func loadFrameOverlayPNG(svgPath string, canvasW, canvasH int) *image.RGBA {
	data, err := os.ReadFile(svgPath)
	if err != nil {
		log.Printf("⚠️  frame overlay: baca SVG %s: %v", svgPath, err)
		return nil
	}
	match := frameEmbeddedPNGRe.FindSubmatch(data)
	if match == nil {
		// Bukan SVG embed-PNG → coba decode sebagai .png biasa (frame upload
		// admin sudah punya alpha asli), di-scale penuh ke canvas tanpa tiling.
		if pngImg, derr := png.Decode(bytes.NewReader(data)); derr == nil {
			overlay := image.NewRGBA(image.Rect(0, 0, canvasW, canvasH))
			xdraw.CatmullRom.Scale(overlay, overlay.Bounds(),
				pngImg, pngImg.Bounds(), xdraw.Over, nil)
			return overlay
		}
		// SVG vector murni: pakai sibling "<base>.png" hasil render offline kalau
		// ada — buildFrameOverlay melubangi seluruh slot jadi dekorasi di dalam
		// window foto hilang. Tidak ada sibling → caller fallback.
		if sib := siblingOverlayPNG(svgPath); sib != "" {
			if raw, rerr := os.ReadFile(sib); rerr == nil {
				if pngImg, derr := png.Decode(bytes.NewReader(raw)); derr == nil {
					overlay := image.NewRGBA(image.Rect(0, 0, canvasW, canvasH))
					xdraw.CatmullRom.Scale(overlay, overlay.Bounds(),
						pngImg, pngImg.Bounds(), xdraw.Over, nil)
					return overlay
				}
			}
		}
		return nil
	}
	// Buang whitespace dari base64 — jaga-jaga SVG di-format multi-line.
	b64 := strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == ' ' || r == '\t' {
			return -1
		}
		return r
	}, string(match[1]))
	pngBytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		log.Printf("⚠️  frame overlay: base64 decode %s: %v", svgPath, err)
		return nil
	}
	pngImg, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		log.Printf("⚠️  frame overlay: png decode %s: %v", svgPath, err)
		return nil
	}

	// SVG asli memasang PNG di dua <rect> setengah-kanvas; yang kiri pakai
	// transform matrix(-1 0 0 1 …) alias di-mirror. Backend wajib meniru,
	// kalau tidak lubang & dekorasi sisi kiri geser → burst bocor.
	overlay := image.NewRGBA(image.Rect(0, 0, canvasW, canvasH))
	halfW := canvasW / 2

	// Kanan: PNG apa adanya.
	xdraw.CatmullRom.Scale(overlay, image.Rect(halfW, 0, canvasW, canvasH),
		pngImg, pngImg.Bounds(), xdraw.Over, nil)

	// Kiri: render PNG ke buffer setengah-lebar, lalu salin ter-mirror
	// horizontal ke separuh kiri overlay (replikasi matrix(-1 0 0 1 …)).
	left := image.NewRGBA(image.Rect(0, 0, halfW, canvasH))
	xdraw.CatmullRom.Scale(left, left.Bounds(),
		pngImg, pngImg.Bounds(), xdraw.Over, nil)
	for y := 0; y < canvasH; y++ {
		for x := 0; x < halfW; x++ {
			overlay.SetRGBA(halfW-1-x, y, left.RGBAAt(x, y))
		}
	}
	return overlay
}

// siblingOverlayPNG return path "<base>.png" di sebelah file SVG (hasil render
// offline, harus ikut di-deploy), atau "" kalau tidak ada.
func siblingOverlayPNG(svgPath string) string {
	if !strings.EqualFold(filepath.Ext(svgPath), ".svg") {
		return ""
	}
	sib := svgPath[:len(svgPath)-len(filepath.Ext(svgPath))] + ".png"
	if _, err := os.Stat(sib); err == nil {
		return sib
	}
	return ""
}

// buildFrameOverlay bikin overlay dari framed strip: clone, lalu transparankan
// semua pixel di dalam slot rect. Fallback untuk SVG vector murni; limitasinya
// dekorasi yang nempel DI DALAM slot rect ikut hilang.
func buildFrameOverlay(framed *image.RGBA, slotRects []image.Rectangle, slotShapes []string) *image.RGBA {
	overlay := image.NewRGBA(framed.Bounds())
	draw.Draw(overlay, overlay.Bounds(), framed, image.Point{}, draw.Src)
	transparent := color.RGBA{}
	for idx, rect := range slotRects {
		shape := ""
		if idx < len(slotShapes) {
			shape = slotShapes[idx]
		}
		ellipse := shape == "ellipse" || shape == "circle"
		cx := (float64(rect.Min.X) + float64(rect.Max.X)) / 2
		cy := (float64(rect.Min.Y) + float64(rect.Max.Y)) / 2
		rx := float64(rect.Dx()) / 2
		ry := float64(rect.Dy()) / 2
		clipped := rect.Intersect(overlay.Bounds())
		for y := clipped.Min.Y; y < clipped.Max.Y; y++ {
			for x := clipped.Min.X; x < clipped.Max.X; x++ {
				// Untuk slot oval/lingkaran, hanya lubangi pixel DI DALAM oval
				// supaya dekorasi di sudut (ornamen, ring) tetap ada di overlay
				// dan tampil di depan burst.
				if ellipse && rx > 0 && ry > 0 {
					nx := (float64(x) + 0.5 - cx) / rx
					ny := (float64(y) + 0.5 - cy) / ry
					if nx*nx+ny*ny > 1.0 {
						continue
					}
				}
				overlay.SetRGBA(x, y, transparent)
			}
		}
	}
	return overlay
}

func liveStripCacheValid(outPath string, opts LiveStripOptions) bool {
	sources := []string{opts.FramedImagePath, opts.FrameSVGPath}
	for _, ph := range opts.Photos {
		sources = append(sources, ph.BurstFrames...)
	}
	return cacheUpToDate(outPath, sources...)
}
