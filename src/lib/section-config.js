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
  categoryOrder: ['creational', 'structural', 'behavioral', 'architectural'],
  philosophyOrder: ['solid', 'tdd'],
  collections: {
    patterns: 'patterns',
    philosophy: 'philosophy',
    categories: 'pattern-categories',
    pages: 'pages',
  },
};

export const PYTHON_SECTION = {
  key: 'python',
  basePath: '/python',
  label: 'Python',
  themeStorageKey: 'python-patterns-theme',
  summaryLabel: 'Python Style',
  homeTitle: 'Design Patterns in Python',
  homeDescription: 'Design patterns and SOLID principles, implemented in idiomatic Python — with examples, tradeoffs, and cross-references.',
  philosophyDescription: 'The principles that make Python design patterns work: SOLID and Test-Driven Development.',
  categoryOrder: ['creational', 'structural', 'behavioral', 'architectural'],
  philosophyOrder: ['solid', 'tdd'],
  collections: {
    patterns: 'python-patterns',
    philosophy: 'python-philosophy',
    categories: 'python-pattern-categories',
    pages: 'python-pages',
  },
};

export const TERRAFORM_SECTION = {
  key: 'terraform',
  basePath: '/terraform',
  label: 'Terraform',
  themeStorageKey: 'terraform-patterns-theme',
  summaryLabel: 'Terraform Practice',
  homeTitle: 'Terraform Patterns and Architecture',
  homeDescription: 'Terraform-specific patterns for modules, state, delivery, and platform architecture.',
  philosophyDescription: 'The Terraform design principles behind stable modules, clear state boundaries, and maintainable delivery workflows.',
  categoryOrder: ['modules', 'state', 'delivery', 'architecture'],
  philosophyOrder: ['explicit-interfaces', 'state-first-design'],
  collections: {
    patterns: 'terraform-patterns',
    philosophy: 'terraform-philosophy',
    categories: 'terraform-pattern-categories',
    pages: 'terraform-pages',
  },
};

export const SECTION_MAP = {
  [GO_SECTION.key]: GO_SECTION,
  [PYTHON_SECTION.key]: PYTHON_SECTION,
  [TERRAFORM_SECTION.key]: TERRAFORM_SECTION,
};

export const SECTION_SWITCH_OPTIONS = [GO_SECTION];

export function getSection(key = 'go') {
  return SECTION_MAP[key] ?? GO_SECTION;
}

export function getSectionFromPath(pathname = '/go') {
  const sectionKey = pathname.split('/').filter(Boolean)[0] ?? GO_SECTION.key;
  return SECTION_MAP[sectionKey] ?? null;
}
