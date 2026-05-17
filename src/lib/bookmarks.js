const KEY = "b44_bookmarks";

export function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function isBookmarked(slug) {
  return getBookmarks().includes(slug);
}

export function addBookmark(slug) {
  const current = getBookmarks();
  if (!current.includes(slug)) {
    localStorage.setItem(KEY, JSON.stringify([...current, slug]));
  }
}

export function removeBookmark(slug) {
  localStorage.setItem(KEY, JSON.stringify(getBookmarks().filter((s) => s !== slug)));
}

export function toggleBookmark(slug) {
  if (isBookmarked(slug)) {
    removeBookmark(slug);
    return false;
  } else {
    addBookmark(slug);
    return true;
  }
}