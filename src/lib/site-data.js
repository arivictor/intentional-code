function entrySlug(entry) {
  return entry.id.replace(/\.md$/, '');
}

// Category entries now live at patterns/creational/index.md → id = "creational/index"
function categorySlug(entry) {
  return entry.id.replace(/\/index$/, '');
}

function patternSlug(entry) {
  return entrySlug(entry).split('/')[1];
}

function summaryForPattern(pattern) {
  return pattern.data.idiomSummary ?? pattern.data.goIdiomSummary ?? '';
}

export function buildNavData(patterns, categories, options = {}) {
  const { categoryOrder = [] } = options;

  return categoryOrder.map((catKey) => {
    const category = categories.find((c) => categorySlug(c) === catKey);
    const catPatterns = patterns
      .filter((p) => p.data.category === catKey)
      .map((p) => {
        const slug = patternSlug(p);
        return { slug, title: p.data.title, category: catKey };
      });
    return {
      slug: catKey,
      title: category?.data.title ?? catKey,
      patterns: catPatterns,
    };
  });
}

export function buildNavOrder(patterns, philosophy, categories, options = {}) {
  const {
    basePath = '/go',
    categoryOrder = [],
    philosophyOrder = [],
  } = options;

  const order = [
    { path: basePath, title: 'Home' },
    { path: `${basePath}/philosophy`, title: 'Philosophy' },
  ];

  for (const slug of philosophyOrder) {
    const p = philosophy.find((e) => entrySlug(e) === slug);
    if (p) order.push({ path: `${basePath}/philosophy/${slug}`, title: p.data.title });
  }

  for (const catKey of categoryOrder) {
    const category = categories.find((c) => categorySlug(c) === catKey);
    order.push({ path: `${basePath}/patterns/${catKey}`, title: category?.data.title ?? catKey });
    for (const p of patterns.filter((e) => e.data.category === catKey)) {
      const slug = patternSlug(p);
      order.push({ path: `${basePath}/patterns/${catKey}/${slug}`, title: p.data.title });
    }
  }

  return order;
}

export function buildAllContent(patterns, philosophy, options = {}) {
  const { basePath = '/go' } = options;

  return [
    ...philosophy.filter((e) => e.id !== 'index').map((e) => {
      const slug = entrySlug(e);
      return {
        slug,
        title: e.data.title,
        description: e.data.description,
        url: `${basePath}/philosophy/${slug}`,
        type: 'philosophy',
      };
    }),
    ...patterns.map((e) => {
      const slug = patternSlug(e);
      return {
        slug,
        title: e.data.title,
        description: e.data.intent,
        url: `${basePath}/patterns/${e.data.category}/${slug}`,
        type: 'pattern',
      };
    }),
  ];
}

export function buildSearchData(patterns, philosophy, categories, options = {}) {
  const { basePath = '/go' } = options;

  return [
    { title: 'Philosophy', path: `${basePath}/philosophy`, type: 'page' },
    ...philosophy.filter((e) => e.id !== 'index').map((e) => {
      const slug = entrySlug(e);
      return { title: e.data.title, path: `${basePath}/philosophy/${slug}`, type: 'page' };
    }),
    ...categories.map((c) => {
      const catKey = categorySlug(c);
      return { title: c.data.title, path: `${basePath}/patterns/${catKey}`, type: 'category' };
    }),
    ...patterns.map((e) => {
      const slug = patternSlug(e);
      return {
        title: e.data.title,
        path: `${basePath}/patterns/${e.data.category}/${slug}`,
        type: 'pattern',
        subtitle: e.data.intent,
      };
    }),
  ];
}

export function getPatternSummary(pattern) {
  return summaryForPattern(pattern);
}
