package intentionalcode

import (
	"fmt"
	"html/template"
	"net/http"
	"path/filepath"
)

type TemplateRenderer interface {
	Render(http.ResponseWriter, string, PageData) error
	RenderStatus(http.ResponseWriter, int, string, PageData) error
}

type PageData struct {
	StatusCode   int
	Title        string
	Description  string
	Time         string
	MarkdownFile string
	BodyHTML     template.HTML
	Headings     []Heading
	NavTitle     string
	Nav          []NavNode
	TopNav       []NavLink
	CurrentPath  string
}

type FileTemplateRenderer struct {
	templates map[string]*template.Template
}

func NewFileTemplateRenderer(layoutPath, pageGlob string) (*FileTemplateRenderer, error) {
	pageFiles, err := filepath.Glob(pageGlob)
	if err != nil {
		return nil, fmt.Errorf("glob templates: %w", err)
	}

	loaded := make(map[string]*template.Template)
	for _, pageFile := range pageFiles {
		if filepath.Clean(pageFile) == filepath.Clean(layoutPath) {
			continue
		}

		base := filepath.Base(pageFile)
		name := base[:len(base)-len(filepath.Ext(base))]
		if _, exists := loaded[name]; exists {
			return nil, fmt.Errorf("duplicate template name: %s", name)
		}

		tpl, parseErr := template.ParseFiles(layoutPath, pageFile)
		if parseErr != nil {
			return nil, fmt.Errorf("parse templates for %s: %w", name, parseErr)
		}
		loaded[name] = tpl
	}

	if len(loaded) == 0 {
		return nil, fmt.Errorf("no page templates found in %s", pageGlob)
	}

	return &FileTemplateRenderer{templates: loaded}, nil
}

func (r *FileTemplateRenderer) Render(w http.ResponseWriter, name string, data PageData) error {
	return r.RenderStatus(w, http.StatusOK, name, data)
}

func (r *FileTemplateRenderer) RenderStatus(w http.ResponseWriter, status int, name string, data PageData) error {
	tpl, ok := r.templates[name]
	if !ok {
		return fmt.Errorf("unknown template: %s", name)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	if err := tpl.ExecuteTemplate(w, "layout", data); err != nil {
		return fmt.Errorf("render template %s: %w", name, err)
	}
	return nil
}
