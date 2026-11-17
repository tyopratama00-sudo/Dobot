package handlers

import (
	"bytes"
	"html/template"
)

// resultPage isi satu Halaman Hasil. Semua nama file relatif terhadap folder
// sesi di R2, jadi link-nya tetap benar di domain mana pun bucket dipasang.
type resultPage struct {
	BoothName  string
	Strip      string   // mis. "strip.jpg"; kosong kalau strip belum ada
	Photos     []string // foto raw yang sudah terunggah, urut capture
	GIFs       []string // GIF yang sudah terunggah
	GIFPending bool     // GIF belum selesai: minta pelanggan memuat ulang
}

// Halaman Hasil tampil di domain perusahaan: tanpa script, form, gambar
// base64, atau sumber pihak ketiga. Isinya di-escape html/template.
var resultPageTemplate = template.Must(template.New("hasil").Parse(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foto kamu dari {{.BoothName}}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f4fb;color:#1f1b2e}
main{max-width:640px;margin:0 auto;padding:24px 16px 40px}
h1{font-size:1.4rem;margin:0 0 4px}
p{margin:0 0 16px;color:#5b5670}
h2{font-size:1.05rem;margin:28px 0 10px}
figure{margin:0 0 12px}
img{display:block;max-width:100%;height:auto;border-radius:10px;background:#fff}
.unduh{display:inline-block;margin-top:8px;padding:10px 16px;border-radius:999px;background:#6d3fd8;color:#fff;text-decoration:none;font-weight:600}
.catatan{padding:12px 14px;border-radius:10px;background:#fff6db;color:#5c4400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
</style>
</head>
<body>
<main>
<h1>Foto kamu dari {{.BoothName}}</h1>
<p>Simpan foto yang kamu suka dengan tombol Unduh.</p>
{{if .Strip}}<h2>Strip foto</h2>
<figure><img src="{{.Strip}}" alt="Strip foto"><a class="unduh" href="{{.Strip}}" download>Unduh strip</a></figure>
{{end}}{{if .GIFs}}<h2>GIF</h2>
{{range .GIFs}}<figure><img src="{{.}}" alt="GIF"><a class="unduh" href="{{.}}" download>Unduh GIF</a></figure>
{{end}}{{end}}{{if .GIFPending}}<p class="catatan">GIF sedang disiapkan. Muat ulang halaman ini sebentar lagi.</p>
{{end}}{{if .Photos}}<h2>Semua foto</h2>
<div class="grid">{{range $i, $f := .Photos}}
<figure><img src="{{$f}}" alt="Foto {{$i}}" loading="lazy"><a class="unduh" href="{{$f}}" download>Unduh</a></figure>{{end}}
</div>
{{end}}</main>
</body>
</html>
`))

func renderResultPage(p resultPage) ([]byte, error) {
	var buf bytes.Buffer
	if err := resultPageTemplate.Execute(&buf, p); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
