package intentionalcode

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSearchIndexFindsMatchesInBodyAndTitle(t *testing.T) {
	contentDir := t.TempDir()
	writeSearchMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n")
	writeSearchMarkdown(t, contentDir, "patterns/index.md", "---\ntitle: Patterns\n---\n")
	writeSearchMarkdown(t, contentDir, "patterns/circuit-breaker.md", "---\ntitle: Circuit Breaker\n---\nStops cascading failures and trips open when downstream is unhealthy.")
	writeSearchMarkdown(t, contentDir, "philosophy/kiss.md", "---\ntitle: Keep It Simple\n---\nPrefer straightforward systems with fewer moving parts.")

	idx, err := BuildSearchIndex(contentDir)
	if err != nil {
		t.Fatalf("build search index: %v", err)
	}

	bodyResults := idx.Query("cascading failures", 10)
	if len(bodyResults) == 0 {
		t.Fatalf("expected body query to match at least one result")
	}
	if bodyResults[0].Path != "/patterns/circuit-breaker" {
		t.Fatalf("expected first result to be /patterns/circuit-breaker, got %q", bodyResults[0].Path)
	}

	titleResults := idx.Query("keep simple", 10)
	if len(titleResults) == 0 {
		t.Fatalf("expected title query to match at least one result")
	}
	if titleResults[0].Path != "/philosophy/kiss" {
		t.Fatalf("expected first result to be /philosophy/kiss, got %q", titleResults[0].Path)
	}
}

func TestSearchIndexReturnsEmptyOnBlankQuery(t *testing.T) {
	contentDir := t.TempDir()
	writeSearchMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n")

	idx, err := BuildSearchIndex(contentDir)
	if err != nil {
		t.Fatalf("build search index: %v", err)
	}

	results := idx.Query("   ", 10)
	if len(results) != 0 {
		t.Fatalf("expected no results for blank query, got %d", len(results))
	}
}

func writeSearchMarkdown(t *testing.T, root, relPath, content string) {
	t.Helper()
	fullPath := filepath.Join(root, relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", relPath, err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write file %s: %v", relPath, err)
	}
}
