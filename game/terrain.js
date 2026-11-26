// terrain.js — deterministic heightfield terrain: mountains, coast, sea, river, forest, runway.
// World: X east, Z south, Y up. Sea level y = 0. Terrain spans [-900, 900] in X and Z.

import { mulberry32, clamp, lerp, emptyMesh, addCone, addCylinder, addFlatQuad, addBox, finalizeMesh } from './gl.js';

// Hash-based value noise: deterministic for any (x, z) and seed.
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) / 4294967296);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}
export function fbm(x, z, seed, octaves) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm; // 0..1
}

// River centerline: a winding path running north-south.
export function riverX(z) { return 260 * Math.sin(z * 0.0031) + 90 * Math.sin(z * 0.0013 + 1.7); }

export function makeTerrain(level) {
  const { seed, mountainAmp, seaLevel, runway } = level;
  const SIZE = 1800, HALF = SIZE / 2;

  // Raw height before runway flattening / river carving.
  function rawHeight(x, z) {
    const coast = fbm(x * 0.0016 + 7.3, z * 0.0016 + 2.1, seed, 4); // 0..1
    const hills = fbm(x * 0.006 + 1.2, z * 0.006 + 8.8, seed + 5, 4);
    const peaks = fbm(x * 0.0022 + 4.4, z * 0.0022 + 5.5, seed + 9, 4);
    // Coast: west side (x < -350) sinks toward the sea.
    const coastFall = clamp((-350 - x) / 500, 0, 1);
    let h = -26 * coastFall * coastFall + coast * 14 + hills * 10;
    h += Math.pow(peaks, 2.6) * mountainAmp;
    return h;
  }

  function heightAt(x, z) {
    let h = rawHeight(x, z);
    // River valley carve.
    const rx = riverX(z);
    const dRiver = Math.abs(x - rx);
    if (dRiver < 55) h = lerp(Math.min(h, 1.5), h, smooth(clamp((dRiver - 12) / 43, 0, 1)));
    // Runway plateau: flatten to runway height near the strip.
    const dx = x - runway.x, dz = z - runway.z;
    const dRun = Math.hypot(dx, dz);
    if (dRun < 260) {
      const t = smooth(clamp((dRun - 130) / 130, 0, 1));
      h = lerp(runway.y, h, t);
    }
    return h;
  }

  // ---- heightfield mesh ----
  const N = 110;
  const m = emptyMesh();
  const grid = [];
  for (let j = 0; j <= N; j++) {
    const row = [];
    for (let i = 0; i <= N; i++) {
      const x = -HALF + (i / N) * SIZE;
      const z = -HALF + (j / N) * SIZE;
      row.push(heightAt(x, z));
    }
    grid.push(row);
  }
  const SAND = [0.76, 0.70, 0.50], GRASS = [0.32, 0.55, 0.25], FOREST = [0.16, 0.38, 0.16];
  const ROCK = [0.45, 0.42, 0.40], SNOW = [0.92, 0.93, 0.95], RIVER = [0.15, 0.42, 0.62];
  function colorAt(x, z, h) {
    const rx = riverX(z);
    if (Math.abs(x - rx) < 14 && h < 4) return RIVER;
    if (h < 2.2) return SAND; // beach
    if (h < 6) return GRASS;
    const f = fbm(x * 0.02 + 3, z * 0.02 + 9, seed + 31, 2);
    if (h < 26) return f > 0.45 ? FOREST : GRASS;
    if (h < 55) return ROCK;
    return h > 70 ? SNOW : ROCK;
  }
  const vid = [];
  for (let j = 0; j <= N; j++) {
    vid.push([]);
    for (let i = 0; i <= N; i++) {
      const x = -HALF + (i / N) * SIZE;
      const z = -HALF + (j / N) * SIZE;
      const h = grid[j][i];
      const hx = grid[j][Math.min(i + 1, N)] - grid[j][Math.max(i - 1, 0)];
      const hz = grid[Math.min(j + 1, N)][i] - grid[Math.max(j - 1, 0)][i];
      const step = SIZE / N;
      let n = [-hx / (2 * step), 1, -hz / (2 * step)];
      const nl = Math.hypot(n[0], n[1], n[2]); n = [n[0] / nl, n[1] / nl, n[2] / nl];
      m.pos.push(x, h, z); m.nor.push(n[0], n[1], n[2]);
      const c = colorAt(x, z, h); m.col.push(c[0], c[1], c[2]);
      vid[j].push(m.pos.length / 3 - 1);
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      m.idx.push(vid[j][i], vid[j + 1][i], vid[j + 1][i + 1]);
      m.idx.push(vid[j][i], vid[j + 1][i + 1], vid[j][i + 1]);
    }
  }
  const groundMesh = finalizeMesh(m);

  // ---- sea plane ----
  const sea = emptyMesh();
  const SC = [0.10, 0.38, 0.62];
  addFlatQuad(sea, -HALF, -HALF, HALF, HALF, seaLevel, SC);
  const seaMesh = finalizeMesh(sea);

  // ---- forest: merged low-poly trees (cone + cylinder) ----
  const rng = mulberry32(seed * 7919 + 13);
  const trees = emptyMesh();
  const TRUNK = [0.35, 0.24, 0.14], LEAF = [0.13, 0.36, 0.14], LEAF2 = [0.18, 0.45, 0.18];
  let placed = 0, tries = 0;
  while (placed < 420 && tries < 6000) {
    tries++;
    const x = (rng() * 2 - 1) * (HALF - 60);
    const z = (rng() * 2 - 1) * (HALF - 60);
    const h = heightAt(x, z);
    if (h < 7 || h > 30) continue;
    if (Math.abs(x - riverX(z)) < 26) continue;
    if (Math.hypot(x - runway.x, z - runway.z) < 200) continue;
    const s = 0.8 + rng() * 0.9;
    addCylinder(trees, x, h, h + 4.5 * s, z, 0.7 * s, 5, TRUNK);
    addCone(trees, x, h + 3.5 * s, z, 4.2 * s, 7 * s, 6, rng() > 0.5 ? LEAF : LEAF2);
    addCone(trees, x, h + 7.5 * s, z, 2.8 * s, 5.5 * s, 6, LEAF2);
    placed++;
  }
  const treeMesh = finalizeMesh(trees);

  // ---- runway: strip, centerline dashes, edge lights, windsock pole ----
  const run = emptyMesh();
  const ry = runway.y + 0.15;
  const hw = runway.width / 2, hl = runway.length / 2;
  const ASPH = [0.16, 0.16, 0.17], WHITE = [0.9, 0.9, 0.88], AMBER = [1.0, 0.75, 0.25];
  // Runway is aligned to world X (east-west); heading = 90 deg.
  addFlatQuad(run, runway.x - hl, runway.z - hw, runway.x + hl, runway.z + hw, ry, ASPH);
  for (let d = -hl + 20; d < hl - 10; d += 24) {
    addFlatQuad(run, runway.x + d, runway.z - 1.1, runway.x + d + 12, runway.z + 1.1, ry + 0.05, WHITE);
  }
  // Threshold bars at both ends.
  addFlatQuad(run, runway.x - hl + 4, runway.z - hw + 3, runway.x - hl + 10, runway.z + hw - 3, ry + 0.05, WHITE);
  addFlatQuad(run, runway.x + hl - 10, runway.z - hw + 3, runway.x + hl - 4, runway.z + hw - 3, ry + 0.05, WHITE);
  // Edge light posts (small amber boxes) along both sides.
  for (let d = -hl + 10; d <= hl - 10; d += 40) {
    addBox(run, runway.x + d, ry + 1.0, runway.z - hw - 2, 0.7, 1.0, 0.7, AMBER);
    addBox(run, runway.x + d, ry + 1.0, runway.z + hw + 2, 0.7, 1.0, 0.7, AMBER);
  }
  // Windsock pole beside the runway.
  addCylinder(run, runway.x - hl - 18, ry, ry + 9, runway.z - hw - 14, 0.5, 5, WHITE);
  const runwayMesh = finalizeMesh(run);

  return { heightAt, groundMesh, seaMesh, treeMesh, runwayMesh, seaLevel };
}
