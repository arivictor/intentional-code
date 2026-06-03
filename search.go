package intentionalcode

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// SearchResult is one matched markdown page returned by the search API.
type SearchResult struct {
	Title   string `json:"title"`
	Path    string `json:"path"`
	Snippet string `json:"snippet,omitempty"`
}

type searchDoc struct {
	title       string
	path        string
	body        string
	titleLower  string
	haystack    string
}

// SearchIndex is an in-memory index of markdown content.
type SearchIndex struct {
	docs []searchDoc
}

// BuildSearchIndex walks markdown files under contentDir and builds a search index.
func BuildSearchIndex(contentDir string) (*SearchIndex, error) {
	idx := &SearchIndex{}
	cleanDir := filepath.Clean(contentDir)

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
		route := buildRoutePath(slug)
		if strings.HasSuffix(route, "/index") {
			route = strings.TrimSuffix(route, "/index")
			if route == "" {
				route = "/"
			}
		}

		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		meta, body := parseFrontmatter(string(data))

		title := strings.TrimSpace(meta["title"])
		if heading, rest, ok := stripLeadingH1(body); ok {
			body = rest
			if title == "" {
				title = heading
			}
		}
		if title == "" {
			title = pageTitleFromSlug(slug)
		}

		bodyText := normalizeText(body)
		idx.docs = append(idx.docs, searchDoc{
			title:      title,
			path:       route,
			body:       bodyText,
			titleLower: strings.ToLower(title),
			haystack:   strings.ToLower(title + " " + bodyText),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}

	return idx, nil
}

func normalizeText(s string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
}

func splitTerms(q string) []string {
	q = strings.TrimSpace(strings.ToLower(q))
	if q == "" {
		return nil
	}
	return strings.Fields(q)
}

func makeSnippet(body string, terms []string) string {
	if body == "" {
		return ""
	}

	bodyLower := strings.ToLower(body)
	at := -1
	for _, term := range terms {
		if term == "" {
			continue
		}
		if i := strings.Index(bodyLower, term); i != -1 {
			at = i
			break
		}
	}
	if at == -1 {
		if len(body) <= 180 {
			return body
		}
		return strings.TrimSpace(body[:180]) + "..."
	}

	start := at - 72
	if start < 0 {
		start = 0
	}
	end := start + 180
	if end > len(body) {
		end = len(body)
	}

	prefix := ""
	suffix := ""
	if start > 0 {
		prefix = "..."
	}
	if end < len(body) {
		suffix = "..."
	}

	return prefix + strings.TrimSpace(body[start:end]) + suffix
}

// Query finds markdown pages matching q, ordered by a simple relevance score.
func (idx *SearchIndex) Query(q string, limit int) []SearchResult {
	if idx == nil {
		return nil
	}
	terms := splitTerms(q)
	if len(terms) == 0 {
		return nil
	}
	if limit <= 0 {
		limit = 8
	}

	type scored struct {
		result SearchResult
		score  int
	}

	matches := make([]scored, 0, len(idx.docs))
	queryLower := strings.ToLower(strings.TrimSpace(q))
	for _, doc := range idx.docs {
		score := 0
		allTermsPresent := true
		for _, term := range terms {
			if !strings.Contains(doc.haystack, term) {
				allTermsPresent = false
				break
			}
			score++
			if strings.Contains(doc.titleLower, term) {
				score += 3
			}
		}
		if !allTermsPresent {
			continue
		}

		if strings.Contains(doc.titleLower, queryLower) {
			score += 4
		}

		matches = append(matches, scored{
			result: SearchResult{
				Title:   doc.title,
				Path:    doc.path,
				Snippet: makeSnippet(doc.body, terms),
			},
			score: score,
		})
	}

	sort.SliceStable(matches, func(i, j int) bool {
		if matches[i].score != matches[j].score {
			return matches[i].score > matches[j].score
		}
		if matches[i].result.Title != matches[j].result.Title {
			return matches[i].result.Title < matches[j].result.Title
		}
		return matches[i].result.Path < matches[j].result.Path
	})

	if limit > len(matches) {
		limit = len(matches)
	}
	out := make([]SearchResult, 0, limit)
	for i := 0; i < limit; i++ {
		out = append(out, matches[i].result)
	}
	return out
}
