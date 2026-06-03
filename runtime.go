package intentionalcode

import (
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type App struct {
	ContentDir   string
	LayoutPath   string
	TemplateGlob string
	PublicDir    string
	SidebarDepth int
}

func (a *App) Run(addr string) error {
	dir := a.contentDir()
	renderer, err := NewFileTemplateRenderer(a.layoutPath(), a.templateGlob())
	if err != nil {
		return err
	}

	index, err := BuildContentIndex(dir)
	if err != nil {
		return err
	}
	searchIndex, err := BuildSearchIndex(dir)
	if err != nil {
		return err
	}
	topNav := index.TopNav()

	httpApp := NewServer(HTMLErrorResponder{Renderer: renderer, TopNav: topNav, Logger: log.Default()})
	httpApp.Use(LoggingMiddleware)
	httpApp.Handle("GET", "/api/search", func(w http.ResponseWriter, r *http.Request) error {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 8
		if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
			parsed, parseErr := strconv.Atoi(rawLimit)
			if parseErr == nil {
				if parsed < 1 {
					parsed = 1
				}
				if parsed > 25 {
					parsed = 25
				}
				limit = parsed
			}
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if q == "" {
			return json.NewEncoder(w).Encode(map[string]any{"query": "", "results": []SearchResult{}})
		}

		results := searchIndex.Query(q, limit)
		return json.NewEncoder(w).Encode(map[string]any{"query": q, "results": results})
	})

	landing, err := a.registerContentRoutes(httpApp, renderer, dir, index, topNav)
	if err != nil {
		return err
	}

	// The content dir is mounted at "/". The root index.md (if any) is registered
	// at "/{$}", so "/" stays the catch-all: canonicalize trailing slashes, then
	// serve static assets (favicons, og-image…) from the public dir. The bare-root
	// redirect only fires when there is no root index.md.
	staticFiles := http.FileServer(http.Dir(a.publicDir()))
	// An earlier version redirected "/" -> oldBase (e.g. "/content") with a 301,
	// which browsers cache permanently. Self-heal those clients: clear their cache
	// and bounce to the de-prefixed path. Harmless once no client has the stale 301.
	oldBase := "/" + filepath.ToSlash(strings.Trim(dir, "/"))
	httpApp.Handle("GET", "/", func(w http.ResponseWriter, r *http.Request) error {
		if r.URL.Path == "/" {
			http.Redirect(w, r, landing, http.StatusFound)
			return nil
		}
		if oldBase != "/" && (r.URL.Path == oldBase || strings.HasPrefix(r.URL.Path, oldBase+"/")) {
			target := strings.TrimPrefix(r.URL.Path, oldBase)
			if target == "" {
				target = "/"
			}
			w.Header().Set("Clear-Site-Data", `"cache"`)
			http.Redirect(w, r, target, http.StatusFound)
			return nil
		}
		if p := r.URL.Path; len(p) > 1 && strings.HasSuffix(p, "/") {
			target := strings.TrimRight(p, "/")
			if target == "" {
				target = "/"
			}
			if r.URL.RawQuery != "" {
				target += "?" + r.URL.RawQuery
			}
			http.Redirect(w, r, target, http.StatusFound)
			return nil
		}

		exists, existsErr := staticFileExists(a.publicDir(), r.URL.Path)
		if existsErr != nil {
			return existsErr
		}
		if exists {
			staticFiles.ServeHTTP(w, r)
			return nil
		}

		return &HTTPError{Status: http.StatusNotFound, Message: "page not found"}
	})

	return httpApp.Run(addr)
}

func (a *App) registerContentRoutes(app *Server, renderer *FileTemplateRenderer, dir string, index *ContentIndex, topNav []NavLink) (string, error) {
	cleanDir := filepath.Clean(dir)
	service := NewMarkdownService(StdlibMarkdownRenderer{}, cleanDir)
	depth := a.sidebarDepth()
	registered := map[string]string{}

	err := filepath.WalkDir(cleanDir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() || filepath.Ext(path) != ".md" {
			return nil
		}

		rel, relErr := filepath.Rel(cleanDir, path)
		if relErr != nil {
			return relErr
		}

		serviceSlug := strings.TrimSuffix(filepath.ToSlash(rel), filepath.Ext(rel))
		routePath := buildRoutePath(serviceSlug)

		// An index.md serves at its folder path ("/go/philosophy"), not at
		// "/go/philosophy/index"; the content-root index.md serves at "/".
		pageRoute := routePath
		if strings.HasSuffix(routePath, "/index") {
			pageRoute = strings.TrimSuffix(routePath, "/index")
			if pageRoute == "" {
				pageRoute = "/"
			}
		}

		if existing, exists := registered[pageRoute]; exists {
			return fmt.Errorf("route collision for %s between %s and %s", pageRoute, existing, path)
		}
		registered[pageRoute] = path

		// The root index registers at "/{$}" (exact root) so the subtree "/" stays
		// the static/catch-all handler.
		registerPath := pageRoute
		if registerPath == "/" {
			registerPath = "/{$}"
		}

		pageTitle := pageTitleFromSlug(serviceSlug)
		app.Handle("GET", registerPath, func(w http.ResponseWriter, r *http.Request) error {
			page, renderErr := service.LoadAndRender(serviceSlug)
			if renderErr != nil {
				if errors.Is(renderErr, ErrMarkdownNotFound) {
					return &HTTPError{Status: 404, Message: "content page not found"}
				}
				if errors.Is(renderErr, ErrInvalidMarkdownPath) {
					return &BadRequestError{Message: "invalid content path"}
				}
				return renderErr
			}

			title := page.Title
			if strings.TrimSpace(title) == "" {
				title = pageTitle
			}

			navTitle, nav := index.Sidebar(pageRoute, depth)

			return renderer.Render(w, "markdown", PageData{
				Title:        title,
				Description:  page.Description,
				Time:         time.Now().UTC().Format(time.RFC3339),
				MarkdownFile: page.Path,
				BodyHTML:     template.HTML(page.HTML),
				Headings:     page.Headings,
				NavTitle:     navTitle,
				Nav:          nav,
				TopNav:       topNav,
				CurrentPath:  pageRoute,
			})
		})

		return nil
	})
	if err != nil {
		return "", err
	}

	if len(registered) == 0 {
		return "", fmt.Errorf("no markdown files found in content dir %s", cleanDir)
	}

	return landingRoute(registered), nil
}

// landingRoute is only used as the bare-root fallback when there is no root
// index.md: it prefers "/" (the content-root index) and otherwise sends visitors
// to the lexically first registered route.
func landingRoute(registered map[string]string) string {
	if _, ok := registered["/"]; ok {
		return "/"
	}

	routes := make([]string, 0, len(registered))
	for route := range registered {
		routes = append(routes, route)
	}
	sort.Strings(routes)
	if len(routes) == 0 {
		return "/"
	}
	return routes[0]
}

// buildRoutePath mounts the content dir at the site root: the dir name does not
// appear in the URL, so "go/about" -> "/go/about" and "" -> "/".
func buildRoutePath(serviceSlug string) string {
	slug := strings.Trim(strings.TrimSpace(serviceSlug), "/")
	if slug == "" {
		return "/"
	}
	return "/" + slug
}

func pageTitleFromSlug(slug string) string {
	parts := strings.Split(strings.TrimSpace(slug), "/")
	if len(parts) == 0 {
		return "Content"
	}
	last := parts[len(parts)-1]
	if last == "index" && len(parts) > 1 {
		last = parts[len(parts)-2]
	}
	if last == "" {
		last = "Content"
	}

	words := strings.Fields(strings.ReplaceAll(last, "-", " "))
	for i, word := range words {
		r := []rune(word)
		if len(r) == 0 {
			continue
		}
		r[0] = []rune(strings.ToUpper(string(r[0])))[0]
		words[i] = string(r)
	}
	if len(words) == 0 {
		return "Content"
	}
	return strings.Join(words, " ")
}

func (a *App) contentDir() string {
	if strings.TrimSpace(a.ContentDir) == "" {
		return "content"
	}
	return filepath.Clean(a.ContentDir)
}

func (a *App) sidebarDepth() int {
	if a.SidebarDepth <= 0 {
		return 2
	}
	return a.SidebarDepth
}

func (a *App) layoutPath() string {
	if strings.TrimSpace(a.LayoutPath) == "" {
		return "templates/layout.html"
	}
	return a.LayoutPath
}

func (a *App) templateGlob() string {
	if strings.TrimSpace(a.TemplateGlob) == "" {
		return "templates/*.html"
	}
	return a.TemplateGlob
}

func (a *App) publicDir() string {
	if strings.TrimSpace(a.PublicDir) == "" {
		return "public"
	}
	return a.PublicDir
}

func staticFileExists(publicDir, requestPath string) (bool, error) {
	cleanPublic := filepath.Clean(publicDir)
	relReq := strings.TrimPrefix(requestPath, "/")
	relReq = filepath.Clean(relReq)

	fullPath := filepath.Clean(filepath.Join(cleanPublic, relReq))
	rel, err := filepath.Rel(cleanPublic, fullPath)
	if err != nil {
		return false, err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return false, nil
	}

	info, statErr := os.Stat(fullPath)
	if statErr != nil {
		if errors.Is(statErr, os.ErrNotExist) {
			return false, nil
		}
		return false, statErr
	}

	return !info.IsDir(), nil
}
