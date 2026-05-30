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
      recognitionHook: z.string().optional(),
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

const patterns = createPatternCollection('./src/content/patterns', ['creational', 'structural', 'behavioral', 'architectural', 'concurrency']);

const philosophy = createPhilosophyCollection('./src/content/philosophy');

const patternCategories = createCategoryCollection('./src/content/patterns');

function createCourseCollection(base: string) {
  return defineCollection({
    loader: glob({ pattern: '*/index.md', base }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      level: z.enum(['beginner', 'intermediate', 'advanced']),
      tags: z.array(z.string()).default([]),
      isFeatured: z.boolean().default(false),
    }),
  });
}

function createChapterCollection(base: string) {
  return defineCollection({
    loader: glob({ pattern: '*/*/index.md', base }),
    schema: z.object({
      title: z.string(),
      order: z.number(),
      description: z.string().optional(),
    }),
  });
}

function createStepCollection(base: string) {
  return defineCollection({
    loader: glob({ pattern: ['**/*.md', '!**/index.md'], base }),
    schema: z.object({
      title: z.string(),
      order: z.number(),
      description: z.string().optional(),
    }),
  });
}

const pages = createPagesCollection('./src/content/pages');

const courses = createCourseCollection('./src/content/courses');
const courseChapters = createChapterCollection('./src/content/courses');
const courseSteps = createStepCollection('./src/content/courses');

export const collections = {
  patterns,
  philosophy,
  'pattern-categories': patternCategories,
  pages,
  courses,
  'course-chapters': courseChapters,
  'course-steps': courseSteps,
};
