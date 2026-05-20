import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

function createPatternCollection(base: string, categories: [string, ...string[]]) {
  return defineCollection({
    loader: glob({ pattern: ['**/*.md', '!**/index.md'], base }),
    schema: z.object({
      title: z.string(),
      category: z.enum(categories),
      intent: z.string(),
      goIdiomSummary: z.string().optional(),
      idiomSummary: z.string().optional(),
      relatedSlugs: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      isFeatured: z.boolean().default(false),
    }),
  });
}

function createPhilosophyCollection(base: string) {
  return defineCollection({
    loader: glob({ pattern: '*.md', base }),
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      intro: z.string().optional(),
    }),
  });
}

function createCategoryCollection(base: string) {
  return defineCollection({
    loader: glob({ pattern: '*/index.md', base }),
    schema: z.object({
      title: z.string(),
      lede: z.string(),
    }),
  });
}

function createPagesCollection(base: string) {
  return defineCollection({
    loader: glob({ pattern: '*.md', base }),
    schema: z.object({
      title: z.string(),
      tagline: z.string().optional(),
      catalogHeading: z.string().optional(),
    }),
  });
}

const patterns = createPatternCollection('./src/content/patterns', ['creational', 'structural', 'behavioral', 'architectural']);

const terraformPatterns = createPatternCollection('./src/content/terraform/patterns', ['modules', 'state', 'delivery', 'architecture']);

const philosophy = createPhilosophyCollection('./src/content/philosophy');

const terraformPhilosophy = createPhilosophyCollection('./src/content/terraform/philosophy');

const patternCategories = createCategoryCollection('./src/content/patterns');

const terraformPatternCategories = createCategoryCollection('./src/content/terraform/patterns');

const pages = createPagesCollection('./src/content/pages');

const terraformPages = createPagesCollection('./src/content/terraform/pages');

export const collections = {
  patterns,
  philosophy,
  'pattern-categories': patternCategories,
  pages,
  'terraform-patterns': terraformPatterns,
  'terraform-philosophy': terraformPhilosophy,
  'terraform-pattern-categories': terraformPatternCategories,
  'terraform-pages': terraformPages,
};
