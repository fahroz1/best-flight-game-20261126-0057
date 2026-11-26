// levels.js — the 3 levels: terrain seed, weather, lighting, ring course, runway, spawn.

export const LEVELS = [
  {
    id: 0, name: 'Pagi di Pesisir', desc: 'Siang cerah di atas pantai — ring di atas laut dan pesisir.',
    seed: 11, mountainAmp: 34, seaLevel: 0.4,
    sky: [0.55, 0.78, 0.95], fogColor: [0.62, 0.78, 0.92], fogDensity: 0.00045,
    sunDir: [0.45, 0.8, 0.35], sunColor: [1.0, 0.95, 0.85], ambient: [0.45, 0.5, 0.55],
    rain: 0, wind: 0, stars: 0, night: false,
    runway: { x: 120, z: 60, y: 8, length: 260, width: 26 },
    spawn: { x: -260, y: 55, z: 60, yaw: -Math.PI / 2, speed: 40, throttle: 0.7 },
    rings: [
      { x: -120, y: 48, z: 60 }, { x: 0, y: 55, z: -40 }, { x: 90, y: 42, z: -190 },
      { x: -60, y: 60, z: -330 }, { x: -320, y: 45, z: -260 }, { x: -480, y: 38, z: -60 },
      { x: -350, y: 50, z: 140 }, { x: -120, y: 46, z: 220 }, { x: 60, y: 40, z: 180 },
    ],
  },
  {
    id: 1, name: 'Badai Sore', desc: 'Hujan deras dan hembusan angin di cahaya senja.',
    seed: 23, mountainAmp: 55, seaLevel: 0.4,
    sky: [0.85, 0.55, 0.38], fogColor: [0.72, 0.52, 0.40], fogDensity: 0.0011,
    sunDir: [-0.6, 0.35, 0.2], sunColor: [1.0, 0.6, 0.35], ambient: [0.38, 0.34, 0.36],
    rain: 1, wind: 0.12, stars: 0, night: false,
    runway: { x: 120, z: 60, y: 8, length: 260, width: 26 },
    spawn: { x: -260, y: 55, z: 60, yaw: -Math.PI / 2, speed: 40, throttle: 0.7 },
    rings: [
      { x: -120, y: 50, z: 60 }, { x: 20, y: 62, z: -60 }, { x: 140, y: 48, z: -220 },
      { x: -40, y: 70, z: -380 }, { x: -300, y: 55, z: -300 }, { x: -520, y: 42, z: -120 },
      { x: -420, y: 58, z: 120 }, { x: -160, y: 50, z: 240 }, { x: 60, y: 42, z: 180 },
    ],
  },
  {
    id: 2, name: 'Malam di Pegunungan', desc: 'Malam berbintang di antara gunung — lampu runway memandu pulang.',
    seed: 37, mountainAmp: 105, seaLevel: 0.4,
    sky: [0.03, 0.05, 0.12], fogColor: [0.05, 0.07, 0.15], fogDensity: 0.0009,
    sunDir: [0.3, 0.6, -0.4], sunColor: [0.55, 0.65, 0.95], ambient: [0.16, 0.18, 0.26],
    rain: 0, wind: 0.04, stars: 1, night: true,
    runway: { x: 120, z: 60, y: 8, length: 260, width: 26 },
    spawn: { x: -260, y: 70, z: 60, yaw: -Math.PI / 2, speed: 40, throttle: 0.7 },
    rings: [
      { x: -140, y: 78, z: 40 }, { x: -20, y: 92, z: -80 }, { x: 120, y: 85, z: -260 },
      { x: -60, y: 105, z: -420 }, { x: -320, y: 95, z: -320 }, { x: -540, y: 80, z: -140 },
      { x: -460, y: 88, z: 120 }, { x: -200, y: 82, z: 260 }, { x: 60, y: 60, z: 180 },
    ],
  },
];

// Clone a level so per-run state (ring.passed) never leaks between flights.
export function freshLevel(id) {
  const src = LEVELS[id] || LEVELS[0];
  const lvl = JSON.parse(JSON.stringify(src));
  lvl.rings = lvl.rings.map((r) => ({ ...r, passed: false, yaw: 0 }));
  return lvl;
}
