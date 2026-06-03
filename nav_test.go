package intentionalcode

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSidebarRootIncludesRoutableAndToggleOnlyFolders(t *testing.T) {
	contentDir := t.TempDir()
	writeMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n")
	writeMarkdown(t, contentDir, "routable/index.md", "---\ntitle: Routable\n---\n")
	writeMarkdown(t, contentDir, "routable/page.md", "# Page\n")
	writeMarkdown(t, contentDir, "toggle/child.md", "# Child\n")

	idx, err := BuildContentIndex(contentDir)
	if err != nil {
		t.Fatalf("build content index: %v", err)
	}

	title, nodes := idx.Sidebar("/", 3)

	if title != "Home" {
		t.Fatalf("expected root sidebar title from home index, got %q", title)
	}

	toggle, ok := findNavNode(nodes, "Toggle")
	if !ok {
		t.Fatalf("expected Toggle folder in root sidebar")
	}
	if toggle.Path != "" {
		t.Fatalf("expected Toggle to be toggle-only (no route), got %q", toggle.Path)
	}
	if len(toggle.Children) == 0 {
		t.Fatalf("expected Toggle to include children for accordion toggling")
	}

	routable, ok := findNavNode(nodes, "Routable")
	if !ok {
		t.Fatalf("expected Routable folder in root sidebar")
	}
	if routable.Path == "" {
		t.Fatalf("expected Routable to be routable via index.md")
	}
}

func TestSidebarKeepsOffPathChildrenForAccordion(t *testing.T) {
	contentDir := t.TempDir()
	writeMarkdown(t, contentDir, "alpha/index.md", "---\ntitle: Alpha\n---\n")
	writeMarkdown(t, contentDir, "alpha/one/index.md", "---\ntitle: One\n---\n")
	writeMarkdown(t, contentDir, "alpha/one/page.md", "# One Page\n")
	writeMarkdown(t, contentDir, "alpha/two/index.md", "---\ntitle: Two\n---\n")
	writeMarkdown(t, contentDir, "alpha/two/page.md", "# Two Page\n")

	idx, err := BuildContentIndex(contentDir)
	if err != nil {
		t.Fatalf("build content index: %v", err)
	}

	_, nodes := idx.Sidebar("/alpha/one", 3)

	one, ok := findNavNode(nodes, "One")
	if !ok {
		t.Fatalf("expected active One folder")
	}
	if !one.Open {
		t.Fatalf("expected active ancestor folder to be open")
	}

	two, ok := findNavNode(nodes, "Two")
	if !ok {
		t.Fatalf("expected off-path Two folder")
	}
	if two.Open {
		t.Fatalf("expected off-path folder to be closed by default")
	}
	if len(two.Children) == 0 {
		t.Fatalf("expected off-path folder children to be present for accordion rendering")
	}
}

func TestSidebarStaysRootAnchoredOnNestedRoute(t *testing.T) {
	contentDir := t.TempDir()
	writeMarkdown(t, contentDir, "index.md", "---\ntitle: Home\n---\n")
	writeMarkdown(t, contentDir, "patterns/index.md", "---\ntitle: Patterns\n---\n")
	writeMarkdown(t, contentDir, "patterns/creational/index.md", "---\ntitle: Creational\n---\n")
	writeMarkdown(t, contentDir, "philosophy/index.md", "---\ntitle: Philosophy\n---\n")

	idx, err := BuildContentIndex(contentDir)
	if err != nil {
		t.Fatalf("build content index: %v", err)
	}

	title, nodes := idx.Sidebar("/patterns", 3)

	if title != "Home" {
		t.Fatalf("expected root-anchored sidebar title Home, got %q", title)
	}

	patterns, ok := findNavNode(nodes, "Patterns")
	if !ok {
		t.Fatalf("expected Patterns folder in root sidebar")
	}
	if !patterns.Active {
		t.Fatalf("expected Patterns folder to be active on /patterns")
	}
	if !patterns.Open {
		t.Fatalf("expected Patterns folder to be open on /patterns")
	}

	if _, ok := findNavNode(nodes, "Philosophy"); !ok {
		t.Fatalf("expected sibling root folder Philosophy to remain visible")
	}
}

func writeMarkdown(t *testing.T, root, relPath, content string) {
	t.Helper()
	fullPath := filepath.Join(root, relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", relPath, err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write file %s: %v", relPath, err)
	}
}

func findNavNode(nodes []NavNode, title string) (NavNode, bool) {
	for _, node := range nodes {
		if node.Title == title {
			return node, true
		}
		if child, ok := findNavNode(node.Children, title); ok {
			return child, true
		}
	}
	return NavNode{}, false
}
