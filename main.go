package main

import (
	"log"
	"os"

	gm "github.com/arivictor/gomark"
)

func main() {
	runnerURL := os.Getenv("RUNNER_URL")
	if runnerURL == "" {
		runnerURL = "http://localhost:8081"
	}

	s := gm.NewSite(
		gm.WithSiteLogo("favicon-32x32.png"),
		gm.WithSiteTitle("Intentional Code"),
		gm.WithSiteURL("https://intentionalcode.com"),
		gm.WithSiteContentDir("content"),
		gm.WithSiteMode(gm.PreRender),
		gm.WithSiteRunner(runnerURL, gm.AuthNone, ""),
		gm.WithSitePublicDir("public"),
		gm.WithSiteOGImage("og-image.png"),
    	gm.WithSiteTwitterImage("twitter-image.png"),
	)

	if err := s.Start(); err != nil {
		log.Fatal(err)
	}
}
