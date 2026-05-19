import { PATTERNS, CATEGORIES } from '../src/lib/content/patterns.js';
import { writeFileSync } from 'fs';

const BASE = 'https://intentionalcode.com';

const urls = [
  BASE + '/',
  BASE + '/go',
  BASE + '/go/philosophy',
  BASE + '/go/philosophy/solid',
  BASE + '/go/philosophy/tdd',
  ...Object.keys(CATEGORIES).map(cat => `${BASE}/go/patterns/${cat}`),
  ...PATTERNS.map(p => `${BASE}/go/patterns/${p.category}/${p.slug}`),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>`;

writeFileSync('public/sitemap.xml', xml);
console.log(`Sitemap: ${urls.length} URLs written to public/sitemap.xml`);
