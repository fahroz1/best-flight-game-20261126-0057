// hud.js — HUD + instrumen: dial altitude, dial speed, kompas heading,
// fuel gauge, damage bar, skor, sisa ring, lampu peringatan.
(function (global) {
  'use strict';

  var W = 1280, H = 720;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,18,30,0.72)';
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function label(ctx, text, x, y, size, color, align) {
    ctx.save();
    ctx.font = 'bold ' + size + 'px Arial, sans-serif';
    ctx.fillStyle = color || '#eaf3fa';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Dial bundar dengan jarum + angka + zona merah.
  function drawDial(ctx, cx, cy, r, value, max, title, unit, dangerFrom) {
    ctx.save();
    // Cakram
    ctx.fillStyle = 'rgba(8,18,30,0.8)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Zona merah
    if (dangerFrom !== undefined) {
      var a0 = -Math.PI * 0.75 + (dangerFrom / max) * Math.PI * 1.5;
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, a0, Math.PI * 0.75);
      ctx.stroke();
    }
    // Tick
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    for (var i = 0; i <= 10; i++) {
      var a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      var x1 = cx + Math.cos(a) * (r - 8), y1 = cy + Math.sin(a) * (r - 8);
      var x2 = cx + Math.cos(a) * (r - 16), y2 = cy + Math.sin(a) * (r - 16);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // Jarum menyala
    var ang = -Math.PI * 0.75 + (Math.max(0, Math.min(max, value)) / max) * Math.PI * 1.5;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (r - 20), cy + Math.sin(ang) * (r - 20));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    // Nilai digital
    label(ctx, String(Math.round(value)), cx, cy + r * 0.45, 20, '#ffffff', 'center');
    label(ctx, title, cx, cy - r - 12, 13, '#bcd6ea', 'center');
    label(ctx, unit, cx, cy + r * 0.45 + 18, 11, '#9fb8cc', 'center');
    ctx.restore();
  }

  // Kompas heading: strip arah mata angin yang bergeser mengikuti heading.
  function drawCompass(ctx, headingDeg, cx, y, w) {
    ctx.save();
    panel(ctx, cx - w / 2, y - 22, w, 44);
    ctx.beginPath();
    ctx.rect(cx - w / 2, y - 22, w, 44);
    ctx.clip();
    var dirs = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
    for (var d = -360; d <= 720; d += 45) {
      var rel = ((d - headingDeg + 540) % 360) - 180;
      var px = cx + rel * (w / 360);
      if (px < cx - w / 2 - 20 || px > cx + w / 2 + 20) continue;
      var isCard = (d % 90 === 0);
      label(ctx, dirs[((d / 45) % 8 + 8) % 8], px, y, isCard ? 16 : 12,
        isCard ? '#ffd23f' : '#cfe3f2', 'center');
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.moveTo(px, y + 14); ctx.lineTo(px, y + 18); ctx.stroke();
    }
    ctx.restore();
    // Penanda tengah
    ctx.save();
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.moveTo(cx - 7, y - 22); ctx.lineTo(cx + 7, y - 22); ctx.lineTo(cx, y - 12);
    ctx.closePath(); ctx.fill();
    label(ctx, 'HEADING ' + Math.round(headingDeg) + '°', cx, y + 34, 12, '#bcd6ea', 'center');
    ctx.restore();
  }

  // Bar horizontal dengan isi menyala (bahan bakar / damage).
  function drawBar(ctx, x, y, w, h, frac, color, glowColor, title, text) {
    ctx.save();
    label(ctx, title, x, y - 12, 12, '#bcd6ea', 'left');
    ctx.fillStyle = 'rgba(8,18,30,0.8)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    var fw = Math.max(0, Math.min(1, frac)) * (w - 4);
    if (fw > 2) {
      ctx.fillStyle = color;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
      roundRect(ctx, x + 2, y + 2, fw, h - 4, (h - 4) / 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    label(ctx, text, x + w + 10, y + h / 2, 13, '#ffffff', 'left');
    ctx.restore();
  }

  // HUD utama selama bermain.
  function drawHUD(ctx, flight, mission, levelDef, planeDef, score, ringsLeft, timeSec) {
    // Bar atas: skor + ring + level.
    panel(ctx, 16, 12, 420, 56);
    label(ctx, 'SKOR', 32, 30, 13, '#9fb8cc', 'left');
    label(ctx, String(score), 32, 52, 22, '#ffffff', 'left');
    label(ctx, 'RING', 170, 30, 13, '#9fb8cc', 'left');
    label(ctx, ringsLeft + ' tersisa', 170, 52, 18, '#ffd23f', 'left');
    label(ctx, levelDef.name.toUpperCase(), 420, 40, 13, '#bcd6ea', 'right');

    // Instrumen kiri bawah.
    var headingDeg = ((flight.angle * 180 / Math.PI) + 90 + 360) % 360;
    drawDial(ctx, 92, H - 92, 62, flight.y, 400, 'ALTITUDE', 'meter');
    drawDial(ctx, 240, H - 92, 62, flight.speed * 3.6, 400, 'SPEED', 'km/jam');
    drawCompass(ctx, headingDeg, W / 2, H - 44, 260);

    // Fuel + damage kanan bawah.
    var fuelColor = flight.fuel > 25 ? '#35d461' : '#ff4d4d';
    drawBar(ctx, W - 300, H - 108, 220, 16, flight.fuel / 100, fuelColor, fuelColor,
      'BAHAN BAKAR', Math.round(flight.fuel) + '%');
    var dmgColor = flight.damage > 60 ? '#ff4d4d' : (flight.damage > 25 ? '#ffb02e' : '#35d461');
    drawBar(ctx, W - 300, H - 66, 220, 16, flight.damage / 100, dmgColor, dmgColor,
      'DAMAGE', Math.round(flight.damage) + '%');

    // Peringatan.
    if (flight.fuel <= 25) {
      var blink = Math.floor(timeSec * 3) % 2 === 0;
      if (blink) label(ctx, 'BAHAN BAKAR RENDAH!', W / 2, 92, 20, '#ff6b6b', 'center');
    }
    if (flight.stalled) {
      label(ctx, 'STALL! Tambah throttle!', W / 2, 122, 18, '#ffb02e', 'center');
    }

    // Kontrol singkat.
    label(ctx, 'Panah/WASD terbang  •  P jeda  •  R ulang  •  M suara', W / 2, 24, 12,
      'rgba(255,255,255,0.75)', 'center');
  }

  // Cincin bercahaya di dunia.
  function drawRing(ctx, sx, sy, r, passed, timeSec) {
    ctx.save();
    if (passed) {
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#9be15d';
    } else {
      var pulse = 0.75 + 0.25 * Math.sin(timeSec * 4);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffd23f';
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = 18;
    }
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = passed ? 'rgba(155,225,93,0.6)' : 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(sx, sy, r - 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  global.HUD = {
    drawHUD: drawHUD,
    drawRing: drawRing,
    panel: panel,
    label: label,
    roundRect: roundRect,
    drawDial: drawDial
  };
})(typeof window !== 'undefined' ? window : globalThis);
