package main

import (
	"intentionalcode"
	"log"
)

func main() {
	app := intentionalcode.App{
		ContentDir:   "content",
		LayoutPath:   "templates/layout.html",
		TemplateGlob: "templates/*.html",
		Mode:         intentionalcode.PreRender,
	}
	if err := app.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
