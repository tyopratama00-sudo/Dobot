// Command probecheck: cek cepat probe kamera/printer/robot pakai .env asli,
// tanpa DB & auth admin. Jalankan dari folder backend: go run ./cmd/probecheck
package main

import (
	"fmt"

	"photobooth/config"
	"photobooth/services"
)

func yesNo(b bool) string {
	if b {
		return "YES"
	}
	return "no"
}

func main() {
	config.Load()
	fmt.Println("=== Device Probe Check ===")
	fmt.Printf("DIGICAM_BASE_URL = %s\n", config.App.DigiCamBaseURL)
	fmt.Printf("ROBOT_API_URL    = %s\n\n", config.App.RobotAPIURL)

	// ─── Kamera (Canon-only) ───────────────────────────────────────────────
	cam, err := services.DetectCanonCamera()
	fmt.Println("[KAMERA] (Canon-only, tanpa fallback builtin)")
	if err == nil && cam != nil && cam.Connected {
		fmt.Printf("  Online : %s  (%s)\n", yesNo(true), cam.CameraName)
	} else {
		fmt.Printf("  Online : %s  (err: %v)\n", yesNo(false), err)
	}

	// ─── Printer (abaikan virtual) ─────────────────────────────────────────
	p := services.GetPrinterStatus()
	fmt.Println("\n[PRINTER] (printer virtual PDF/XPS/OneNote/Fax diabaikan)")
	if p.Found {
		fmt.Printf("  Found  : %s  name=%q status=%q\n", yesNo(true), p.Name, p.Status)
		fmt.Printf("  Online : %s   Ready: %s\n", yesNo(p.Online), yesNo(p.Ready))
	} else {
		fmt.Printf("  Found  : %s  (tidak ada printer fisik → Offline di UI)\n", yesNo(false))
	}

	// ─── Robot (wajib 2xx) ─────────────────────────────────────────────────
	rb := services.PingRobot()
	fmt.Println("\n[ROBOT] (online hanya jika /health atau / membalas 2xx)")
	fmt.Printf("  Configured : %s\n", yesNo(rb.Configured))
	fmt.Printf("  Reachable  : %s  url=%s\n", yesNo(rb.Reachable), rb.URL)
}
