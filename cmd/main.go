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
	}
	if err := app.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
