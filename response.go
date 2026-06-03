package intentionalcode

import (
	"errors"
	"log"
	"net/http"
	"time"
)

type BadRequestError struct {
	Message string
}

func (e *BadRequestError) Error() string {
	return e.Message
}

type HTTPError struct {
	Status  int
	Message string
}

func (e *HTTPError) Error() string {
	return e.Message
}

type HTMLErrorResponder struct {
	Renderer TemplateRenderer
	TopNav   []NavLink
	SiteName string
	SiteURL  string
	Logger   *log.Logger
}

func (r HTMLErrorResponder) Handle(w http.ResponseWriter, req *http.Request, err error) {
	if r.Logger == nil {
		r.Logger = log.Default()
	}
	if r.Renderer == nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	status := http.StatusInternalServerError
	title := "Internal Server Error"
	description := "Something went wrong while rendering this page."

	var httpErr *HTTPError
	if errors.As(err, &httpErr) {
		status = httpErr.Status
		title = http.StatusText(status)
		description = httpErr.Message
	}

	var badReq *BadRequestError
	if errors.As(err, &badReq) {
		status = http.StatusBadRequest
		title = "Bad Request"
		description = badReq.Message
	}

	if status >= http.StatusInternalServerError {
		r.Logger.Printf("internal error on %s %s: %v", req.Method, req.URL.Path, err)
	}

	if description == "" {
		description = "The requested page could not be served."
	}

	renderErr := r.Renderer.RenderStatus(w, status, "error", PageData{
		StatusCode:  status,
		Title:       title,
		Description: description,
		SiteName:    firstNonEmpty(r.SiteName, defaultSiteName),
		CanonicalURL: joinAbsoluteURL(
			requestBaseURL(req, r.SiteURL),
			req.URL.Path,
		),
		OGImageURL:  joinAbsoluteURL(requestBaseURL(req, r.SiteURL), "/og-image.png"),
		Robots:      "noindex,nofollow",
		TopNav:      r.TopNav,
		CurrentPath: req.URL.Path,
		Time:        time.Now().UTC().Format(time.RFC3339),
	})
	if renderErr != nil {
		r.Logger.Printf("error rendering error page: %v", renderErr)
		http.Error(w, http.StatusText(status), status)
	}
}
