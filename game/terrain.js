// terrain.js — Terrain prosedural + rendering parallax (laut, pantai, sawah,
// hutan, sungai, gunung, desa) dengan RNG ber-seed supaya deterministik.
(function (global) {
  'use strict';

  // RNG deterministik (mulberry32) — adegan screenshot selalu sama per seed.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Profil biome sepanjang level: [mulaiX, akhirX, jenis].
  // Jenis: 'laut' | 'pantai' | 'sawah' | 'hutan' | 'sungai' | 'gunung' | 'desa'
  function buildBiomes(levelDef, rng) {
    var kinds = ['laut', 'pantai', 'sawah', 'hutan', 'sungai', 'gunung', 'desa'];
    var out = [];
    var x = 0;
    var end = levelDef.length;
    var idx = Math.floor(rng() * 2); // mulai dari laut atau pantai
    while (x < end) {
      var span = 700 + rng() * 900;
      var kind = kinds[idx % kinds.length];
      // Pegunungan mendominasi level malam; sawah mendominasi level pagi.
      if (levelDef.id === 'malam' && rng() < 0.45) kind = 'gunung';
      if (levelDef.id === 'pagi' && rng() < 0.3) kind = 'sawah';
      out.push({ from: x, to: Math.min(end, x + span), kind: kind });
      x += span;
      idx += 1 + Math.floor(rng() * 2);
    }
    // Runway selalu di ujung: 260 meter tanah datar desa.
    out.push({ from: end, to: end + 320, kind: 'desa' });
    return out;
  }

  // Terrain: tinggi tanah (meter) sebagai jumlah gelombang sinus ber-fase acak.
  function makeTerrain(levelDef, seed) {
    var rng = mulberry32(seed);
    var waves = [];
    var n = 5;
    for (var i = 0; i < n; i++) {
      waves.push({
        amp: (6 + rng() * 26) * levelDef.terrainAmp,
        freq: 0.0006 + rng() * 0.0016,
        phase: rng() * Math.PI * 2
      });
    }
    var base = levelDef.baseHeight;
    var biomes = buildBiomes(levelDef, rng);
    var rivers = [];
    for (var j = 0; j < biomes.length; j++) {
      if (biomes[j].kind === 'sungai') {
        rivers.push({ x: (biomes[j].from + biomes[j].to) / 2, w: 60 + rng() * 60 });
      }
    }

    function biomeAt(x) {
      // Zona pendekatan + runway selalu tanah desa yang rata dan jelas.
      if (x > levelDef.runwayX - 900) return 'desa';
      for (var i = 0; i < biomes.length; i++) {
        if (x >= biomes[i].from && x < biomes[i].to) return biomes[i].kind;
      }
      return 'desa';
    }

    function rawHeight(x) {
      var h = base;
      for (var i = 0; i < waves.length; i++) {
        h += waves[i].amp * Math.sin(x * waves[i].freq + waves[i].phase);
      }
      var b = biomeAt(x);
      if (b === 'laut') h = Math.min(h, 2);
      if (b === 'pantai') h = Math.min(h, 6);
      if (b === 'gunung') h = Math.max(h, base + 55 + 40 * Math.abs(Math.sin(x * 0.0021)));
      if (b === 'sawah') h = h * 0.45;
      return Math.max(0, h);
    }

    // Landasan: diratakan total 900 m sebelum runway sampai 320 m sesudahnya,
    // dengan transisi halus 800 m sebelumnya — jadi pendekatan untuk
    // mendarat benar-benar landai, bukan tebing.
    function heightAt(x) {
      var rw = levelDef.runwayX;
      if (x >= rw - 900) {
        if (x <= rw + 320) return 14;
        var t2 = (x - (rw + 320)) / 400;
        var s2 = Math.min(1, Math.max(0, t2));
        s2 = s2 * s2 * (3 - 2 * s2);
        return 14 + (rawHeight(x) - 14) * s2;
      }
      if (x > rw - 1700) {
        var t = (x - (rw - 1700)) / 800;
        var s = t * t * (3 - 2 * t); // smoothstep
        return rawHeight(x) + (14 - rawHeight(x)) * s;
      }
      return rawHeight(x);
    }

    return {
      heightAt: heightAt,
      biomeAt: biomeAt,
      biomes: biomes,
      rivers: rivers,
      seed: seed
    };
  }

  // ---- Rendering ----

  var SKY = {
    pagi:   { top: '#7ec3ee', mid: '#bfe3f7', low: '#ffe9b8', sun: '#fff3c4', sunX: 0.78, sunY: 0.18 },
    sore:   { top: '#5d6f9e', mid: '#c98d5f', low: '#f2b879', sun: '#ffd9a0', sunX: 0.2,  sunY: 0.3 },
    malam:  { top: '#060a18', mid: '#101a33', low: '#233457', sun: '#f4ead2', sunX: 0.82, sunY: 0.16 }
  };

  var GROUND_COLORS = {
    laut:   ['#1d6f9e', '#155a82'],
    pantai: ['#e8d29a', '#d9c184'],
    sawah:  ['#79b657', '#5f9e44'],
    hutan:  ['#3f7d3a', '#2f6330'],
    sungai: ['#4d8f6a', '#3d7a58'],
    gunung: ['#6b6f78', '#54575f'],
    desa:   ['#8aa864', '#74945a']
  };

  // Gambar langit + matahari/bulan + bintang + awan + pegunungan jauh.
  function drawSky(ctx, W, H, levelDef, camX, timeSec) {
    var sky = SKY[levelDef.id] || SKY.pagi;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.low);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Matahari / bulan.
    var sx = W * sky.sunX, sy = H * sky.sunY;
    ctx.save();
    ctx.globalAlpha = 0.9;
    var glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    glow.addColorStop(0, sky.sun);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.fillStyle = sky.sun;
    ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Bintang di level malam.
    if (levelDef.id === 'malam') {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      for (var i = 0; i < 90; i++) {
        var bx = ((i * 173.3) % W);
        var by = ((i * 97.7) % (H * 0.45));
        var tw = 0.4 + 0.6 * Math.abs(Math.sin(timeSec * 0.7 + i));
        ctx.globalAlpha = tw;
        ctx.fillRect(bx, by, 2, 2);
      }
      ctx.restore();
    }

    // Awan (parallax lambat).
    drawClouds(ctx, W, H, camX, levelDef, timeSec);

    // Pegunungan jauh (parallax 0.25x).
    ctx.save();
    ctx.fillStyle = levelDef.id === 'malam' ? '#0d1526' : '#7d9bbd';
    ctx.globalAlpha = levelDef.id === 'malam' ? 0.9 : 0.55;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.62);
    for (var x = 0; x <= W; x += 16) {
      var wx = x + camX * 0.25;
      var y = H * 0.62 - 70 * Math.abs(Math.sin(wx * 0.004)) - 40 * Math.abs(Math.sin(wx * 0.011 + 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H * 0.62); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawClouds(ctx, W, H, camX, levelDef, timeSec) {
    var tint = levelDef.id === 'malam' ? 'rgba(200,210,235,0.16)'
      : levelDef.id === 'sore' ? 'rgba(80,70,80,0.55)' : 'rgba(255,255,255,0.85)';
    ctx.save();
    ctx.fillStyle = tint;
    for (var i = 0; i < 7; i++) {
      var cx = (((i * 397 + 120) - camX * 0.12 - timeSec * 6) % (W + 320) + W + 320) % (W + 320) - 160;
      var cy = 40 + (i * 53) % 150;
      var s = 0.7 + (i % 3) * 0.35;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 70 * s, 18 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 40 * s, cy + 6, 44 * s, 14 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 42 * s, cy + 5, 46 * s, 15 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Gambar tanah: isi di bawah garis terrain, diwarnai per biome, plus
  // pohon, rumah desa, sungai, dan runway di ujung level.
  function drawGround(ctx, W, H, levelDef, terrain, camX, camY, toScreenY) {
    var step = 8;
    var x0 = camX - 40, x1 = camX + W / 1.2 + 40;
    // Lapisan bukit tengah (parallax 0.5x) — siluet hijau.
    ctx.save();
    ctx.fillStyle = levelDef.id === 'malam' ? '#0a1a12' : 'rgba(46,110,60,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var px = 0; px <= W; px += 16) {
      var wx = px / 1.2 + camX * 0.5;
      var hy = toScreenY(30 + 26 * Math.abs(Math.sin(wx * 0.0016 + 1.3)));
      ctx.lineTo(px, hy);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Tanah utama, digambar per segmen biome.
    var cur = null, startPx = 0;
    function flush(endPx) {
      if (cur === null) return;
      var colors = GROUND_COLORS[cur];
      ctx.fillStyle = colors[0];
      ctx.beginPath();
      ctx.moveTo(startPx, H);
      for (var qx = startPx; qx <= endPx; qx += step) {
        var wx = camX + qx / 1.2;
        ctx.lineTo(qx, toScreenY(terrain.heightAt(wx)));
      }
      ctx.lineTo(endPx, H); ctx.closePath(); ctx.fill();
      // Garis tepi atas tanah.
      ctx.strokeStyle = colors[1];
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (var rx = startPx; rx <= endPx; rx += step) {
        var w2 = camX + rx / 1.2;
        var yy = toScreenY(terrain.heightAt(w2));
        if (rx === startPx) ctx.moveTo(rx, yy); else ctx.lineTo(rx, yy);
      }
      ctx.stroke();
    }
    for (var sx = 0; sx <= W; sx += step) {
      var wx = camX + sx / 1.2;
      var b = terrain.biomeAt(wx);
      if (cur === null) { cur = b; startPx = sx; }
      else if (b !== cur) { flush(sx); cur = b; startPx = sx; }
    }
    flush(W);

    // Laut: permukaan air berkilau di atas terrain rendah.
    drawSea(ctx, W, H, terrain, camX, toScreenY, levelDef, x0, x1);
    // Sungai: pita biru di atas tanah.
    drawRivers(ctx, terrain, camX, toScreenY, levelDef);
    // Pepohonan, rumah, dan lampu desa.
    drawDetails(ctx, W, terrain, camX, toScreenY, levelDef);
    // Runway.
    drawRunway(ctx, levelDef, terrain, camX, toScreenY);
  }

  function drawSea(ctx, W, H, terrain, camX, toScreenY, levelDef, x0, x1) {
    ctx.save();
    for (var sx = 0; sx < W; sx += 8) {
      var wx = camX + sx / 1.2;
      if (terrain.biomeAt(wx) !== 'laut') continue;
      var gy = toScreenY(terrain.heightAt(wx));
      var grad = ctx.createLinearGradient(0, gy - 6, 0, gy + 26);
      grad.addColorStop(0, levelDef.id === 'malam' ? '#123a5c' : '#2f8fc0');
      grad.addColorStop(1, levelDef.id === 'malam' ? '#0a2438' : '#1d6f9e');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, gy - 6, 9, H - gy + 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(sx, gy - 4, 5, 1);
    }
    ctx.restore();
  }

  function drawRivers(ctx, terrain, camX, toScreenY, levelDef) {
    ctx.save();
    ctx.fillStyle = levelDef.id === 'malam' ? '#1c4d6e' : '#3f9fd0';
    for (var i = 0; i < terrain.rivers.length; i++) {
      var r = terrain.rivers[i];
      var sx = (r.x - camX) * 1.2;
      if (sx < -120 || sx > 1400) continue;
      var gy = toScreenY(terrain.heightAt(r.x));
      ctx.beginPath();
      ctx.ellipse(sx, gy - 2, r.w * 1.2 * 0.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDetails(ctx, W, terrain, camX, toScreenY, levelDef) {
    var night = levelDef.id === 'malam';
    // Pohon di hutan/sawah, rumah di desa — posisi dari hash deterministik.
    for (var i = 0; i < 260; i++) {
      var wx = Math.floor(i * 97.13) + camX - (camX % 97.13);
      // pakai grid dunia yang stabil: tiap 97 m satu calon objek
      wx = Math.floor((camX - 100) / 97.13) * 97.13 + i * 97.13;
      var sx = (wx - camX) * 1.2;
      if (sx < -40 || sx > W + 40) continue;
      var b = terrain.biomeAt(wx);
      var gy = toScreenY(terrain.heightAt(wx));
      var h = (wx * 7919) % 100 / 100; // variasi pseudo-acak stabil
      if (b === 'hutan' || (b === 'sawah' && h > 0.6)) {
        drawTree(ctx, sx, gy, 0.8 + h * 0.7, night);
      } else if (b === 'desa' && h > 0.45) {
        drawHouse(ctx, sx, gy, night, h);
      } else if (b === 'sawah' && h <= 0.6) {
        // petak sawah: garis-garis hijau muda
        ctx.strokeStyle = night ? 'rgba(120,160,90,0.5)' : 'rgba(30,90,30,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 26, gy - 2); ctx.lineTo(sx + 26, gy - 2);
        ctx.moveTo(sx - 20, gy - 7); ctx.lineTo(sx + 20, gy - 7);
        ctx.stroke();
      }
    }
  }

  function drawTree(ctx, x, groundY, s, night) {
    ctx.save();
    ctx.fillStyle = night ? '#122b18' : '#7a5230';
    ctx.fillRect(x - 2 * s, groundY - 14 * s, 4 * s, 14 * s);
    ctx.fillStyle = night ? '#0f2a16' : '#2e7d32';
    ctx.beginPath();
    ctx.arc(x, groundY - 22 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(x - 9 * s, groundY - 12 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(x + 9 * s, groundY - 12 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHouse(ctx, x, groundY, night, h) {
    ctx.save();
    var w = 26, hh = 18;
    ctx.fillStyle = night ? '#3a2f28' : '#f2e3c2';
    ctx.fillRect(x - w / 2, groundY - hh, w, hh);
    ctx.fillStyle = night ? '#1c1410' : '#b5502e';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 3, groundY - hh);
    ctx.lineTo(x, groundY - hh - 12);
    ctx.lineTo(x + w / 2 + 3, groundY - hh);
    ctx.closePath(); ctx.fill();
    if (night) {
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(x - 6, groundY - 12, 5, 6);
      ctx.fillRect(x + 3, groundY - 12, 5, 6);
    } else {
      ctx.fillStyle = '#33506e';
      ctx.fillRect(x - 6, groundY - 12, 5, 6);
      ctx.fillRect(x + 3, groundY - 12, 5, 6);
    }
    ctx.restore();
  }

  function drawRunway(ctx, levelDef, terrain, camX, toScreenY) {
    var rw = levelDef.runwayX;
    var sx = (rw - camX) * 1.2;
    if (sx < -500 || sx > 1800) return;
    var gy = toScreenY(terrain.heightAt(rw));
    var len = 320 * 1.2;
    ctx.save();
    // Apron tanah
    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(sx - len / 2, gy - 10, len, 12);
    // Garis tengah putih putus-putus
    ctx.fillStyle = '#f5f5f5';
    for (var i = 0; i < 8; i++) {
      ctx.fillRect(sx - len / 2 + 14 + i * (len / 8), gy - 5, 18, 3);
    }
    // Nomor runway
    ctx.fillStyle = '#f5f5f5';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('09', sx, gy - 18);
    // Lampu landing: pijar kuning di tepi runway (penting di level malam)
    var lampColor = levelDef.id === 'malam' ? '#ffcf4d' : '#ffe9a8';
    for (var j = 0; j <= 8; j++) {
      var lx = sx - len / 2 + j * (len / 8);
      ctx.save();
      ctx.globalAlpha = 0.95;
      var glow = ctx.createRadialGradient(lx, gy - 12, 1, lx, gy - 12, 14);
      glow.addColorStop(0, lampColor);
      glow.addColorStop(1, 'rgba(255,207,77,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 14, gy - 26, 28, 28);
      ctx.fillStyle = lampColor;
      ctx.beginPath(); ctx.arc(lx, gy - 12, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Papan penanda
    ctx.fillStyle = '#20242a';
    ctx.fillRect(sx + len / 2 + 12, gy - 44, 4, 44);
    ctx.fillStyle = '#ffcf4d';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LANDASAN', sx + len / 2 + 20, gy - 30);
    ctx.restore();
  }

  // Hujan untuk level sore: garis miring yang bergerak.
  function drawRain(ctx, W, H, timeSec, intensity) {
    ctx.save();
    ctx.strokeStyle = 'rgba(190,210,235,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < 130 * intensity; i++) {
      var rx = ((i * 211.7 + timeSec * 420) % (W + 60)) - 30;
      var ry = ((i * 137.3 + timeSec * 900) % (H + 40)) - 20;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 6, ry + 16);
    }
    ctx.stroke();
    ctx.restore();
  }

  global.Terrain = {
    mulberry32: mulberry32,
    makeTerrain: makeTerrain,
    drawSky: drawSky,
    drawGround: drawGround,
    drawRain: drawRain
  };
})(typeof window !== 'undefined' ? window : globalThis);
