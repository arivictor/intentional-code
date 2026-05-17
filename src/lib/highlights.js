const KEY = (slug) => `highlights:${slug}`;

export function getHighlights(slug) {
  try {
    return JSON.parse(localStorage.getItem(KEY(slug)) || "[]");
  } catch {
    return [];
  }
}

export function saveHighlights(slug, highlights) {
  localStorage.setItem(KEY(slug), JSON.stringify(highlights));
}

export function addHighlight(slug, highlight) {
  const existing = getHighlights(slug);
  const updated = [...existing, highlight];
  saveHighlights(slug, updated);
  return updated;
}

export function removeHighlight(slug, id) {
  const updated = getHighlights(slug).filter((h) => h.id !== id);
  saveHighlights(slug, updated);
  return updated;
}

/** Returns all highlights across every pattern, each entry tagged with its slug. */
export function getAllHighlights() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("highlights:")) {
      const slug = key.slice("highlights:".length);
      try {
        const items = JSON.parse(localStorage.getItem(key) || "[]");
        items.forEach((h) => results.push({ ...h, slug }));
      } catch {
        // skip malformed entries
      }
    }
  }
  return results;
}