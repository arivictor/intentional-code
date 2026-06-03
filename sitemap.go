package intentionalcode

import (
	"encoding/xml"
	"sort"
	"strings"
	"time"
)

type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	Xmlns   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

type sitemapURL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

func buildSitemapRoutes(index *ContentIndex) []string {
	if index == nil {
		return nil
	}

	seen := map[string]struct{}{}
	routes := make([]string, 0, len(index.pages))
	for _, page := range index.pages {
		route := strings.TrimSpace(page.Route)
		if route == "" {
			continue
		}
		if !strings.HasPrefix(route, "/") {
			route = "/" + route
		}
		if _, ok := seen[route]; ok {
			continue
		}
		seen[route] = struct{}{}
		routes = append(routes, route)
	}

	sort.Strings(routes)
	return routes
}

func renderSitemapXML(baseURL string, routes []string, now time.Time) (string, error) {
	cleanBase := normalizeBaseURL(baseURL)
	lastMod := now.UTC().Format("2006-01-02")

	set := sitemapURLSet{Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	set.URLs = make([]sitemapURL, 0, len(routes))
	for _, route := range routes {
		set.URLs = append(set.URLs, sitemapURL{
			Loc:     joinAbsoluteURL(cleanBase, route),
			LastMod: lastMod,
		})
	}

	body, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		return "", err
	}

	return xml.Header + string(body), nil
}

func renderRobotsTXT(baseURL string) string {
	cleanBase := normalizeBaseURL(baseURL)
	return "User-agent: *\nAllow: /\n\nSitemap: " + joinAbsoluteURL(cleanBase, "/sitemap.xml") + "\n"
}
