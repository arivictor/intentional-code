import React, { useState, useEffect } from "react";
import { Sun, Moon, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import CommandPalette from "./CommandPalette";
export default function TopBar({
  searchData,
  pathname = "/go",
  basePath = "/go",
  homePath = basePath,
  sectionLabel = "Go",
  themeStorageKey = "go-patterns-theme",
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const stored = localStorage.getItem(themeStorageKey);
    setTheme(stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, [themeStorageKey]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(themeStorageKey, theme);
  }, [theme, themeStorageKey]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleSidebar = () => document.dispatchEvent(new CustomEvent("sidebar-toggle"));

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
        <div className="flex h-12 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={toggleSidebar}
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <a href={homePath} className="flex items-center shrink-0 select-none gap-1">
              <span className="font-bold text-sm tracking-tight text-foreground">Intentional Code</span>
              <span className="text-primary font-bold text-sm">_</span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 h-8 px-3 rounded border border-border bg-muted/40 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Search"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search…</span>
              <kbd className="ml-3 text-[11px] bg-background border border-border px-1.5 py-0.5 rounded font-mono leading-none">⌘K</kbd>
            </button>
            <button
              className="sm:hidden p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} searchData={searchData} />
    </>
  );
}
