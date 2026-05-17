const KEY = "read_patterns";

export function getReadPatterns() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function markPatternRead(slug) {
  const read = getReadPatterns();
  if (!read.includes(slug)) {
    localStorage.setItem(KEY, JSON.stringify([...read, slug]));
  }
}

export function markPatternUnread(slug) {
  const read = getReadPatterns();
  localStorage.setItem(KEY, JSON.stringify(read.filter((s) => s !== slug)));
}

export function isPatternRead(slug) {
  return getReadPatterns().includes(slug);
}