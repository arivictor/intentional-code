export const CATEGORY_ORDER = ['creational', 'structural', 'behavioral', 'architectural'];

function entrySlug(entry) {
  return entry.id.replace(/\.md$/, '');
}

// Category entries now live at patterns/creational/index.md → id = "creational/index"
function categorySlug(entry) {
  return entry.id.replace(/\/index$/, '');
}

export function buildNavData(patterns, categories) {
  return CATEGORY_ORDER.map((catKey) => {
    const category = categories.find((c) => categorySlug(c) === catKey);
    const catPatterns = patterns
      .filter((p) => p.data.category === catKey)
      .map((p) => {
        const slug = entrySlug(p).split('/')[1];
        return { slug, title: p.data.title, category: catKey };
      });
    return {
      slug: catKey,
      title: category?.data.title ?? catKey,
      patterns: catPatterns,
    };
  });
}

export function buildNavOrder(patterns, philosophy, categories, basePath = '/go') {
  const order = [
    { path: basePath, title: 'Home' },
    { path: `${basePath}/philosophy`, title: 'Philosophy' },
  ];

  const philoOrder = ['solid', 'tdd'];
  for (const slug of philoOrder) {
    const p = philosophy.find((e) => entrySlug(e) === slug);
    if (p) order.push({ path: `${basePath}/philosophy/${slug}`, title: p.data.title });
  }

  for (const catKey of CATEGORY_ORDER) {
    const category = categories.find((c) => categorySlug(c) === catKey);
    order.push({ path: `${basePath}/patterns/${catKey}`, title: category?.data.title ?? catKey });
    for (const p of patterns.filter((e) => e.data.category === catKey)) {
      const slug = entrySlug(p).split('/')[1];
      order.push({ path: `${basePath}/patterns/${catKey}/${slug}`, title: p.data.title });
    }
  }

  return order;
}

export function buildAllContent(patterns, philosophy, basePath = '/go') {
  return [
    ...philosophy.filter((e) => e.id !== 'index').map((e) => {
      const slug = entrySlug(e);
      return {
        slug,
        storageKey: `${basePath}/philosophy/${slug}`,
        title: e.data.title,
        description: e.data.description,
        url: `${basePath}/philosophy/${slug}`,
        type: 'philosophy',
      };
    }),
    ...patterns.map((e) => {
      const slug = entrySlug(e).split('/')[1];
      return {
        slug,
        storageKey: `${basePath}/patterns/${e.data.category}/${slug}`,
        title: e.data.title,
        description: e.data.intent,
        url: `${basePath}/patterns/${e.data.category}/${slug}`,
        type: 'pattern',
      };
    }),
  ];
}

export function buildSearchData(patterns, philosophy, categories, basePath = '/go') {
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
      const slug = entrySlug(e).split('/')[1];
      return {
        title: e.data.title,
        path: `${basePath}/patterns/${e.data.category}/${slug}`,
        type: 'pattern',
        subtitle: e.data.intent,
      };
    }),
  ];
}
