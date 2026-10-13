package services

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// Mencetak file gambar ke printer foto FISIK yang terdeteksi OS. Sengaja
// memakai jalur print bawaan OS (bukan SDK printer vendor) supaya tidak
// bergantung pada merk tertentu — cukup untuk alur "tekan tombol → cetak".

// PrintFile cetak `copies` salinan ke printer fisik, hanya kalau probe
// (sama dengan halaman monitoring) bilang ada printer siap. Selain itu error.
func PrintFile(path string, copies int) error {
	if copies < 1 {
		copies = 1
	}

	p := GetPrinterStatus()
	if !p.Found {
		return fmt.Errorf("tidak ada printer fisik terdeteksi")
	}
	if !p.Ready {
		return fmt.Errorf("printer %q belum siap (status: %s)", p.Name, p.Status)
	}

	switch runtime.GOOS {
	case "windows":
		return printWindows(path, p.Name, copies)
	default:
		return printUnix(path, p.Name, copies)
	}
}

// printWindows cetak senyap via System.Drawing.Printing (PowerShell) dengan
// fit-to-page. `mspaint /pt` dulu bikin hasil kekecilan karena mengikuti DPI
// file (~96) dari export canvas. Rasio frame 2:3 = 4R jadi kertas tetap penuh;
// N salinan diserahkan ke driver lewat PrinterSettings.Copies.
func printWindows(path, printer string, copies int) error {
	scriptPath, cleanup, err := writePrintScript()
	if err != nil {
		return fmt.Errorf("gagal menyiapkan skrip cetak: %w", err)
	}
	defer cleanup()

	// Timeout lebih longgar karena driver bisa lambat memproses; copies > 1
	// dirender driver, bukan loop di sini.
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "powershell",
		"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-File", scriptPath,
		"-ImagePath", path,
		"-Printer", printer,
		"-Copies", fmt.Sprintf("%d", copies),
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("gagal mencetak %d salinan ke %q: %w (%s)",
			copies, printer, err, string(out))
	}
	return nil
}

// printScript: ambil paper size 4x6 dari driver lalu fit gambar ke kotak
// kertas (PageBounds) yang ada di TENGAH surface render — centering inilah
// yang bikin hasil pas edge-to-edge tanpa kepotong.
const printScript = `param(
  [Parameter(Mandatory=$true)][string]$ImagePath,
  [Parameter(Mandatory=$true)][string]$Printer,
  [int]$Copies = 1
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($ImagePath)
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $Printer
  if (-not $doc.PrinterSettings.IsValid) { throw "Printer '$Printer' tidak valid" }
  if ($Copies -lt 1) { $Copies = 1 }
  $doc.PrinterSettings.Copies = $Copies
  $doc.DocumentName = 'Photobooth Strip'
  $doc.DefaultPageSettings.Landscape = $false

  # Pilih paper size 4R/4x6. Borderless DIUTAMAKAN supaya tidak ada strip putih
  # dari hard-margin; baru fallback ke 4x6 biasa kalau borderless tak tersedia.
  $chosen = $null
  $fallback = $null
  foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    $isFourSix = ($ps.Width -eq 400 -and $ps.Height -eq 600) -or
                 ($ps.Width -eq 600 -and $ps.Height -eq 400) -or
                 ($ps.PaperName -match '4.*6|4R|10.*15|102.*152')
    if (-not $isFourSix) { continue }
    if ($null -eq $fallback) { $fallback = $ps }
    if ($ps.PaperName -match 'borderless|borderfree|tanpa batas|full bleed') { $chosen = $ps; break }
  }
  if ($null -eq $chosen) { $chosen = $fallback }
  if ($chosen) {
    $doc.DefaultPageSettings.PaperSize = $chosen
    Write-Output ("PaperSize: {0} ({1}x{2})" -f $chosen.PaperName, $chosen.Width, $chosen.Height)
  } else {
    Write-Output 'PaperSize: (tidak ada 4x6 cocok, pakai default driver)'
  }

  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $doc.OriginAtMargins = $false

  $doc.add_PrintPage({
    param($s, $e)
    $g = $e.Graphics
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $iw = $img.Width; $ih = $img.Height

    # Pada printer borderless, VisibleClipBounds (surface) lebih besar dari
    # PageBounds (kertas) karena zona overscan, dan (0,0) ada di surface — jadi
    # menggambar dari (0,0) bikin gambar melenceng kiri-atas. Offset setengah
    # selisih overscan dulu, baru fit ke kotak kertas.
    $surf = $g.VisibleClipBounds
    $sw = $surf.Width; $sh = $surf.Height
    $pw = $e.PageBounds.Width; $ph = $e.PageBounds.Height
    $offX = ($sw - $pw) / 2; $offY = ($sh - $ph) / 2

    # Fit contain ke kotak kertas. Rasio frame 2:3 == 4R, jadi mengisi penuh
    # kertas edge-to-edge tanpa crop & tanpa strip putih.
    $scale = [Math]::Min($pw / $iw, $ph / $ih)
    $dw = $iw * $scale; $dh = $ih * $scale
    $dx = $offX + ($pw - $dw) / 2
    $dy = $offY + ($ph - $dh) / 2
    $g.DrawImage($img, $dx, $dy, $dw, $dh)

    $e.HasMorePages = $false
  })

  $doc.Print()
} finally {
  $img.Dispose()
}
`

// writePrintScript menulis skrip cetak ke file .ps1 sementara dan mengembalikan
// path-nya beserta fungsi cleanup untuk menghapusnya.
func writePrintScript() (path string, cleanup func(), err error) {
	f, err := os.CreateTemp("", "glambot-print-*.ps1")
	if err != nil {
		return "", func() {}, err
	}
	name := f.Name()
	cleanup = func() { os.Remove(name) }

	if _, err := f.WriteString(printScript); err != nil {
		f.Close()
		cleanup()
		return "", func() {}, err
	}
	if err := f.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return filepath.Clean(name), cleanup, nil
}

// printUnix mencetak via CUPS `lp`. Memaksa media 4x6 dan men-scale gambar
// mengisi penuh kertas (-o fill) supaya hasil fit ke kertas 4R, bukan keluar
// kecil di tengah.
func printUnix(path, printer string, copies int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "lp",
		"-d", printer,
		"-n", fmt.Sprintf("%d", copies),
		"-o", "media=4x6.borderless",
		"-o", "fit-to-page",
		path,
	)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("gagal mencetak ke %q via lp: %w", printer, err)
	}
	return nil
}
