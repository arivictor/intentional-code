package intentionalcode

import (
	"strings"
	"testing"
	"time"
)

func TestBuildSitemapRoutesDeduplicatesAndSorts(t *testing.T) {
	idx := &ContentIndex{pages: []contentPage{
		{Route: "/patterns"},
		{Route: "/"},
		{Route: "/patterns"},
		{Route: "/philosophy"},
		{Route: ""},
	}}

	routes := buildSitemapRoutes(idx)
	if len(routes) != 3 {
		t.Fatalf("expected 3 unique routes, got %d", len(routes))
	}
	if routes[0] != "/" || routes[1] != "/patterns" || routes[2] != "/philosophy" {
		t.Fatalf("unexpected sorted routes: %#v", routes)
	}
}

func TestRenderSitemapXMLIncludesExpectedURLs(t *testing.T) {
	xmlBody, err := renderSitemapXML("https://example.com", []string{"/", "/patterns/adapter"}, time.Date(2026, 6, 4, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("render sitemap xml: %v", err)
	}

	if !strings.Contains(xmlBody, `<loc>https://example.com/</loc>`) {
		t.Fatalf("expected root URL in sitemap XML: %s", xmlBody)
	}
	if !strings.Contains(xmlBody, `<loc>https://example.com/patterns/adapter</loc>`) {
		t.Fatalf("expected nested URL in sitemap XML: %s", xmlBody)
	}
	if !strings.Contains(xmlBody, `<lastmod>2026-06-04</lastmod>`) {
		t.Fatalf("expected deterministic lastmod date in sitemap XML: %s", xmlBody)
	}
}

func TestRenderRobotsTXTPointsToSitemap(t *testing.T) {
	robots := renderRobotsTXT("https://intentionalcode.com")
	if !strings.Contains(robots, "Sitemap: https://intentionalcode.com/sitemap.xml") {
		t.Fatalf("expected sitemap reference in robots.txt: %s", robots)
	}
}
