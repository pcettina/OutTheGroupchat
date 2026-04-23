// Render brand/logo/logo-mark.svg to PNG previews at UI sizes.
// Uses the project's Playwright (chromium) — no extra install.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, 'logo-mark.svg');
const svg = await readFile(svgPath, 'utf8');

// Sizes to render — matches brand-identity.md workflow spec for icon + favicon.
// Plus 1024 (app store), 512 (large), 256, 180 (iOS home), 120, 60, 32, 16.
const sizes = [1024, 512, 256, 180, 120, 60, 32, 16];

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
const page = await context.newPage();

for (const px of sizes) {
  const html = `<!doctype html>
<html><head><style>
  html,body { margin:0; padding:0; background:#15110E; }
  body { display:grid; place-items:center; width:${px}px; height:${px}px; }
  svg { display:block; width:${px}px; height:${px}px; }
</style></head><body>${svg}</body></html>`;
  await page.setContent(html);
  await page.setViewportSize({ width: px, height: px });
  const el = await page.$('body');
  await el.screenshot({
    path: resolve(__dirname, `logo-mark-${px}.png`),
    omitBackground: false,
  });
  console.log(`rendered logo-mark-${px}.png`);
}

await browser.close();
