// Download Fontshare woff2 subsets for self-hosting via next/font/local.
// Per DESIGN_BRIEF.md §4: Cabinet Grotesk (display) + Switzer (body) + Sentient italic (editorial).
// License: Fontshare ITF FFL — free commercial use at any scale.
// Run: node public/fonts/download-fontshare.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal weight set to stay under the ~60KB total the brief targets.
// Cabinet Grotesk: Medium (500) for subtle display, Bold (700) for hero/headings.
// Switzer: Regular (400) for body, Medium (500) for button labels and UI emphasis.
// Sentient: Italic 400 for editorial accents.
// Fontshare sources. Sentient italic weights return 500 on their CSS API (all italic variants,
// tested 2026-04-23). Fallback: Instrument Serif Italic via Google Fonts — same editorial register,
// already approved in the logo concept renders. Swap back to Fontshare Sentient when their API heals.
const sources = [
  { family: 'cabinet-grotesk', weight: 500, style: 'normal', outName: 'CabinetGrotesk-Medium.woff2' },
  { family: 'cabinet-grotesk', weight: 700, style: 'normal', outName: 'CabinetGrotesk-Bold.woff2' },
  { family: 'switzer',         weight: 400, style: 'normal', outName: 'Switzer-Regular.woff2' },
  { family: 'switzer',         weight: 500, style: 'normal', outName: 'Switzer-Medium.woff2' },
];

// Google Fonts fallback for the editorial italic role.
const googleSources = [
  {
    cssUrl: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap',
    outName: 'InstrumentSerif-Italic.ttf',
  },
];

async function fetchCss(family, weight, style) {
  // Fontshare API accepts e.g. @700 for normal weight 700, or @400i for italic 400
  const weightSpec = style === 'italic' ? `${weight}i` : `${weight}`;
  const url = `https://api.fontshare.com/v2/css?f[]=${family}@${weightSpec}&display=swap`;
  const res = await fetch(url, {
    headers: {
      // Browser-like UA so Fontshare returns woff2, not TTF fallback
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) throw new Error(`CSS fetch failed ${res.status} for ${family}@${weightSpec}`);
  return res.text();
}

function extractFontUrl(css) {
  // Match woff2 first, fall back to ttf. Fontshare returns woff2;
  // Google Fonts returns ttf for some UAs.
  const woff2Matches = [...css.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g)];
  const ttfMatches = [...css.matchAll(/url\(["']?([^"')]+\.ttf)["']?\)/g)];
  const matches = woff2Matches.length ? woff2Matches : ttfMatches;
  if (matches.length === 0) {
    throw new Error('No woff2 or ttf URL found in CSS');
  }
  let url = matches[0][1];
  if (url.startsWith('//')) url = 'https:' + url;
  return url;
}

async function downloadOne({ family, weight, style, outName }) {
  const css = await fetchCss(family, weight, style);
  const woff2Url = extractFontUrl(css);
  const res = await fetch(woff2Url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`woff2 fetch failed ${res.status} for ${woff2Url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = resolve(__dirname, outName);
  await writeFile(outPath, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`✓ ${outName}  ${kb} KB`);
  return buf.length;
}

async function downloadFromCss(cssUrl, outName) {
  const res = await fetch(cssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`CSS fetch failed ${res.status}`);
  const css = await res.text();
  const woff2Url = extractFontUrl(css);
  const fontRes = await fetch(woff2Url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!fontRes.ok) throw new Error(`font fetch failed ${fontRes.status}`);
  const buf = Buffer.from(await fontRes.arrayBuffer());
  const outPath = resolve(__dirname, outName);
  await writeFile(outPath, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`✓ ${outName}  ${kb} KB`);
  return buf.length;
}

let total = 0;
for (const s of sources) {
  try {
    total += await downloadOne(s);
  } catch (e) {
    console.error(`✗ ${s.outName}: ${e.message}`);
    process.exitCode = 1;
  }
}
for (const g of googleSources) {
  try {
    total += await downloadFromCss(g.cssUrl, g.outName);
  } catch (e) {
    console.error(`✗ ${g.outName}: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`total: ${(total / 1024).toFixed(1)} KB`);
