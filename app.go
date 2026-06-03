package intentionalcode

import (
	"log"
	"net/http"
	"time"
)

type HandlerFunc func(http.ResponseWriter, *http.Request) error

type ErrorResponder interface {
	Handle(http.ResponseWriter, *http.Request, error)
}

type Server struct {
	mux            *http.ServeMux
	middlewares    []Middleware
	errorResponder ErrorResponder
}

func NewServer(errorResponder ErrorResponder) *Server {
	return &Server{
		mux:            http.NewServeMux(),
		errorResponder: errorResponder,
	}
}

func (s *Server) Use(mw Middleware) {
	s.middlewares = append(s.middlewares, mw)
}

func (s *Server) Handle(method, path string, h HandlerFunc) {
	base := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method {
			s.errorResponder.Handle(w, r, &HTTPError{Status: http.StatusMethodNotAllowed, Message: "method not allowed"})
			return
		}

		if err := h(w, r); err != nil {
			s.errorResponder.Handle(w, r, err)
		}
	})

	s.mux.Handle(path, s.chain(base))
}

func (s *Server) chain(h http.Handler) http.Handler {
	for i := len(s.middlewares) - 1; i >= 0; i-- {
		h = s.middlewares[i](h)
	}
	return h
}

func (s *Server) Run(addr string) error {
	server := &http.Server{
		Addr:              addr,
		Handler:           s.mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("listening on %s", addr)
	return server.ListenAndServe()
}
