// plane.js — Definisi 3 pesawat + cara menggambarnya di canvas.
// Pesawat digambar dari bentuk (badan, sayap, ekor, kokpit) — tanpa gambar luar.
(function (global) {
  'use strict';

  var PLANES = {
    elang: {
      id: 'elang',
      name: 'Elang',
      tagline: 'Seimbang — pesawat latih',
      maxSpeed: 78,
      cruiseSpeed: 52,
      stallSpeed: 26,
      maxThrust: 14,
      dragCoeff: 0.0021,
      turnRate: 1.5,
      stability: 0.55,
      fuelBurn: 0.55,
      liftBonus: 1.0,
      bodyColor: '#c0392b',
      wingColor: '#e74c3c',
      accent: '#f9d423'
    },
    garuda: {
      id: 'garuda',
      name: 'Garuda',
      tagline: 'Cepat, boros bahan bakar',
      maxSpeed: 108,
      cruiseSpeed: 72,
      stallSpeed: 34,
      maxThrust: 22,
      dragCoeff: 0.0019,
      turnRate: 1.9,
      stability: 0.35,
      fuelBurn: 1.05,
      liftBonus: 1.0,
      bodyColor: '#8e44ad',
      wingColor: '#b06fd6',
      accent: '#ffd700'
    },
    merpati: {
      id: 'merpati',
      name: 'Merpati Pos',
      tagline: 'Lambat, stabil, hemat BBM',
      maxSpeed: 62,
      cruiseSpeed: 44,
      stallSpeed: 20,
      maxThrust: 10,
      dragCoeff: 0.0024,
      turnRate: 1.1,
      stability: 0.9,
      fuelBurn: 0.32,
      liftBonus: 1.15,
      bodyColor: '#2e86c1',
      wingColor: '#5dade2',
      accent: '#ffffff'
    }
  };

  var PLANE_ORDER = ['elang', 'garuda', 'merpati'];

  // Gambar pesawat side-view menghadap kanan, diputar mengikuti pitch.
  // x, y: posisi layar (px). angle: radian, positif = hidung ke atas.
  function drawPlane(ctx, x, y, angle, planeDef, throttle, timeSec) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-angle); // layar Y ke bawah, dunia Y ke atas
    var s = 1.0;
    var wobble = Math.sin(timeSec * 9) * 0.6 * throttle;

    // Jejak api knalpot saat throttle tinggi.
    if (throttle > 0.25) {
      var flame = 10 + throttle * 22 + Math.random() * 4;
      var fg = ctx.createLinearGradient(-26, 0, -26 - flame, 0);
      fg.addColorStop(0, 'rgba(255,200,60,0.95)');
      fg.addColorStop(0.6, 'rgba(255,120,30,0.7)');
      fg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-24, -3);
      ctx.lineTo(-26 - flame, 0);
      ctx.lineTo(-24, 3);
      ctx.closePath(); ctx.fill();
    }

    // Sayap belakang (ekor horizontal).
    ctx.fillStyle = planeDef.wingColor;
    ctx.beginPath();
    ctx.moveTo(-20, -2); ctx.lineTo(-34, -12); ctx.lineTo(-28, -2);
    ctx.closePath(); ctx.fill();
    // Sirip tegak ekor.
    ctx.beginPath();
    ctx.moveTo(-22, -4); ctx.lineTo(-30, -20); ctx.lineTo(-22, -5);
    ctx.closePath(); ctx.fill();

    // Badan utama.
    ctx.fillStyle = planeDef.bodyColor;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.quadraticCurveTo(18, -9, -6, -8);
    ctx.quadraticCurveTo(-26, -7, -28, -1);
    ctx.quadraticCurveTo(-26, 6, -8, 7);
    ctx.quadraticCurveTo(16, 8, 34, 0);
    ctx.closePath(); ctx.fill();

    // Garis aksen di badan.
    ctx.strokeStyle = planeDef.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-24, 1); ctx.quadraticCurveTo(0, 3, 30, 0);
    ctx.stroke();

    // Sayap utama.
    ctx.fillStyle = planeDef.wingColor;
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.lineTo(-4, -26 + wobble);
    ctx.lineTo(-12, -26 + wobble);
    ctx.lineTo(-8, -3);
    ctx.closePath(); ctx.fill();

    // Kokpit.
    ctx.fillStyle = '#bfe8ff';
    ctx.beginPath();
    ctx.ellipse(14, -6, 9, 5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1c2f42';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Baling-baling di hidung.
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 3;
    var spin = timeSec * (6 + throttle * 34);
    ctx.beginPath();
    ctx.moveTo(34 + Math.cos(spin) * 14, Math.sin(spin) * 14);
    ctx.lineTo(34 - Math.cos(spin) * 14, -Math.sin(spin) * 14);
    ctx.stroke();
    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath(); ctx.arc(34, 0, 3, 0, Math.PI * 2); ctx.fill();

    // Lampu navigasi (berkedip).
    var blink = (Math.floor(timeSec * 2) % 2 === 0);
    if (blink) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(-28, -2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#35e065';
      ctx.beginPath(); ctx.arc(30, 2, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Gambar kecil pesawat untuk kartu pemilihan (tanpa rotasi, menghadap kanan).
  function drawPlaneCard(ctx, x, y, planeDef, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = planeDef.bodyColor;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.quadraticCurveTo(18, -9, -6, -8);
    ctx.quadraticCurveTo(-26, -7, -28, -1);
    ctx.quadraticCurveTo(-26, 6, -8, 7);
    ctx.quadraticCurveTo(16, 8, 34, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = planeDef.wingColor;
    ctx.beginPath();
    ctx.moveTo(6, -4); ctx.lineTo(-4, -24); ctx.lineTo(-12, -24); ctx.lineTo(-8, -3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bfe8ff';
    ctx.beginPath(); ctx.ellipse(14, -6, 9, 5, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  global.Planes = {
    PLANES: PLANES,
    PLANE_ORDER: PLANE_ORDER,
    drawPlane: drawPlane,
    drawPlaneCard: drawPlaneCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
