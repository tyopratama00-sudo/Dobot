package middleware

import (
	"net/http"
	"net/url"
	"photobooth/config"
	"strconv"
	"strings"

	chiCors "github.com/go-chi/cors"
)

func CORS(next http.Handler) http.Handler {
	// FRONTEND_URL boleh berisi satu URL atau beberapa dipisahkan koma
	// (mis. "https://app.example.com,https://staging.example.com").
	// Parse sekali saat startup biar tiap request tidak split string lagi.
	configuredOrigins := parseAllowedOrigins(config.App.FrontendURL)

	cors := chiCors.New(chiCors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			if origin == "" {
				return false
			}
			for _, allowed := range configuredOrigins {
				if origin == allowed {
					return true
				}
			}

			u, err := url.Parse(origin)
			if err != nil {
				return false
			}

			host := u.Hostname()
			if host == "localhost" || host == "127.0.0.1" {
				return true
			}
			if strings.HasPrefix(host, "192.168.") || strings.HasPrefix(host, "10.") {
				return true
			}

			parts := strings.Split(host, ".")
			if len(parts) == 4 && parts[0] == "172" {
				if second, err := strconv.Atoi(parts[1]); err == nil {
					return second >= 16 && second <= 31
				}
			}

			return false
		},
		AllowedMethods: []string{
			"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
		},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"X-Session-ID",
		},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	return cors.Handler(next)
}

func parseAllowedOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	return out
}
