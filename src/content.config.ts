import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const patterns = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/index.md'], base: './src/content/patterns' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['creational', 'structural', 'behavioral', 'architectural']),
    intent: z.string(),
    goIdiomSummary: z.string(),
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

const patternCategories = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/patterns' }),
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

export const collections = {
  patterns,
  philosophy,
  'pattern-categories': patternCategories,
  pages,
};
