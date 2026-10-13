package middleware

import (
	"encoding/json"
	"net/http"
	"strings"

	"photobooth/auth"
)

// AdminAuth memproteksi route admin: butuh header "Authorization: Bearer <token>".
func AdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			unauthorized(w, "Token tidak ditemukan")
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		if _, err := auth.VerifyToken(token); err != nil {
			unauthorized(w, "Sesi tidak valid atau kedaluwarsa")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func unauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]any{"success": false, "error": msg, "message": msg})
}
