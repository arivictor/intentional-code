package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"time"
)

type HandlerFunc func(http.ResponseWriter, *http.Request) error
type Middleware func(http.Handler) http.Handler

type App struct {
    mux         *http.ServeMux
    middlewares []Middleware
}

type PageData struct {
    Title string
    Time  string
}

var templates = mustBuildTemplates()

func NewApp() *App {
    return &App{
        mux: http.NewServeMux(),
    }
}

func (a *App) Use(mw Middleware) {
    a.middlewares = append(a.middlewares, mw)
}

func (a *App) Handle(method, path string, h HandlerFunc) {
    base := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != method {
            writeJSON(w, http.StatusMethodNotAllowed, map[string]string{
                "error": "method not allowed",
            })
            return
        }

        if err := h(w, r); err != nil {
            var badReq *BadRequestError
            if errors.As(err, &badReq) {
                writeJSON(w, http.StatusBadRequest, map[string]string{
                    "error": badReq.Error(),
                })
                return
            }

            log.Printf("internal error on %s %s: %v", r.Method, r.URL.Path, err)
            writeJSON(w, http.StatusInternalServerError, map[string]string{
                "error": "internal server error",
            })
        }
    })

    a.mux.Handle(path, a.chain(base))
}

func (a *App) chain(h http.Handler) http.Handler {
    for i := len(a.middlewares) - 1; i >= 0; i-- {
        h = a.middlewares[i](h)
    }
    return h
}

func (a *App) Run(addr string) error {
    server := &http.Server{
        Addr:              addr,
        Handler:           a.mux,
        ReadHeaderTimeout: 5 * time.Second,
    }
    log.Printf("listening on %s", addr)
    return server.ListenAndServe()
}

type BadRequestError struct {
    Message string
}

func (e *BadRequestError) Error() string {
    return e.Message
}

func writeJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(v)
}

func writeHTML(w http.ResponseWriter, name string, data PageData) error {
    w.Header().Set("Content-Type", "text/html; charset=utf-8")
    tpl, ok := templates[name]
    if !ok {
        return fmt.Errorf("unknown template: %s", name)
    }

    if err := tpl.ExecuteTemplate(w, "layout", data); err != nil {
        return fmt.Errorf("render template %s: %w", name, err)
    }
    return nil
}

func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start))
    })
}

func mustBuildTemplates() map[string]*template.Template {
    pages := map[string]string{
        "home":  "templates/home.html",
        "about": "templates/about.html",
    }

    loaded := make(map[string]*template.Template, len(pages))
    for name, pageFile := range pages {
        loaded[name] = template.Must(template.ParseFiles("templates/layout.html", pageFile))
    }

    return loaded
}

func main() {
    app := NewApp()
    app.Use(loggingMiddleware)

    app.Handle(http.MethodGet, "/", func(w http.ResponseWriter, r *http.Request) error {
        return writeHTML(w, "home", PageData{
            Title: "Home",
            Time:  time.Now().UTC().Format(time.RFC3339),
        })
    })

    app.Handle(http.MethodGet, "/about", func(w http.ResponseWriter, r *http.Request) error {
        return writeHTML(w, "about", PageData{
            Title: "About",
            Time:  time.Now().UTC().Format(time.RFC3339),
        })
    })

	app.Handle(http.MethodGet, "/go/pattern/creational", func(w http.ResponseWriter, r *http.Request) error {
        writeJSON(w, http.StatusOK, map[string]any{
            "status": "ok",
            "time":   time.Now().UTC().Format(time.RFC3339),
        })
        return nil
    })

    // Route 1: GET /health
    app.Handle(http.MethodGet, "/health", func(w http.ResponseWriter, r *http.Request) error {
        writeJSON(w, http.StatusOK, map[string]any{
            "status": "ok",
            "time":   time.Now().UTC().Format(time.RFC3339),
        })
        return nil
    })

    // Route 2: POST /echo
    app.Handle(http.MethodPost, "/echo", func(w http.ResponseWriter, r *http.Request) error {
        var body map[string]any
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
            return &BadRequestError{Message: fmt.Sprintf("invalid JSON: %v", err)}
        }

        writeJSON(w, http.StatusOK, map[string]any{
            "echo": body,
        })
        return nil
    })

    if err := app.Run(":8080"); err != nil {
        log.Fatal(err)
    }
}