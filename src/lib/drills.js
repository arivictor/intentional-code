const KEY = "b44_drill_best_streak";

export function getBestStreak() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

// Persists `streak` only when it beats the stored record. Returns the streak
// that is now the record (the new one if it won, otherwise the existing best),
// so callers can show "new best!" without a second read.
export function recordStreak(streak) {
  try {
    const best = getBestStreak();
    if (streak > best) {
      localStorage.setItem(KEY, String(streak));
      return streak;
    }
    return best;
  } catch {
    return streak;
  }
}
