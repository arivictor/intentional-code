package intentionalcode

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type contentPageProvider interface {
	Get(slug string) (RenderedPage, error)
}

type liveMarkdownProvider struct {
	service MarkdownService
}

func newLiveMarkdownProvider(contentDir string, renderer MarkdownRenderer) contentPageProvider {
	return liveMarkdownProvider{service: NewMarkdownService(renderer, contentDir)}
}

func (p liveMarkdownProvider) Get(slug string) (RenderedPage, error) {
	return p.service.LoadAndRender(slug)
}

type preRenderedMarkdownProvider struct {
	pages map[string]RenderedPage
}

func newPreRenderedMarkdownProvider(contentDir string, renderer MarkdownRenderer) (contentPageProvider, error) {
	service := NewMarkdownService(renderer, contentDir)
	cleanDir := filepath.Clean(contentDir)
	pages := map[string]RenderedPage{}

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

		slug := strings.TrimSuffix(filepath.ToSlash(rel), filepath.Ext(rel))
		page, renderErr := service.LoadAndRender(slug)
		if renderErr != nil {
			return renderErr
		}
		pages[slug] = page
		return nil
	})
	if err != nil {
		return nil, err
	}

	return preRenderedMarkdownProvider{pages: pages}, nil
}

func (p preRenderedMarkdownProvider) Get(slug string) (RenderedPage, error) {
	page, ok := p.pages[slug]
	if !ok {
		return RenderedPage{}, ErrMarkdownNotFound
	}
	return page, nil
}

func mapContentProviderError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrMarkdownNotFound) {
		return &HTTPError{Status: 404, Message: "content page not found"}
	}
	if errors.Is(err, ErrInvalidMarkdownPath) {
		return &BadRequestError{Message: "invalid content path"}
	}
	return err
}
