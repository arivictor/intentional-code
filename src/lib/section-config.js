export const GO_SECTION = {
  key: 'go',
  basePath: '/go',
  homePath: '/',
  label: 'Go',
  themeStorageKey: 'go-patterns-theme',
  summaryLabel: 'Go Idiom',
  homeTitle: 'Design Patterns in Go',
  homeDescription: 'Design patterns and SOLID principles, implemented in idiomatic Go — with examples, tradeoffs, and cross-references.',
  philosophyDescription: 'The principles that make Go design patterns work: SOLID and Test-Driven Development.',
  categoryOrder: ['creational', 'structural', 'behavioral', 'architectural', 'concurrency'],
  philosophyOrder: [
    'galls-law',
    'kiss',
    'yagni',
    'dry',
    'separation-of-concerns',
    'law-of-demeter',
    'composition-over-inheritance',
    'functional-programming',
    'clean-code',
    'solid',
    'tdd',
    'twelve-factor',
  ],
  courseOrder: ['api-framework'],
  collections: {
    patterns: 'patterns',
    philosophy: 'philosophy',
    categories: 'pattern-categories',
    pages: 'pages',
    courses: 'courses',
    courseChapters: 'course-chapters',
    courseSteps: 'course-steps',
  },
};

export const SECTION_MAP = {
  [GO_SECTION.key]: GO_SECTION,
};

export const SECTION_SWITCH_OPTIONS = [GO_SECTION];

export function getSection(key = 'go') {
  return SECTION_MAP[key] ?? GO_SECTION;
}

export function getSectionFromPath(pathname = '/go') {
  const sectionKey = pathname.split('/').filter(Boolean)[0] ?? GO_SECTION.key;
  return SECTION_MAP[sectionKey] ?? null;
}
