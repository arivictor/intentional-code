function entrySlug(entry) {
  return entry.id.replace(/\.md$/, '');
}

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
      .map((p) => ({
        slug: patternSlug(p),
        title: p.data.title,
        category: catKey,
      }));

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
    homePath = basePath,
    categoryOrder = [],
    philosophyOrder = [],
  } = options;

  const order = [
    { path: homePath, title: 'Home' },
    { path: `${basePath}/philosophy`, title: 'Philosophy' },
  ];

  for (const slug of philosophyOrder) {
    const page = philosophy.find((entry) => entrySlug(entry) === slug);
    if (page) {
      order.push({ path: `${basePath}/philosophy/${slug}`, title: page.data.title });
    }
  }

  for (const catKey of categoryOrder) {
    const category = categories.find((entry) => categorySlug(entry) === catKey);
    order.push({ path: `${basePath}/patterns/${catKey}`, title: category?.data.title ?? catKey });

    for (const pattern of patterns.filter((entry) => entry.data.category === catKey)) {
      const slug = patternSlug(pattern);
      order.push({ path: `${basePath}/patterns/${catKey}/${slug}`, title: pattern.data.title });
    }
  }

  return order;
}

export function buildAllContent(patterns, philosophy, options = {}) {
  const { basePath = '/go' } = options;

  return [
    ...philosophy.filter((entry) => entry.id !== 'index').map((entry) => {
      const slug = entrySlug(entry);
      return {
        slug,
        storageKey: `${basePath}/philosophy/${slug}`,
        title: entry.data.title,
        description: entry.data.description,
        url: `${basePath}/philosophy/${slug}`,
        type: 'philosophy',
      };
    }),
    ...patterns.map((entry) => {
      const slug = patternSlug(entry);
      return {
        slug,
        storageKey: `${basePath}/patterns/${entry.data.category}/${slug}`,
        title: entry.data.title,
        description: entry.data.intent,
        url: `${basePath}/patterns/${entry.data.category}/${slug}`,
        type: 'pattern',
      };
    }),
  ];
}

export function buildSearchData(patterns, philosophy, categories, options = {}) {
  const { basePath = '/go' } = options;

  return [
    { title: 'Philosophy', path: `${basePath}/philosophy`, type: 'page' },
    ...philosophy.filter((entry) => entry.id !== 'index').map((entry) => {
      const slug = entrySlug(entry);
      return { title: entry.data.title, path: `${basePath}/philosophy/${slug}`, type: 'page' };
    }),
    ...categories.map((entry) => {
      const catKey = categorySlug(entry);
      return { title: entry.data.title, path: `${basePath}/patterns/${catKey}`, type: 'category' };
    }),
    ...patterns.map((entry) => {
      const slug = patternSlug(entry);
      return {
        title: entry.data.title,
        path: `${basePath}/patterns/${entry.data.category}/${slug}`,
        type: 'pattern',
        subtitle: entry.data.intent,
      };
    }),
  ];
}

export function getPatternSummary(pattern) {
  return summaryForPattern(pattern);
}
