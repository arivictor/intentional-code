import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const patterns = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/index.md'], base: './src/content/patterns' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['creational', 'structural', 'behavioral', 'architectural']),
    intent: z.string(),
    idiomSummary: z.string(),
    relatedSlugs: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    isFeatured: z.boolean().default(false),
  }),
});

const pythonPatterns = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/index.md'], base: './src/content/python/patterns' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['creational', 'structural', 'behavioral', 'architectural']),
    intent: z.string(),
    idiomSummary: z.string(),
    relatedSlugs: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    isFeatured: z.boolean().default(false),
  }),
});

const philosophy = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/philosophy' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    intro: z.string().optional(),
  }),
});

const pythonPhilosophy = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/python/philosophy' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    intro: z.string().optional(),
  }),
});

const patternCategories = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/patterns' }),
  schema: z.object({
    title: z.string(),
    lede: z.string(),
  }),
});

const pythonPatternCategories = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/python/patterns' }),
  schema: z.object({
    title: z.string(),
    lede: z.string(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    catalogHeading: z.string().optional(),
  }),
});

const pythonPages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/python/pages' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    catalogHeading: z.string().optional(),
  }),
});

export const collections = {
  patterns,
  'python-patterns': pythonPatterns,
  philosophy,
  'python-philosophy': pythonPhilosophy,
  'pattern-categories': patternCategories,
  'python-pattern-categories': pythonPatternCategories,
  pages,
  'python-pages': pythonPages,
};
