export const GO_SECTION = {
  basePath: '/go',
  label: 'Go',
  themeStorageKey: 'go-patterns-theme',
  summaryLabel: 'Go Idiom',
  categoryOrder: ['creational', 'structural', 'behavioral', 'architectural'],
  philosophyOrder: ['solid', 'tdd'],
  collections: {
    patterns: 'patterns',
    philosophy: 'philosophy',
    categories: 'pattern-categories',
    pages: 'pages',
  },
};

export const TERRAFORM_SECTION = {
  basePath: '/terraform',
  label: 'Terraform',
  themeStorageKey: 'terraform-patterns-theme',
  summaryLabel: 'Terraform Practice',
  categoryOrder: ['modules', 'state', 'delivery', 'architecture'],
  philosophyOrder: ['explicit-interfaces', 'state-first-design'],
  collections: {
    patterns: 'terraform-patterns',
    philosophy: 'terraform-philosophy',
    categories: 'terraform-pattern-categories',
    pages: 'terraform-pages',
  },
};
