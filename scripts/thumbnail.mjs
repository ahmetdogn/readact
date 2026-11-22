// Renders the Devpost (3:2) and YouTube (16:9) thumbnails from scripts/thumbnail.html.
// Usage: node scripts/thumbnail.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const page = pathToFileURL(resolve('scripts/thumbnail.html')).href;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
for (const [name, w, h, hash] of [
  ['thumbnail-devpost.png', 1500, 1000, ''],
  ['thumbnail-youtube.png', 1600, 900, '#wide'],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(page + hash);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `docs/${name}` });
  await ctx.close();
}
await browser.close();
console.log('Thumbnails written to docs/');
