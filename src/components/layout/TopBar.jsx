import React, { useState, useEffect } from "react";
import { Sun, Moon, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import CommandPalette from "./CommandPalette";
import { getLanguageConfig, switchLanguagePath } from "@/lib/languages";

export default function TopBar({ searchData, pathname = "/go", currentLanguage = "go" }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const languageConfig = getLanguageConfig(currentLanguage);
  const otherLanguage = currentLanguage === 'go' ? 'python' : 'go';
  const otherLanguageConfig = getLanguageConfig(otherLanguage);

  useEffect(() => {
    const stored = localStorage.getItem(languageConfig.themeStorageKey);
    setTheme(stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, [languageConfig.themeStorageKey]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(languageConfig.themeStorageKey, theme);
  }, [languageConfig.themeStorageKey, theme]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleSidebar = () => document.dispatchEvent(new CustomEvent('sidebar-toggle'));

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <a href={languageConfig.basePath} className="flex items-center gap-2 font-semibold text-foreground shrink-0">
            <span className="text-primary font-mono text-lg font-bold">{languageConfig.label}</span>
            <span className="hidden sm:inline text-sm tracking-tight">Intentional Code</span>
          </a>

          <div className="flex-1" />

          <div className="hidden sm:flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
            <a
              href={switchLanguagePath(pathname, 'go')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${currentLanguage === 'go' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Go
            </a>
            <a
              href={switchLanguagePath(pathname, 'python')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${currentLanguage === 'python' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Python
            </a>
          </div>

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

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <a
            href={switchLanguagePath(pathname, otherLanguage)}
            className="sm:hidden text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Switch to ${otherLanguageConfig.label}`}
          >
            {otherLanguageConfig.label}
          </a>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} searchData={searchData} />
    </>
  );
}
