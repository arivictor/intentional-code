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
const pythonPatterns = createPatternCollection('./src/content/python/patterns', ['creational', 'structural', 'behavioral', 'architectural']);
const terraformPatterns = createPatternCollection('./src/content/terraform/patterns', ['modules', 'state', 'delivery', 'architecture']);

const philosophy = createPhilosophyCollection('./src/content/philosophy');
const pythonPhilosophy = createPhilosophyCollection('./src/content/python/philosophy');
const terraformPhilosophy = createPhilosophyCollection('./src/content/terraform/philosophy');

const patternCategories = createCategoryCollection('./src/content/patterns');
const pythonPatternCategories = createCategoryCollection('./src/content/python/patterns');
const terraformPatternCategories = createCategoryCollection('./src/content/terraform/patterns');

const pages = createPagesCollection('./src/content/pages');
const pythonPages = createPagesCollection('./src/content/python/pages');
const terraformPages = createPagesCollection('./src/content/terraform/pages');

export const collections = {
  patterns,
  'python-patterns': pythonPatterns,
  'terraform-patterns': terraformPatterns,
  philosophy,
  'python-philosophy': pythonPhilosophy,
  'terraform-philosophy': terraformPhilosophy,
  'pattern-categories': patternCategories,
  'python-pattern-categories': pythonPatternCategories,
  'terraform-pattern-categories': terraformPatternCategories,
  pages,
  'python-pages': pythonPages,
  'terraform-pages': terraformPages,
};
