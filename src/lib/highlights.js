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