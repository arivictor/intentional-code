package intentionalcode

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppModeDefaultsToDevelopment(t *testing.T) {
	t.Setenv("APP_MODE", "")
	t.Setenv("APP_ENV", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("ENV", "")

	a := App{}
	if got := a.mode(); got != LiveRender {
		t.Fatalf("expected default mode %q, got %q", LiveRender, got)
	}
}

func TestAppModeResolvesAliases(t *testing.T) {
	tests := []struct {
		in   string
		want RenderMode
	}{
		{in: "prod", want: PreRender},
		{in: "production", want: PreRender},
		{in: "PreRender", want: PreRender},
		{in: "live", want: LiveRender},
		{in: "development", want: LiveRender},
		{in: "LiveRender", want: LiveRender},
	}

	for _, tc := range tests {
		a := App{Mode: RenderMode(tc.in)}
		if got := a.mode(); got != tc.want {
			t.Fatalf("mode %q: expected %q, got %q", tc.in, tc.want, got)
		}
	}
}

func TestContentProviderProductionPreRenders(t *testing.T) {
	contentDir := t.TempDir()
	writeProviderMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n# Welcome\nFirst version")

	a := App{Mode: PreRender}
	provider, err := a.newContentPageProvider(contentDir)
	if err != nil {
		t.Fatalf("new content page provider: %v", err)
	}

	writeProviderMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n# Welcome\nSecond version")

	page, err := provider.Get("index")
	if err != nil {
		t.Fatalf("provider get: %v", err)
	}
	if !strings.Contains(page.HTML, "First version") {
		t.Fatalf("expected pre-rendered content snapshot, got HTML: %s", page.HTML)
	}
	if strings.Contains(page.HTML, "Second version") {
		t.Fatalf("did not expect updated disk content in pre-rendered mode")
	}
}

func TestContentProviderDevelopmentReadsLatestFromDisk(t *testing.T) {
	contentDir := t.TempDir()
	writeProviderMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n# Welcome\nFirst version")

	a := App{Mode: LiveRender}
	provider, err := a.newContentPageProvider(contentDir)
	if err != nil {
		t.Fatalf("new content page provider: %v", err)
	}

	if _, err := provider.Get("index"); err != nil {
		t.Fatalf("initial provider get: %v", err)
	}

	writeProviderMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n# Welcome\nSecond version")

	page, err := provider.Get("index")
	if err != nil {
		t.Fatalf("provider get after update: %v", err)
	}
	if !strings.Contains(page.HTML, "Second version") {
		t.Fatalf("expected live disk content in development mode, got HTML: %s", page.HTML)
	}
}

func TestPreRenderedProviderReturnsNotFoundForMissingSlug(t *testing.T) {
	contentDir := t.TempDir()
	writeProviderMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n# Welcome")

	provider, err := newPreRenderedMarkdownProvider(contentDir, StdlibMarkdownRenderer{})
	if err != nil {
		t.Fatalf("new pre-rendered provider: %v", err)
	}

	_, err = provider.Get("missing")
	if !errors.Is(err, ErrMarkdownNotFound) {
		t.Fatalf("expected ErrMarkdownNotFound, got: %v", err)
	}
}

func writeProviderMarkdown(t *testing.T, root, relPath, content string) {
	t.Helper()
	fullPath := filepath.Join(root, relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", relPath, err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write file %s: %v", relPath, err)
	}
}
