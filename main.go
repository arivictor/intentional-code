package main

import (
	"log"

	gm "github.com/arivictor/gomark"
)

func main() {
	s := gm.NewSite(
		gm.WithSiteLogo("favicon-32x32.png"),
		gm.WithSiteTitle("Intentional Code"),
		gm.WithSiteURL("https://intentionalcode.com"),
		gm.WithSiteContentDir("content"),
		gm.WithSiteMode(gm.PreRender),
		gm.WithSitePublicDir("public"),
		gm.WithSiteOGImage("og-image.png"),
    	gm.WithSiteTwitterImage("twitter-image.png"),
	)

	if err := s.Start(); err != nil {
		log.Fatal(err)
	}
}
