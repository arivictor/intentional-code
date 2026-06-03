package intentionalcode

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLayoutAddsErrorLayoutClassForErrorPages(t *testing.T) {
	renderer, err := NewFileTemplateRenderer("templates/layout.html", "templates/*.html")
	if err != nil {
		t.Fatalf("new file template renderer: %v", err)
	}

	rec := httptest.NewRecorder()
	data := PageData{
		StatusCode:  404,
		Title:       "Page not found",
		Description: "The page does not exist.",
	}
	if err := renderer.RenderStatus(rec, 404, "error", data); err != nil {
		t.Fatalf("render error template: %v", err)
	}

	html := rec.Body.String()
	if !strings.Contains(html, `<div class="docs docs--error">`) {
		t.Fatalf("expected error docs layout class, got html: %s", html)
	}
	if !strings.Contains(html, `<section class="errorpage">`) {
		t.Fatalf("expected error page section in html: %s", html)
	}
}
