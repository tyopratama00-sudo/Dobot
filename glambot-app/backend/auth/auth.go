// Package auth: hash password (sha256+salt) & token HMAC-SHA256 bergaya JWT,
// tanpa dependency eksternal. Untuk produksi pertimbangkan bcrypt/argon2.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"photobooth/config"
)

var ErrInvalidToken = errors.New("token tidak valid")

// ─── Password hashing ────────────────────────────────────────────────────────

// HashPassword menghasilkan string "saltHex$hashHex".
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	sum := sha256.Sum256(append(salt, []byte(password)...))
	return hex.EncodeToString(salt) + "$" + hex.EncodeToString(sum[:]), nil
}

// VerifyPassword membandingkan password plaintext dengan hash "saltHex$hashHex".
func VerifyPassword(stored, password string) bool {
	parts := strings.SplitN(stored, "$", 2)
	if len(parts) != 2 {
		return false
	}
	salt, err := hex.DecodeString(parts[0])
	if err != nil {
		return false
	}
	want, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	sum := sha256.Sum256(append(salt, []byte(password)...))
	return subtle.ConstantTimeCompare(sum[:], want) == 1
}

// ─── Token (HMAC-SHA256) ─────────────────────────────────────────────────────

type Claims struct {
	AdminID int64  `json:"sub"`
	Email   string `json:"email"`
	Exp     int64  `json:"exp"` // unix seconds
}

func secret() []byte {
	if config.App != nil && config.App.JWTSecret != "" {
		return []byte(config.App.JWTSecret)
	}
	return []byte("glambot-dev-secret-change-me")
}

func sign(payload string) string {
	mac := hmac.New(sha256.New, secret())
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// GenerateToken membuat token berlaku 24 jam.
func GenerateToken(adminID int64, email string) (string, error) {
	claims := Claims{AdminID: adminID, Email: email, Exp: time.Now().Add(24 * time.Hour).Unix()}
	raw, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return payload + "." + sign(payload), nil
}

// VerifyToken memvalidasi tanda tangan & masa berlaku, mengembalikan claims.
func VerifyToken(token string) (*Claims, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return nil, ErrInvalidToken
	}
	expected := sign(parts[0])
	if subtle.ConstantTimeCompare([]byte(expected), []byte(parts[1])) != 1 {
		return nil, ErrInvalidToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, ErrInvalidToken
	}
	var claims Claims
	if err := json.Unmarshal(raw, &claims); err != nil {
		return nil, ErrInvalidToken
	}
	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token kedaluwarsa")
	}
	return &claims, nil
}
