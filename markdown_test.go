package intentionalcode

import (
	"strings"
	"testing"
)

func TestStdlibMarkdownRendererSupportsDashAndStarUnorderedLists(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("- first\n- second\n\n* third\n* fourth")

	if strings.Count(output, "<ul>") != 2 {
		t.Fatalf("expected 2 unordered lists, got output: %s", output)
	}
	if !strings.Contains(output, "<li>first</li>") || !strings.Contains(output, "<li>fourth</li>") {
		t.Fatalf("expected unordered list items in output: %s", output)
	}
}

func TestStdlibMarkdownRendererSupportsNumberedLists(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("1. alpha\n2. beta\n3. gamma")

	if !strings.Contains(output, "<ol>") || !strings.Contains(output, "</ol>") {
		t.Fatalf("expected ordered list wrapper in output: %s", output)
	}
	if strings.Contains(output, "<ul>") {
		t.Fatalf("did not expect unordered list wrapper in output: %s", output)
	}
	if !strings.Contains(output, "<li>alpha</li>") || !strings.Contains(output, "<li>gamma</li>") {
		t.Fatalf("expected ordered list items in output: %s", output)
	}
}

func TestStdlibMarkdownRendererFlushesWhenListTypeChanges(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("- one\n1. two\n2. three\n- four")

	firstUL := strings.Index(output, "<ul>")
	firstOL := strings.Index(output, "<ol>")
	lastUL := strings.LastIndex(output, "<ul>")
	if firstUL == -1 || firstOL == -1 || lastUL == -1 {
		t.Fatalf("expected mixed ul/ol blocks in output: %s", output)
	}
	if !(firstUL < firstOL && firstOL < lastUL) {
		t.Fatalf("expected ul then ol then ul ordering, got output: %s", output)
	}
}

func TestStdlibMarkdownRendererKeepsInlineEmphasisInListItems(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("* **bold** and *italic*")

	if !strings.Contains(output, "<strong>bold</strong>") {
		t.Fatalf("expected bold emphasis in output: %s", output)
	}
	if !strings.Contains(output, "<em>italic</em>") {
		t.Fatalf("expected italic emphasis in output: %s", output)
	}
}

func TestStdlibMarkdownRendererRendersBoldAroundLink(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("**Start with [Factory Method](/go/patterns/creational/factory-method)**")

	if !strings.Contains(output, "<strong>Start with <a href=\"/patterns/creational/factory-method\">Factory Method</a></strong>") {
		t.Fatalf("expected bold wrapper around link, got: %s", output)
	}
}

func TestStdlibMarkdownRendererRendersItalicAroundLink(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("*Start with [Factory Method](/go/patterns/creational/factory-method)*")

	if !strings.Contains(output, "<em>Start with <a href=\"/patterns/creational/factory-method\">Factory Method</a></em>") {
		t.Fatalf("expected italic wrapper around link, got: %s", output)
	}
}

func TestStdlibMarkdownRendererRendersCodeFenceTitle(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("```terminal\npnpm i -g @vercel/vc-native-darwin-x64 -f\n```")

	if !strings.Contains(output, `<div class="code-frame">`) {
		t.Fatalf("expected code frame wrapper in output: %s", output)
	}
	if !strings.Contains(output, `<span class="code-frame-title">terminal</span>`) {
		t.Fatalf("expected title text in output: %s", output)
	}
	if !strings.Contains(output, `<button type="button" class="code-copy"`) {
		t.Fatalf("expected copy button in output: %s", output)
	}
}

func TestStdlibMarkdownRendererRendersCodeFenceTitleMetadata(t *testing.T) {
	renderer := StdlibMarkdownRenderer{}
	output, _ := renderer.Render("```go:title=\"main.go\"\nfmt.Println(\"hi\")\n```")

	if !strings.Contains(output, `class="language-go"`) {
		t.Fatalf("expected language class in output: %s", output)
	}
	if !strings.Contains(output, `<span class="code-frame-title">main.go</span>`) {
		t.Fatalf("expected explicit title in output: %s", output)
	}
}
