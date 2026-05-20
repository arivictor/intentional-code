export const LANGUAGE_CONFIG = {
  go: {
    slug: 'go',
    label: 'Go',
    basePath: '/go',
    summaryHeading: 'Go Idiom',
    siteTitle: 'Intentional Code with Go',
    homeTitle: 'Design Patterns in Go',
    homeDescription: 'Design patterns and SOLID principles, implemented in idiomatic Go — with examples, tradeoffs, and cross-references.',
    philosophyDescription: 'The principles that make Go design patterns work: SOLID and Test-Driven Development.',
    themeStorageKey: 'intentional-code-theme',
  },
  python: {
    slug: 'python',
    label: 'Python',
    basePath: '/python',
    summaryHeading: 'Python Style',
    siteTitle: 'Intentional Code with Python',
    homeTitle: 'Design Patterns in Python',
    homeDescription: 'Design patterns and SOLID principles, implemented in idiomatic Python — with examples, tradeoffs, and cross-references.',
    philosophyDescription: 'The principles that make Python design patterns work: SOLID and Test-Driven Development.',
    themeStorageKey: 'intentional-code-theme',
  },
};

export const COLLECTION_NAMES = {
  go: {
    patterns: 'patterns',
    philosophy: 'philosophy',
    categories: 'pattern-categories',
    pages: 'pages',
  },
  python: {
    patterns: 'python-patterns',
    philosophy: 'python-philosophy',
    categories: 'python-pattern-categories',
    pages: 'python-pages',
  },
};

export function getLanguageConfig(language = 'go') {
  return LANGUAGE_CONFIG[language] ?? LANGUAGE_CONFIG.go;
}

export function getCollectionNames(language = 'go') {
  return COLLECTION_NAMES[language] ?? COLLECTION_NAMES.go;
}

export function switchLanguagePath(pathname = '/', targetLanguage = 'go') {
  const target = getLanguageConfig(targetLanguage);
  const parts = pathname.split('/').filter(Boolean);
  const currentLanguage = parts[0];
  if (!LANGUAGE_CONFIG[currentLanguage]) {
    return target.basePath;
  }
  parts[0] = target.slug;
  return `/${parts.join('/')}`;
}
