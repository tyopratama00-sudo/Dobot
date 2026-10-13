package routes

import (
	"net/http"
	"photobooth/handlers"
	"photobooth/middleware"
	"strings"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

func Setup(storagePath string) http.Handler {
	r := chi.NewRouter()

	// ─── Global Middleware ────────────────────────────────────────────────────
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.RequestID)
	r.Use(middleware.CORS)

	// ─── Health Check ─────────────────────────────────────────────────────────
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"photobooth"}`))
	})

	// ─── Static File Server ───────────────────────────────────────────────────
	storageFS := http.StripPrefix("/storage/", http.FileServer(http.Dir(storagePath)))
	r.Get("/storage/*", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".db") {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		// Nama file audio stabil tapi isinya bisa diganti → wajibkan revalidasi
		// supaya browser tidak memutar versi lama (foto/frame nama unik, aman).
		if strings.HasPrefix(r.URL.Path, "/storage/audio/") {
			w.Header().Set("Cache-Control", "no-cache")
		}
		storageFS.ServeHTTP(w, r)
	})

	// ─── API Routes ───────────────────────────────────────────────────────────
	r.Route("/api", func(r chi.Router) {

		// ── App config (publik) ─────────────────────────────────────────────
		// Timer halaman user (instruction/photo-editor/get-photos/done) yang
		// diatur admin. Dibaca frontend saat runtime.
		r.Get("/config", handlers.GetAppConfig)

		// Robot runtime tuning (speed/timing) — dibaca service dobot saat start.
		r.Get("/robot-settings", handlers.GetRobotSettings)

		// ── Packages ────────────────────────────────────────────────────────
		r.Get("/package", handlers.GetPackages)

		// ── Session ─────────────────────────────────────────────────────────
		r.Post("/session", handlers.CreateSession)
		r.Post("/session/create", handlers.CreateSession)
		r.Route("/session", func(r chi.Router) {
			r.Get("/{sessionID}", handlers.GetSession)
			r.Get("/create/{sessionID}", handlers.GetSession)
			r.Patch("/{sessionID}/status", handlers.UpdateSessionStatus)
			r.Patch("/create/{sessionID}/status", handlers.UpdateSessionStatus)
		})

		// ── Payment ─────────────────────────────────────────────────────────
		r.Route("/payment", func(r chi.Router) {
			r.Get("/config", handlers.GetPaymentConfig)
			r.Post("/create", handlers.CreatePayment)
			r.Post("/test", handlers.TestPayment)
			r.Post("/", handlers.CreatePayment)
			r.Get("/status/{orderID}", handlers.GetPaymentStatus)
			r.Get("/{orderID}/status", handlers.GetPaymentStatus)
			r.Post("/webhook", handlers.PaymentWebhook)
		})

		// ── Voucher ─────────────────────────────────────────────────────────
		r.Route("/voucher", func(r chi.Router) {
			r.Post("/apply", handlers.ApplyVoucher)
			r.Post("/remove", handlers.RemoveVoucher)
		})

		// ── Photo ───────────────────────────────────────────────────────────
		r.Route("/photo", func(r chi.Router) {
			r.Post("/upload", handlers.UploadPhoto)
			r.Post("/compose", handlers.ComposeFrame)
			r.Post("/print", handlers.PrintComposition)
			r.Get("/session/{sessionID}", handlers.GetSessionPhotos)
			r.Get("/session/{sessionID}/framed", handlers.GetFramedPhotos)
			r.Get("/session/{sessionID}/gif", handlers.DownloadSessionGIF)
			r.Get("/session/{sessionID}/gif-live", handlers.DownloadSessionLiveGIF)
			r.Get("/session/{sessionID}/gif-live/available", handlers.GetSessionLiveGIFAvailable)
			r.Get("/session/{sessionID}/drive", handlers.GetSessionDriveLink)
			r.Get("/download/{photoID}", handlers.DownloadPhoto)
		})

		// ── Frames ──────────────────────────────────────────────────────────
		r.Get("/frames", handlers.GetFrames)

		// ── Robot / Canon Camera ───────────────────────────────────────────
		r.Route("/robot", func(r chi.Router) {
			// Kamera & live view
			r.Get("/status", handlers.GetCameraStatus)
			r.Post("/capture", handlers.RobotCapture)
			r.Get("/liveview", handlers.GetLiveView)
			r.Get("/liveview/stream", handlers.StreamLiveView)
			r.Get("/session/{sessionID}", handlers.GetRobotSessionPhotos)

			// Enable / disable robot via ngrok
			// POST /api/robot/enable  ← dipanggil otomatis setelah payment lunas
			// POST /api/robot/disable ← dipanggil dari frontend saat timer download habis
			r.Post("/enable", handlers.EnableRobot)
			r.Post("/disable", handlers.DisableRobot)

			// Emergency stop
			r.Post("/stop", handlers.StopRobot)

			// Trigger preset gerakan robot
			r.Post("/preset", handlers.TriggerPreset)

			// Robot webhook endpoints
			r.Post("/webhook", handlers.RobotWebhook)
			r.Post("/moving", handlers.RobotMoving)
			r.Post("/move", handlers.RobotMoving) // alias untuk /moving
			r.Post("/done", handlers.RobotDone)

			// Cek konfigurasi robot saat ini
			r.Get("/config", handlers.GetRobotConfig)
		})

		// ── Admin ───────────────────────────────────────────────────────────
		r.Route("/admin", func(r chi.Router) {
			// Login publik (tanpa auth)
			r.Post("/login", handlers.AdminLogin)

			// Diproteksi token admin. Rute sengaja flat supaya cocok dengan path
			// FE tanpa trailing slash; chi menang-kan segmen statis atas /{id}.
			r.Group(func(r chi.Router) {
				r.Use(middleware.AdminAuth)

				r.Get("/dashboard/summary", handlers.GetDashboardSummary)

				// Devices (tes koneksi nyata kamera/printer/robot)
				r.Get("/devices", handlers.AdminGetDevices)

				// Settings — timer halaman user (instruction/photo-editor/
				// get-photos/done). GET baca, PATCH ubah.
				r.Get("/settings", handlers.AdminGetSettings)
				r.Patch("/settings", handlers.AdminUpdateSettings)

				// Settings — tuning robot (speed/akselerasi + sequence/face-tracking
				// timing) yang diteruskan ke service dobot.
				r.Get("/robot-settings", handlers.GetRobotSettings)
				r.Patch("/robot-settings", handlers.AdminUpdateRobotSettings)

				// Packages
				r.Get("/packages", handlers.AdminListPackages)
				r.Post("/packages", handlers.AdminCreatePackage)
				r.Get("/packages/stats", handlers.AdminPackageStats)
				r.Get("/packages/{id}", handlers.AdminGetPackage)
				r.Patch("/packages/{id}", handlers.AdminUpdatePackage)
				r.Delete("/packages/{id}", handlers.AdminDeletePackage)

				// Frames
				r.Get("/frames", handlers.AdminListFrames)
				r.Post("/frames", handlers.AdminCreateFrame)
				r.Get("/frames/stats", handlers.AdminFrameStats)
				r.Get("/frames/{id}", handlers.AdminGetFrame)
				r.Patch("/frames/{id}", handlers.AdminUpdateFrame)
				r.Put("/frames/{id}", handlers.AdminUpdateFrame)
				r.Delete("/frames/{id}", handlers.AdminDeleteFrame)

				// Vouchers ({id} = code)
				r.Get("/vouchers", handlers.AdminListVouchers)
				r.Post("/vouchers", handlers.AdminCreateVoucher)
				r.Get("/vouchers/stats", handlers.AdminVoucherStats)
				r.Get("/vouchers/{id}", handlers.AdminGetVoucher)
				r.Patch("/vouchers/{id}", handlers.AdminUpdateVoucher)
				r.Delete("/vouchers/{id}", handlers.AdminDeleteVoucher)

				// Transactions
				r.Get("/transactions", handlers.AdminListTransactions)
				r.Get("/transactions/stats", handlers.AdminTransactionStats)
				r.Get("/transactions/export", handlers.AdminExportTransactions)
				r.Get("/transactions/{id}", handlers.AdminGetTransaction)
			})
		})

	})

	return r
}
