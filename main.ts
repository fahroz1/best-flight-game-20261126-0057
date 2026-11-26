// main.ts — Program penyerahan Langit Nusantara (make.fun).
// Menyalin game/ dan screenshots/ dari samping file ini ke direktori output,
// lalu menulis dossier.json lewat buildDossier dari vendor/makefun-game.ts.
// Node 22, standard library saja. Deterministik, tanpa menghapus /output.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function resolveOutputDir(): string {
  const raw = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  return resolve(raw);
}

// Salin direktori secara rekursif dengan urutan entri terurut (deterministik).
function copyTreeSorted(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src).sort();
  for (const name of entries) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) {
      copyTreeSorted(from, to);
    } else {
      cpSync(from, to);
    }
  }
}

// Samakan atime/mtime semua file hasil salinan ke epoch tetap (determinisme).
const FIXED_EPOCH = new Date(0);
function normalizeMtimes(dir: string): void {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) normalizeMtimes(p);
    else utimesSync(p, FIXED_EPOCH, FIXED_EPOCH);
  }
}

// Kosongkan ISI direktori output saja — direktorinya sendiri tidak pernah dihapus.
function emptyOutputContents(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir).sort()) {
    rmSync(join(outDir, name), { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const outDir = resolveOutputDir();
  const gameSrc = join(SCRIPT_DIR, 'game');
  const shotsSrc = join(SCRIPT_DIR, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error('game/ tidak ditemukan di samping main.ts: ' + gameSrc);
  if (!existsSync(shotsSrc)) throw new Error('screenshots/ tidak ditemukan di samping main.ts: ' + shotsSrc);

  emptyOutputContents(outDir);
  copyTreeSorted(gameSrc, join(outDir, 'game'));
  copyTreeSorted(shotsSrc, join(outDir, 'screenshots'));
  normalizeMtimes(join(outDir, 'game'));
  normalizeMtimes(join(outDir, 'screenshots'));

  const dossier = await buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });

  // buildDossier mengembalikan isi dossier; tulis sebagai dossier.json.
  // Bentuknya bisa berupa string, Uint8Array (byte JSON), atau objek biasa.
  // Jika ia sudah menulis file sendiri (undefined), biarkan apa adanya.
  if (dossier !== undefined && dossier !== null) {
    const dossierPath = join(outDir, 'dossier.json');
    if (typeof dossier === 'string') {
      writeFileSync(dossierPath, dossier, 'utf8');
    } else if (dossier instanceof Uint8Array) {
      writeFileSync(dossierPath, dossier);
    } else {
      writeFileSync(dossierPath, JSON.stringify(dossier, null, 2) + '\n', 'utf8');
    }
  }
  console.log('OK: dossier ditulis ke ' + join(outDir, 'dossier.json'));
}

main().catch((err: unknown) => {
  console.error('main.ts gagal:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
