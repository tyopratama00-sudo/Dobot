package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"photobooth/models"
)

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, models.ErrorResponse(message))
}

// respondInternal mencatat error detail ke log server lalu membalas pesan
// generik ke klien — supaya struktur DB / error internal tidak bocor ke UI.
func respondInternal(w http.ResponseWriter, context string, err error) {
	log.Printf("[error] %s: %v", context, err)
	respondError(w, http.StatusInternalServerError, "Terjadi kesalahan pada server")
}
