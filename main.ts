// main.ts — hand-in program for the "Make the best flight game" entry (Node 22, stdlib only).
// Copies game/ and screenshots/ from this repository into the output directory
// (MAKEFUN_OUTPUT_DIR, or /output) and writes dossier.json with buildDossier
// from vendor/makefun-game.ts. Deterministic: two runs write identical bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(name) {
  const src = join(REPO_ROOT, name);
  const dst = join(OUTPUT_DIR, name);
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    throw new Error(`main.ts: ${name}/ is missing from the repository`);
  }
  mkdirSync(dst, { recursive: true });
  // Sorted copy so the directory listing order is stable across runs.
  const entries = readdirSync(src, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const e of entries) {
    const from = join(src, e.name);
    const to = join(dst, e.name);
    if (e.isDirectory()) {
      cpSync(from, to, { recursive: true, dereference: false });
    } else if (e.isFile()) {
      cpSync(from, to, { dereference: false });
    }
    // Symlinks and other special entries are skipped: the gate wants plain files.
  }
}

function countFiles(dir) {
  let files = 0, bytes = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = countFiles(p);
      files += sub.files; bytes += sub.bytes;
    } else if (e.isFile()) {
      files += 1; bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}

function validate() {
  // Fail loudly instead of handing in a broken entry.
  const indexHtml = join(OUTPUT_DIR, 'game', 'index.html');
  if (!existsSync(indexHtml)) throw new Error('main.ts: game/index.html missing from output');
  if (statSync(indexHtml).size > 1024 * 1024) throw new Error('main.ts: game/index.html over 1 MiB');
  const shots = readdirSync(join(OUTPUT_DIR, 'screenshots'))
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`main.ts: expected 3-4 screenshots, found ${shots.length}`);
  }
  for (const s of shots) {
    const size = statSync(join(OUTPUT_DIR, 'screenshots', s)).size;
    if (size > 262144) throw new Error(`main.ts: screenshot ${s} over 256 KiB (${size} bytes)`);
    if (!/\.(png|jpe?g)$/i.test(s)) throw new Error(`main.ts: screenshot ${s} is not a PNG or JPEG`);
  }
  const game = countFiles(join(OUTPUT_DIR, 'game'));
  if (game.bytes > 50331648) throw new Error(`main.ts: game/ over 48 MiB (${game.bytes} bytes)`);
  const dossierSize = statSync(join(OUTPUT_DIR, 'dossier.json')).size;
  if (dossierSize === 0 || dossierSize > 1572864) {
    throw new Error(`main.ts: dossier.json has unexpected size ${dossierSize}`);
  }
  console.log(`main.ts: game/ ${game.files} files, ${game.bytes} bytes; screenshots ${shots.length}; dossier.json ${dossierSize} bytes`);
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  // Empty any previous run's output so stale files can never leak into the entry.
  for (const e of readdirSync(OUTPUT_DIR)) {
    rmSync(join(OUTPUT_DIR, e), { recursive: true, force: true });
  }
  copyTree('game');
  copyTree('screenshots');
  const dossier = buildDossier(OUTPUT_DIR, CAPS);
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  validate();
  console.log(`main.ts: wrote ${OUTPUT_DIR} (dossier.json ${dossier.length} bytes)`);
}

main();
