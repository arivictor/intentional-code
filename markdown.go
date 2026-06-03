package intentionalcode

import (
	"errors"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	ErrInvalidMarkdownPath = errors.New("invalid markdown path")
	ErrMarkdownNotFound    = errors.New("markdown file not found")
)

var boldRe = regexp.MustCompile(`\*\*([^*]+)\*\*`)
var italicRe = regexp.MustCompile(`\*([^*]+)\*`)
var orderedListRe = regexp.MustCompile(`^(\d+)\.\s+(.+)$`)
var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// Heading is a single in-page heading collected during rendering, used to build
// the on-page table of contents.
type Heading struct {
	Level int
	Text  string
	ID    string
}

type MarkdownRenderer interface {
	Render(markdown string) (html string, headings []Heading)
}

type StdlibMarkdownRenderer struct{}

type MarkdownService struct {
	renderer   MarkdownRenderer
	contentDir string
}

func NewMarkdownService(renderer MarkdownRenderer, contentDir string) MarkdownService {
	if renderer == nil {
		renderer = StdlibMarkdownRenderer{}
	}
	if strings.TrimSpace(contentDir) == "" {
		contentDir = "content"
	}

	return MarkdownService{
		renderer:   renderer,
		contentDir: filepath.Clean(contentDir),
	}
}

// RenderedPage is the result of loading a markdown file: its resolved path, the
// rendered HTML body, and metadata pulled from optional YAML frontmatter.
type RenderedPage struct {
	Path        string
	HTML        string
	Title       string
	Description string
	Headings    []Heading
}

func (s MarkdownService) LoadAndRender(slug string) (RenderedPage, error) {
	resolved, err := resolveContentPath(s.contentDir, slug)
	if err != nil {
		return RenderedPage{}, err
	}

	data, readErr := os.ReadFile(resolved)
	if readErr != nil {
		if errors.Is(readErr, os.ErrNotExist) {
			return RenderedPage{}, ErrMarkdownNotFound
		}
		return RenderedPage{}, fmt.Errorf("read markdown %s: %w", resolved, readErr)
	}

	meta, body := parseFrontmatter(string(data))

	title := meta["title"]
	if heading, rest, ok := stripLeadingH1(body); ok {
		body = rest
		if title == "" {
			title = heading
		}
	}

	description := firstNonEmpty(meta["description"], meta["tagline"], meta["lede"])

	html, headings := s.renderer.Render(body)

	return RenderedPage{
		Path:        resolved,
		HTML:        html,
		Title:       title,
		Description: description,
		Headings:    headings,
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// parseFrontmatter splits an optional leading "---" YAML block from the body.
// It is intentionally minimal (flat key: value pairs) to stay dependency-free;
// values are trimmed of surrounding quotes and keys are lowercased.
func parseFrontmatter(raw string) (map[string]string, string) {
	normalized := strings.ReplaceAll(raw, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return nil, raw
	}

	closing := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			closing = i
			break
		}
	}
	if closing == -1 {
		return nil, raw
	}

	meta := make(map[string]string)
	for _, line := range lines[1:closing] {
		key, value, found := strings.Cut(line, ":")
		key = strings.ToLower(strings.TrimSpace(key))
		if !found || key == "" {
			continue
		}
		meta[key] = strings.Trim(strings.TrimSpace(value), `"'`)
	}

	body := strings.TrimLeft(strings.Join(lines[closing+1:], "\n"), "\n")
	return meta, body
}

// stripLeadingH1 removes a leading "# Title" line so the body doesn't duplicate
// the page header rendered from frontmatter. It returns the heading text, the
// trimmed body, and whether a leading H1 was found.
func stripLeadingH1(body string) (string, string, bool) {
	lines := strings.Split(body, "\n")
	idx := 0
	for idx < len(lines) && strings.TrimSpace(lines[idx]) == "" {
		idx++
	}
	if idx >= len(lines) {
		return "", body, false
	}

	heading := strings.TrimSpace(lines[idx])
	if !strings.HasPrefix(heading, "# ") {
		return "", body, false
	}

	remaining := append(lines[:idx:idx], lines[idx+1:]...)
	rest := strings.TrimLeft(strings.Join(remaining, "\n"), "\n")
	return strings.TrimSpace(heading[2:]), rest, true
}

func resolveContentPath(contentDir, slug string) (string, error) {
	page := strings.TrimSpace(slug)
	if page == "" {
		page = "home"
	}

	cleanPage := filepath.Clean(page)
	if filepath.IsAbs(cleanPage) {
		return "", ErrInvalidMarkdownPath
	}

	if filepath.Ext(cleanPage) == "" {
		cleanPage += ".md"
	}
	if filepath.Ext(cleanPage) != ".md" {
		return "", ErrInvalidMarkdownPath
	}

	fullPath := filepath.Clean(filepath.Join(contentDir, cleanPage))
	rel, err := filepath.Rel(contentDir, fullPath)
	if err != nil {
		return "", ErrInvalidMarkdownPath
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", ErrInvalidMarkdownPath
	}

	return fullPath, nil
}

func splitFenceInfo(info string) []string {
	info = strings.TrimSpace(info)
	if info == "" {
		return nil
	}

	if prefix, rest, found := strings.Cut(info, ":"); found && !strings.ContainsAny(prefix, " \t\n\r") {
		info = strings.TrimSpace(prefix + " " + rest)
	}

	var tokens []string
	var current strings.Builder
	var quote rune

	flush := func() {
		if current.Len() == 0 {
			return
		}
		tokens = append(tokens, current.String())
		current.Reset()
	}

	for _, r := range info {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
				continue
			}
			current.WriteRune(r)
		case r == '"' || r == '\'':
			quote = r
		case r == ' ' || r == '\t' || r == '\n' || r == '\r':
			flush()
		default:
			current.WriteRune(r)
		}
	}

	flush()
	return tokens
}

func (StdlibMarkdownRenderer) Render(markdown string) (string, []Heading) {
	lines := strings.Split(strings.ReplaceAll(markdown, "\r\n", "\n"), "\n")

	var out strings.Builder
	var headings []Heading
	seen := map[string]int{}
	makeID := func(text string) string {
		base := slugify(text)
		count := seen[base]
		seen[base]++
		if count == 0 {
			return base
		}
		return fmt.Sprintf("%s-%d", base, count)
	}
	var paragraph []string
	var quote []string
	var listItems []string
	listType := ""
	var codeLines []string
	inCode := false
	codeLang := ""
	codeTitle := ""

	flushParagraph := func() {
		if len(paragraph) == 0 {
			return
		}
		out.WriteString("<p>")
		out.WriteString(renderInline(strings.Join(paragraph, " ")))
		out.WriteString("</p>\n")
		paragraph = nil
	}

	flushQuote := func() {
		if len(quote) == 0 {
			return
		}
		out.WriteString("<blockquote><p>")
		out.WriteString(renderInline(strings.Join(quote, " ")))
		out.WriteString("</p></blockquote>\n")
		quote = nil
	}

	flushList := func() {
		if len(listItems) == 0 || listType == "" {
			return
		}
		out.WriteString("<")
		out.WriteString(listType)
		out.WriteString(">\n")
		for _, item := range listItems {
			out.WriteString("  <li>")
			out.WriteString(renderInline(item))
			out.WriteString("</li>\n")
		}
		out.WriteString("</")
		out.WriteString(listType)
		out.WriteString(">\n")
		listItems = nil
		listType = ""
	}

	flushCode := func() {
		if len(codeLines) == 0 && codeLang == "" {
			return
		}

		title := codeTitle
		if title == "" {
			if codeLang != "" {
				title = codeLang
			} else {
				title = "code"
			}
		}

		classAttr := ""
		if codeLang != "" {
			classAttr = ` class="language-` + html.EscapeString(codeLang) + `"`
		}

		out.WriteString("<div class=\"code-frame\">")
		out.WriteString("<div class=\"code-frame-header\">")
		out.WriteString("<span class=\"code-frame-title\">")
		out.WriteString(html.EscapeString(title))
		out.WriteString("</span>")
		out.WriteString("<button type=\"button\" class=\"code-copy\" data-copy-code=\"\" aria-label=\"Copy code block\" title=\"Copy code\">")
		out.WriteString("<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"></rect><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"></path></svg>")
		out.WriteString("</button>")
		out.WriteString("</div>")
		out.WriteString("<pre><code")
		out.WriteString(classAttr)
		out.WriteString(">")
		out.WriteString(html.EscapeString(strings.Join(codeLines, "\n")))
		out.WriteString("</code></pre>")
		out.WriteString("</div>\n")

		codeLines = nil
		codeLang = ""
		codeTitle = ""
	}

	parseFenceInfo := func(info string) (string, string) {
		tokens := splitFenceInfo(info)
		lang := ""
		title := ""

		for _, token := range tokens {
			key, value, found := strings.Cut(token, "=")
			if found {
				switch strings.ToLower(strings.TrimSpace(key)) {
				case "title", "name":
					title = strings.TrimSpace(value)
				}
				continue
			}

			if lang == "" {
				lang = token
			}
		}

		if title == "" {
			title = lang
		}

		return lang, title
	}

	for _, raw := range lines {
		line := strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(line)

		if inCode {
			if strings.HasPrefix(trimmed, "```") {
				inCode = false
				flushCode()
				continue
			}
			codeLines = append(codeLines, line)
			continue
		}

		if strings.HasPrefix(trimmed, "```") {
			flushParagraph()
			flushQuote()
			flushList()
			inCode = true
			codeLang, codeTitle = parseFenceInfo(strings.TrimSpace(strings.TrimPrefix(trimmed, "```")))
			codeLines = nil
			continue
		}

		if trimmed == "" {
			flushParagraph()
			flushQuote()
			flushList()
			continue
		}

		if trimmed == "---" {
			flushParagraph()
			flushQuote()
			flushList()
			out.WriteString("<hr />\n")
			continue
		}

		if strings.HasPrefix(trimmed, ">") {
			flushParagraph()
			flushList()
			content := strings.TrimSpace(strings.TrimPrefix(trimmed, ">"))
			quote = append(quote, content)
			continue
		}

		if strings.HasPrefix(trimmed, "- ") {
			flushParagraph()
			flushQuote()
			if listType != "" && listType != "ul" {
				flushList()
			}
			listType = "ul"
			listItems = append(listItems, strings.TrimSpace(trimmed[2:]))
			continue
		}

		if strings.HasPrefix(trimmed, "* ") {
			flushParagraph()
			flushQuote()
			if listType != "" && listType != "ul" {
				flushList()
			}
			listType = "ul"
			listItems = append(listItems, strings.TrimSpace(trimmed[2:]))
			continue
		}

		if matches := orderedListRe.FindStringSubmatch(trimmed); len(matches) == 3 {
			flushParagraph()
			flushQuote()
			if listType != "" && listType != "ol" {
				flushList()
			}
			listType = "ol"
			listItems = append(listItems, strings.TrimSpace(matches[2]))
			continue
		}

		headingLevel, headingText, ok := parseHeading(trimmed)
		if ok {
			flushParagraph()
			flushQuote()
			flushList()
			id := makeID(headingText)
			out.WriteString(fmt.Sprintf("<h%d id=\"%s\">%s</h%d>\n", headingLevel, id, renderInline(headingText), headingLevel))
			if headingLevel == 2 || headingLevel == 3 {
				headings = append(headings, Heading{Level: headingLevel, Text: headingPlain(headingText), ID: id})
			}
			continue
		}

		if len(quote) > 0 {
			flushQuote()
		}
		if len(listItems) > 0 {
			flushList()
		}

		paragraph = append(paragraph, trimmed)
	}

	if inCode {
		flushCode()
	}
	flushParagraph()
	flushQuote()
	flushList()

	return out.String(), headings
}

// slugify turns heading text into a URL-fragment id: lowercase, runs of
// non-alphanumerics collapsed to single hyphens, trimmed.
func slugify(text string) string {
	s := slugRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(text)), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "section"
	}
	return s
}

// headingPlain strips inline markdown markers so a heading reads cleanly as a
// table-of-contents label.
func headingPlain(text string) string {
	r := strings.NewReplacer("`", "", "**", "", "*", "", "_", "")
	return strings.TrimSpace(r.Replace(text))
}

func parseHeading(line string) (int, string, bool) {
	count := 0
	for count < len(line) && line[count] == '#' {
		count++
	}

	if count < 1 || count > 6 {
		return 0, "", false
	}
	if len(line) <= count || line[count] != ' ' {
		return 0, "", false
	}

	return count, strings.TrimSpace(line[count+1:]), true
}

func renderInline(input string) string {
	remaining := input
	var out strings.Builder

	for {
		start := strings.Index(remaining, "`")
		if start == -1 {
			out.WriteString(renderInlineText(remaining))
			break
		}

		before := remaining[:start]
		out.WriteString(renderInlineText(before))

		rest := remaining[start+1:]
		end := strings.Index(rest, "`")
		if end == -1 {
			out.WriteString(html.EscapeString("`" + rest))
			break
		}

		codeText := rest[:end]
		out.WriteString("<code>")
		out.WriteString(html.EscapeString(codeText))
		out.WriteString("</code>")

		remaining = rest[end+1:]
	}

	return out.String()
}

func renderInlineText(input string) string {
	remaining := input
	var out strings.Builder
	var links []struct {
		token string
		html  string
	}
	linkIndex := 0

	for len(remaining) > 0 {
		wikiAt := strings.Index(remaining, "[[")
		mdAt := strings.Index(remaining, "[")

		next := -1
		if wikiAt >= 0 {
			next = wikiAt
		}
		if mdAt >= 0 && (next == -1 || mdAt < next) {
			next = mdAt
		}

		if next == -1 {
			out.WriteString(remaining)
			break
		}

		if next > 0 {
			out.WriteString(remaining[:next])
			remaining = remaining[next:]
			continue
		}

		if strings.HasPrefix(remaining, "[[") {
			end := strings.Index(remaining[2:], "]]")
			if end == -1 {
				out.WriteString(html.EscapeString("[["))
				remaining = remaining[2:]
				continue
			}

			inner := strings.TrimSpace(remaining[2 : 2+end])
			href, label := parseWikiLink(inner)
			if href == "" {
				out.WriteString(remaining[:end+4])
			} else {
				token := fmt.Sprintf("@@LINK%d@@", linkIndex)
				linkIndex++
				links = append(links, struct {
					token string
					html  string
				}{
					token: token,
					html:  "<a href=\"" + html.EscapeString(href) + "\">" + renderInline(label) + "</a>",
				})
				out.WriteString(token)
			}
			remaining = remaining[end+4:]
			continue
		}

		labelEnd := strings.Index(remaining[1:], "]")
		if labelEnd == -1 {
			out.WriteString(html.EscapeString("["))
			remaining = remaining[1:]
			continue
		}

		labelEnd += 1
		if labelEnd+1 >= len(remaining) || remaining[labelEnd+1] != '(' {
			out.WriteString(remaining[:labelEnd+1])
			remaining = remaining[labelEnd+1:]
			continue
		}

		hrefEnd := findMatchingParen(remaining, labelEnd+1)
		if hrefEnd == -1 {
			out.WriteString(remaining[:labelEnd+2])
			remaining = remaining[labelEnd+2:]
			continue
		}

		label := remaining[1:labelEnd]
		href := normalizeLinkTarget(strings.TrimSpace(remaining[labelEnd+2 : hrefEnd]))
		if href == "" {
			out.WriteString(remaining[:hrefEnd+1])
		} else {
			token := fmt.Sprintf("@@LINK%d@@", linkIndex)
			linkIndex++
			links = append(links, struct {
				token string
				html  string
			}{
				token: token,
				html:  "<a href=\"" + html.EscapeString(href) + "\">" + renderInline(label) + "</a>",
			})
			out.WriteString(token)
		}

		remaining = remaining[hrefEnd+1:]
	}

	escaped := html.EscapeString(out.String())
	withEmphasis := applyEmphasis(escaped)
	for _, link := range links {
		withEmphasis = strings.ReplaceAll(withEmphasis, html.EscapeString(link.token), link.html)
	}

	return withEmphasis
}

func parseWikiLink(raw string) (string, string) {
	if raw == "" {
		return "", ""
	}

	target := raw
	label := ""
	if pipe := strings.Index(raw, "|"); pipe >= 0 {
		target = strings.TrimSpace(raw[:pipe])
		label = strings.TrimSpace(raw[pipe+1:])
	}

	href := normalizeLinkTarget(target)
	if href == "" {
		return "", ""
	}

	if label == "" {
		label = defaultWikiLabel(target)
	}
	if label == "" {
		label = href
	}

	return href, label
}

func defaultWikiLabel(target string) string {
	base := target
	if hash := strings.Index(base, "#"); hash >= 0 {
		base = base[:hash]
	}
	base = strings.TrimSuffix(base, ".md")
	base = strings.Trim(base, "/")
	if slash := strings.LastIndex(base, "/"); slash >= 0 {
		base = base[slash+1:]
	}
	base = strings.ReplaceAll(base, "-", " ")
	base = strings.ReplaceAll(base, "_", " ")
	return strings.TrimSpace(base)
}

func normalizeLinkTarget(raw string) string {
	href := strings.TrimSpace(raw)
	if href == "" {
		return ""
	}

	if space := strings.IndexAny(href, " \t"); space >= 0 {
		href = href[:space]
	}
	href = strings.Trim(href, "<>")

	if strings.HasPrefix(href, "mailto:") || strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}

	if strings.HasPrefix(href, "/go/") {
		href = strings.TrimPrefix(href, "/go")
	}

	if strings.HasPrefix(href, "#") {
		return "#" + slugify(strings.TrimPrefix(href, "#"))
	}

	anchor := ""
	if hash := strings.Index(href, "#"); hash >= 0 {
		anchor = "#" + slugify(href[hash+1:])
		href = href[:hash]
	}

	href = strings.TrimSuffix(href, ".md")
	href = strings.TrimPrefix(href, "./")
	href = strings.ReplaceAll(href, "\\", "/")

	if strings.HasPrefix(href, "/") {
		cleaned := "/" + strings.Trim(strings.TrimSpace(href), "/")
		if cleaned == "/" {
			return cleaned + anchor
		}
		return cleaned + anchor
	}

	trimmed := strings.Trim(strings.TrimSpace(href), "/")
	if trimmed == "" {
		return "/" + anchor
	}

	parts := strings.Split(trimmed, "/")
	for i, part := range parts {
		parts[i] = slugify(part)
	}

	return "/" + strings.Join(parts, "/") + anchor
}

func findMatchingParen(input string, openIdx int) int {
	if openIdx < 0 || openIdx >= len(input) || input[openIdx] != '(' {
		return -1
	}

	depth := 0
	for i := openIdx; i < len(input); i++ {
		switch input[i] {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return i
			}
		}
	}

	return -1
}

func applyEmphasis(input string) string {
	withBold := boldRe.ReplaceAllString(input, "<strong>$1</strong>")
	return italicRe.ReplaceAllString(withBold, "<em>$1</em>")
}
