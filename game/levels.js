// levels.js — Definisi 3 level + misi (urutan ring, runway, cuaca).
(function (global) {
  'use strict';

  var LEVELS = [
    {
      id: 'pagi',
      name: 'Pagi di Pesisir',
      tagline: 'Siang tenang — ring longgar.',
      difficulty: 1,
      length: 5200,          // meter sampai runway
      runwayX: 5200,
      baseHeight: 18,
      terrainAmp: 0.7,
      wind: 2,
      gustStrength: 0.6,
      rain: 0,
      night: false,
      ringGap: 520,
      ringRadius: 34,
      ringBaseY: 150,
      ringCount: 9,
      timeBonus: 1500,
      seed: 11
    },
    {
      id: 'sore',
      name: 'Badai Sore',
      tagline: 'Hujan + angin — ring rapat.',
      difficulty: 2,
      length: 6200,
      runwayX: 6200,
      baseHeight: 26,
      terrainAmp: 1.1,
      wind: -7,
      gustStrength: 3.2,
      rain: 1,
      night: false,
      ringGap: 430,
      ringRadius: 28,
      ringBaseY: 165,
      ringCount: 12,
      timeBonus: 2200,
      seed: 23
    },
    {
      id: 'malam',
      name: 'Malam di Pegunungan',
      tagline: 'Gelap, pegunungan — sulit.',
      difficulty: 3,
      length: 7200,
      runwayX: 7200,
      baseHeight: 42,
      terrainAmp: 1.6,
      wind: 4,
      gustStrength: 1.4,
      rain: 0,
      night: true,
      ringGap: 460,
      ringRadius: 26,
      ringBaseY: 190,
      ringCount: 13,
      timeBonus: 3000,
      seed: 37
    }
  ];

  function getLevel(id) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].id === id) return LEVELS[i];
    }
    return LEVELS[0];
  }

  // Bangun misi: deretan ring dengan posisi Y bergelombang (deterministik).
  // Ring selalu di atas terrain setempat (+45 m) supaya selalu bisa dilewati.
  function buildMission(levelDef, seed) {
    var rng = global.Terrain.mulberry32(seed * 101 + 7);
    var terrain = global.Terrain.makeTerrain(levelDef, levelDef.seed);
    var rings = [];
    for (var i = 0; i < levelDef.ringCount; i++) {
      var x = 500 + i * levelDef.ringGap + rng() * 120;
      var y = levelDef.ringBaseY + (rng() - 0.5) * 130;
      y = Math.max(70, Math.min(300, y));
      y = Math.max(y, terrain.heightAt(x) + 45);
      y = Math.min(y, 340);
      rings.push({ x: x, y: y, r: levelDef.ringRadius, passed: false });
    }
    return {
      rings: rings,
      runwayX: levelDef.runwayX,
      totalRings: rings.length
    };
  }

  // Angin sesaat (gust): sinus lambat + acak halus dari waktu.
  function gustAt(levelDef, timeSec) {
    return Math.sin(timeSec * 0.9) * levelDef.gustStrength
      + Math.sin(timeSec * 2.7 + 1.7) * levelDef.gustStrength * 0.4;
  }

  global.Levels = {
    LEVELS: LEVELS,
    getLevel: getLevel,
    buildMission: buildMission,
    gustAt: gustAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
