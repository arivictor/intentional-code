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

function courseSlug(entry) {
  return entry.id.replace(/\/index\.md$/, '');
}

function stepFullSlug(entry) {
  return entry.id.replace(/\.md$/, '');
}

export function buildCourseNavData(courses, chapters, steps) {
  return courses.map((course) => {
    const cSlug = courseSlug(course);
    const courseChapters = chapters
      .filter((ch) => courseSlug(ch).startsWith(cSlug + '/'))
      .sort((a, b) => a.data.order - b.data.order)
      .map((ch) => {
        const chSlug = courseSlug(ch);
        const chapterSteps = steps
          .filter((s) => stepFullSlug(s).startsWith(chSlug + '/'))
          .sort((a, b) => a.data.order - b.data.order)
          .map((s) => ({
            slug: stepFullSlug(s),
            title: s.data.title,
          }));
        return {
          slug: chSlug,
          title: ch.data.title,
          steps: chapterSteps,
        };
      });
    return {
      slug: cSlug,
      title: course.data.title,
      chapters: courseChapters,
    };
  });
}

export function buildCourseNavOrder(courses, chapters, steps, { basePath = '/go' } = {}) {
  const order = [{ path: `${basePath}/courses`, title: 'Practice' }];
  const navData = buildCourseNavData(courses, chapters, steps);
  for (const course of navData) {
    order.push({ path: `${basePath}/courses/${course.slug}`, title: course.title });
    for (const chapter of course.chapters) {
      for (const step of chapter.steps) {
        const [, , stepName] = step.slug.split('/');
        order.push({ path: `${basePath}/courses/${step.slug}`, title: step.title });
      }
    }
  }
  return order;
}

// Rich course objects for the homepage: course metadata plus an ordered, flat
// list of steps (each with the localStorage key used for read/bookmark state),
// so the homepage can compute per-course progress and the next unread step.
export function buildCoursesData(courses, chapters, steps, { basePath = '/go' } = {}) {
  const stepDescBySlug = Object.fromEntries(steps.map((s) => [stepFullSlug(s), s.data.description ?? '']));
  const metaBySlug = Object.fromEntries(courses.map((c) => [courseSlug(c), c.data]));

  return buildCourseNavData(courses, chapters, steps).map((course) => {
    const meta = metaBySlug[course.slug] ?? {};
    const flatSteps = course.chapters.flatMap((chapter) =>
      chapter.steps.map((step) => ({
        slug: step.slug,
        storageKey: `${basePath}/courses/${step.slug}`,
        url: `${basePath}/courses/${step.slug}`,
        title: step.title,
        description: stepDescBySlug[step.slug] ?? '',
      }))
    );
    return {
      slug: course.slug,
      title: course.title,
      description: meta.description ?? '',
      level: meta.level ?? 'intermediate',
      tags: meta.tags ?? [],
      isFeatured: meta.isFeatured ?? false,
      url: `${basePath}/courses/${course.slug}`,
      steps: flatSteps,
    };
  });
}

// Flat list of course steps shaped like buildAllContent items, so course steps
// participate in saved-content lookups and the homepage read tracker.
export function buildCourseContent(courses, chapters, steps, { basePath = '/go' } = {}) {
  return buildCoursesData(courses, chapters, steps, { basePath }).flatMap((course) =>
    course.steps.map((step) => ({
      slug: step.slug,
      storageKey: step.storageKey,
      title: step.title,
      description: step.description || course.title,
      url: step.url,
      type: 'course',
    }))
  );
}
