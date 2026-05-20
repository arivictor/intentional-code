/**
 * Generates public/sitemap.xml from the Astro build output in dist/.
 * Run after `npm run build`: node scripts/generate-sitemap.js
 */
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const BASE = 'https://intentionalcode.com';
const DIST = new URL('../dist', import.meta.url).pathname;

function findIndexFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findIndexFiles(full));
    } else if (entry === 'index.html') {
      results.push(full);
    }
  }
  return results;
}

const urls = findIndexFiles(DIST)
  .map((file) => {
    const rel = relative(DIST, file);         // e.g. "go/patterns/creational/singleton/index.html"
    const path = rel.replace(/\/index\.html$/, '').replace(/^index\.html$/, '');
    return BASE + (path ? `/${path}` : '/');
  })
  .filter((url) => !url.includes('/404'))
  .sort();

const now = new Date().toISOString().split('T')[0];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc><lastmod>${now}</lastmod></url>`).join('\n')}
</urlset>`;

writeFileSync(new URL('../public/sitemap.xml', import.meta.url).pathname, xml);
console.log(`Sitemap: ${urls.length} URLs written to public/sitemap.xml`);
