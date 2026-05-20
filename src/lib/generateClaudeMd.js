const STATIC_PRINCIPLES = `## Design principles

Apply these principles using Go's idioms:
- **Accept interfaces, return structs.** High-level code depends on small interfaces; infrastructure satisfies them.
- **Keep interfaces to one or two methods.** Go's implicit interface satisfaction makes this nearly free — a single-method interface is the norm, not the exception.
- **Prefer composition over inheritance.** Go has no inheritance. Embed types or accept interfaces to build behavior from small pieces.
- **Write a failing test before writing the function.** Go's implicit interfaces let you use simple fake structs instead of mocking frameworks — a \`type FakeRepo struct\` with the right methods is all you need.
- **Errors are values.** Return them, wrap them with \`fmt.Errorf("context: %w", err)\`, and handle them at the right level. Panic only for programmer errors, never for runtime conditions.`;

const STATIC_ANTIPATTERNS = `## Anti-patterns to flag

When reviewing Go code, flag these as opportunities for improvement:

- **Service functions that take \`*sql.DB\`, \`*http.Client\`, or other concrete infrastructure types directly.** These can't be tested without real infrastructure. Suggest extracting a small interface with only the methods the function actually uses.
- **Fat interfaces.** If an interface has more than three or four methods and not every consumer uses all of them, suggest splitting it. Go rewards small, focused interfaces.
- **Global singletons for mutable state.** A global \`*sql.DB\`, logger, or service client creates hidden coupling and breaks parallel tests. Suggest passing dependencies through constructors instead.
- **Business logic in HTTP handlers.** Handlers should translate HTTP to domain calls and back. If there's conditional logic beyond routing, extract it to a service or domain method that can be tested without the HTTP layer.
- **Goroutines without a shutdown path.** Any goroutine started at runtime needs a way to stop — a context cancellation, a done channel, or a WaitGroup. A goroutine that leaks on shutdown is a resource leak.`;

/**
 * Generate a CLAUDE.md file from a set of patterns.
 *
 * @param {Array<{slug: string, storageKey?: string, title: string, category: string, intent: string, goIdiomSummary?: string, summary?: string, relatedSlugs?: string[]}>} patterns
 *   Array of pattern objects used to build the reference content. Go entries may provide
 *   `goIdiomSummary`, while non-Go entries can use the generic `summary` field. The formatter
 *   prefers `goIdiomSummary` and falls back to `summary` when needed.
 * @param {{includeAll?: boolean, savedSlugs?: string[]}} [options={}]
 *   Options controlling whether all patterns or only bookmarked patterns are included.
 * @returns {string} The generated CLAUDE.md content
 */
export function generateClaudeMd(patterns, { includeAll = false, savedSlugs = [] } = {}) {
  const selected = includeAll
    ? [...patterns]
    : patterns.filter((p) => savedSlugs.includes(p.storageKey ?? p.slug));

  // Sort by category order, then alphabetically within category
  const CATEGORY_ORDER = ['creational', 'structural', 'behavioral', 'architectural'];
  selected.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.title.localeCompare(b.title);
  });

  const header = `# Go Architecture — Claude Reference

> Generated from Intentional Code · https://intentionalcode.com
> Drop this file in your project root as \`CLAUDE.md\`.
> Claude Code will use it as context when helping with architecture decisions.`;

  const patternBlocks = selected.length === 0
    ? '\n_No patterns selected._\n'
    : selected.map((p) => formatPatternBlock(p)).join('\n\n');

  const patternSection = `## Pattern reference

When reviewing or writing code, recognise these signals and suggest the appropriate pattern:

${patternBlocks}`;

  return [header, STATIC_PRINCIPLES, patternSection, STATIC_ANTIPATTERNS].join('\n\n') + '\n';
}

function formatPatternBlock(p) {
  const lines = [
    `### ${p.title} (${p.category})`,
    `**Signal:** ${p.intent}`,
    `**Go approach:** ${p.goIdiomSummary ?? p.summary ?? ''}`,
  ];

  if (p.relatedSlugs && p.relatedSlugs.length > 0) {
    lines.push(`**See also:** ${p.relatedSlugs.join(', ')}`);
  }

  return lines.join('\n');
}
