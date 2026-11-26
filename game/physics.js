// physics.js — Model terbang arcade: lift, drag, throttle, gravitasi, angin.
// Semua satuan dunia: meter, detik, radian. Sumbu Y dunia mengarah ke atas.
(function (global) {
  'use strict';

  var GRAVITY = 9.8;          // m/s^2, tarikan ke bawah
  var AIR_DENSITY = 1.0;      // faktor kerapatan udara (dipakai lift/drag)

  // Buat keadaan terbang awal dari definisi pesawat dan level.
  function createFlight(planeDef, levelDef) {
    return {
      x: 60,                 // posisi dunia (meter)
      y: 150,                // ketinggian (meter)
      speed: planeDef.cruiseSpeed,
      angle: 0,              // pitch, radian; positif = menanjak
      throttle: 0.55,        // 0..1
      fuel: 100,             // persen
      damage: 0,             // persen; 100 = hancur
      verticalSpeed: 0,      // m/s, untuk menilai kelembutan mendarat
      distance: 0,           // meter yang sudah ditempuh
      time: 0,               // detik sejak lepas landas
      stalled: false
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Satu langkah simulasi. input: {pitchUp, pitchDown, throttleUp, throttleDown, wind}
  // terrainHeightAt: fungsi (x) -> tinggi terrain dalam meter.
  // Mengembalikan event: {hitGround, landed, stalled} (boolean).
  function stepFlight(state, planeDef, input, dt, terrainHeightAt) {
    var ev = { hitGround: false, landed: false, stalled: false };

    // --- Throttle: naik/turun halus ---
    if (input.throttleUp) state.throttle = clamp(state.throttle + dt * 0.7, 0, 1);
    if (input.throttleDown) state.throttle = clamp(state.throttle - dt * 0.9, 0, 1);

    // --- Pitch: laju belok khas tiap pesawat ---
    var turn = planeDef.turnRate;
    if (input.pitchUp) state.angle = clamp(state.angle + turn * dt, -1.1, 1.1);
    if (input.pitchDown) state.angle = clamp(state.angle - turn * dt, -1.1, 1.1);

    // Kestabilan: pesawat cenderung kembali ke posisi mendatar perlahan.
    state.angle += (0 - state.angle) * planeDef.stability * dt;

    // --- Dorong mesin vs drag ---
    var thrust = planeDef.maxThrust * state.throttle;
    var drag = planeDef.dragCoeff * AIR_DENSITY * state.speed * state.speed;
    var accel = thrust - drag;
    state.speed = clamp(state.speed + accel * dt, 0, planeDef.maxSpeed * 1.15);

    // --- Lift: butuh kecepatan; di bawah stall speed pesawat jatuh ---
    // Di kecepatan jelajah, lift = gravitasi (terbang datar saat sudut 0).
    var stallSpeed = planeDef.stallSpeed;
    var liftFactor = clamp(state.speed / stallSpeed, 0, 1.0);
    var lift = GRAVITY * liftFactor * Math.cos(state.angle);

    // --- Angin level: dorongan horizontal + vertikal (gust) ---
    var windX = (input.wind || 0);
    var gust = input.gust || 0;

    // --- Integrasi gerak ---
    var vx = Math.cos(state.angle) * state.speed + windX;
    var vy = Math.sin(state.angle) * state.speed + (lift - GRAVITY) * 0.55 + gust;
    state.verticalSpeed = vy;
    state.x += vx * dt;
    state.y += vy * dt;
    state.distance += Math.max(0, vx * dt);
    state.time += dt;

    state.stalled = state.speed < stallSpeed * 0.85;
    if (state.stalled) ev.stalled = true;

    // --- Bahan bakar: boros saat throttle tinggi, hemat saat meluncur ---
    var burn = planeDef.fuelBurn * (0.25 + state.throttle * 1.15) * dt;
    state.fuel = Math.max(0, state.fuel - burn);

    // --- Batas langit dan tanah ---
    if (state.y > 420) { state.y = 420; if (state.angle > 0) state.angle = 0; }
    var ground = terrainHeightAt(state.x);
    if (state.y <= ground + 2) {
      state.y = ground + 2;
      ev.hitGround = true;
    }
    return ev;
  }

  // Kecepatan pendaratan yang aman: gabungan kecepatan vertikal + sudut.
  // Mengembalikan 'soft' | 'hard' | 'fatal'.
  function landingQuality(state) {
    var vs = Math.abs(state.verticalSpeed);
    var ang = Math.abs(state.angle);
    if (vs < 4 && ang < 0.18 && state.speed < 95) return 'soft';
    if (vs < 9 && ang < 0.35) return 'hard';
    return 'fatal';
  }

  // Damage dari benturan: sebanding dengan kecepatan vertikal saat menghantam.
  // Satu graze tidak langsung mematikan — butuh 2-3 benturan keras untuk hancur.
  function impactDamage(verticalSpeed) {
    var vs = Math.abs(verticalSpeed);
    if (vs < 3) return 0;
    return Math.min(45, Math.round((vs - 3) * 6));
  }

  global.FlightPhysics = {
    GRAVITY: GRAVITY,
    createFlight: createFlight,
    stepFlight: stepFlight,
    landingQuality: landingQuality,
    impactDamage: impactDamage,
    clamp: clamp
  };
})(typeof window !== 'undefined' ? window : globalThis);
