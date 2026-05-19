import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sun, Moon, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import CommandPalette from "./CommandPalette";

export default function TopBar({ theme, onToggleTheme, onToggleSidebar }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Link to="/go" className="flex items-center gap-2 font-semibold text-foreground shrink-0">
            <span className="text-primary font-mono text-lg font-bold">Go</span>
            <span className="hidden sm:inline text-sm tracking-tight">Intentional Code</span>
          </Link>

          <div className="flex-1" />

          {/* Search trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="ml-2 text-xs bg-background border border-border px-1 py-0.5 rounded font-mono">⌘K</kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-8 w-8"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}