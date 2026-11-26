// game.js — State machine: menu, howto, select, play, pause, crash, landed,
// gameover. Mengatur skor, tabrakan, ring, pendaratan, dan adegan screenshot.
(function (global) {
  'use strict';

  var W = 1280, H = 720;
  var PX_M = 1.2;      // pixel per meter (horizontal)
  var PY_M = 2.0;      // pixel per meter (vertikal)
  var PLANE_SCREEN_X = 400; // pesawat di sepertiga kiri layar

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new global.Input(canvas);
    this.audio = new global.AudioEngine();
    var self = this;
    this.input.onFirstGesture = function () { self.audio.ensure(); };

    this.state = 'menu';
    this.planeId = 'elang';
    this.levelId = 'pagi';
    this.flight = null;
    this.level = null;
    this.terrain = null;
    this.mission = null;
    this.score = 0;
    this.ringsPassed = 0;
    this.timeSec = 0;
    this.frozenTime = null;   // diisi saat mode screenshot (?shot=)
    this.shotMode = null;
    this.camX = 0;
    this.camY = 0;
    this.message = '';
    this.messageUntil = 0;
    this.crashCause = '';
    this.landingReport = null;
    this.muted = false;
    this.buttons = [];
    this.menuDrift = 0;
    this.impactFlash = 0;
    this.endAt = 0;
  }

  Game.prototype.now = function () {
    return this.frozenTime !== null ? this.frozenTime : this.timeSec;
  };

  Game.prototype.planeDef = function () {
    return global.Planes.PLANES[this.planeId];
  };

  Game.prototype.startFlight = function () {
    this.level = global.Levels.getLevel(this.levelId);
    this.terrain = global.Terrain.makeTerrain(this.level, this.level.seed);
    this.mission = global.Levels.buildMission(this.level, this.level.seed);
    this.flight = global.FlightPhysics.createFlight(this.planeDef(), this.level);
    this.score = 0;
    this.ringsPassed = 0;
    this.camX = this.flight.x - PLANE_SCREEN_X / PX_M;
    this.camY = this.flight.y - 90;
    this.message = 'Lepas landas! Lewati semua ring, lalu mendarat di runway.';
    this.messageUntil = this.timeSec + 5;
    this.landingReport = null;
    this.state = 'play';
    this.audio.ensure();
  };

  // ---------- Adegan deterministik untuk screenshot ----------
  Game.prototype.setupShot = function (name, seed) {
    this.shotMode = name;
    this.frozenTime = 12.0;
    seed = seed || 1;
    if (name === 'menu') {
      this.state = 'select';
      this.planeId = 'garuda';
      this.levelId = 'sore';
      this.level = global.Levels.getLevel('pagi');
      this.terrain = global.Terrain.makeTerrain(this.level, 11);
      return;
    }
    var levelId = name === 'night' ? 'malam' : 'pagi';
    var planeId = name === 'night' ? 'garuda' : (name === 'landing' ? 'merpati' : 'elang');
    this.planeId = planeId;
    this.levelId = levelId;
    this.level = global.Levels.getLevel(levelId);
    this.terrain = global.Terrain.makeTerrain(this.level, this.level.seed);
    this.mission = global.Levels.buildMission(this.level, this.level.seed);
    this.flight = global.FlightPhysics.createFlight(this.planeDef(), this.level);
    if (name === 'cover') {
      this.flight.x = 2600; this.flight.y = 175;
      this.flight.speed = 62; this.flight.throttle = 0.7; this.flight.angle = 0.08;
      this.flight.fuel = 78; this.flight.damage = 6;
      this.score = 350; this.ringsPassed = 3;
      for (var i = 0; i < 3; i++) this.mission.rings[i].passed = true;
    } else if (name === 'night') {
      this.flight.x = 4200; this.flight.y = 205;
      this.flight.speed = 74; this.flight.throttle = 0.8; this.flight.angle = 0.05;
      this.flight.fuel = 61; this.flight.damage = 18;
      this.score = 820; this.ringsPassed = 5;
      for (var j = 0; j < 5; j++) this.mission.rings[j].passed = true;
    } else if (name === 'landing') {
      // Final approach: di dalam zona runway yang diratakan, turun pelan
      // menuju landasan — bukan di atas bukit sebelum runway.
      this.flight.x = this.level.runwayX - 200; this.flight.y = 62;
      this.flight.speed = 52; this.flight.throttle = 0.35; this.flight.angle = -0.05;
      this.flight.verticalSpeed = -2.0;
      this.flight.fuel = 34; this.flight.damage = 4;
      this.score = 940; this.ringsPassed = 8;
      for (var k = 0; k < 8; k++) this.mission.rings[k].passed = true;
    }
    this.camX = this.flight.x - PLANE_SCREEN_X / PX_M;
    this.camY = this.flight.y - 90;
    this.state = 'play';
  };

  // ---------- Koordinat ----------
  Game.prototype.toScreenX = function (wx) { return (wx - this.camX) * PX_M; };
  Game.prototype.toScreenY = function (wy) { return 560 - (wy - this.camY) * PY_M; };

  // ---------- Update ----------
  Game.prototype.update = function (dt) {
    var click = this.input.nextClick();
    while (click) {
      this.handleClick(click);
      click = this.input.nextClick();
    }
    if (this.input.pressedOnce('KeyM')) {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
    }

    if (this.state === 'play') {
      if (this.input.pressedOnce('KeyP')) { this.state = 'pause'; this.audio.stopFlight(); return; }
      if (this.input.pressedOnce('KeyR')) { this.startFlight(); return; }
      this.updatePlay(dt);
    } else if (this.state === 'pause') {
      if (this.input.pressedOnce('KeyP')) { this.state = 'play'; return; }
      if (this.input.pressedOnce('KeyR')) { this.startFlight(); return; }
    } else if (this.state === 'crash' || this.state === 'landed' || this.state === 'gameover') {
      if (this.input.pressedOnce('KeyR')) { this.startFlight(); return; }
    }
    if (this.impactFlash > 0) this.impactFlash = Math.max(0, this.impactFlash - dt * 2);
  };

  Game.prototype.updatePlay = function (dt) {
    var f = this.flight;
    var level = this.level;
    var gust = global.Levels.gustAt(level, this.timeSec);
    var ev = global.FlightPhysics.stepFlight(f, this.planeDef(), {
      pitchUp: this.input.pitchUp(),
      pitchDown: this.input.pitchDown(),
      throttleUp: this.input.throttleUp(),
      throttleDown: this.input.throttleDown(),
      wind: level.wind,
      gust: gust
    }, dt, this.terrain.heightAt.bind(this.terrain));

    this.audio.updateFlight(f.throttle, f.speed);

    // Kamera mengikuti pesawat dengan halus.
    var targetCamX = f.x - PLANE_SCREEN_X / PX_M;
    var targetCamY = f.y - 90;
    this.camX += (targetCamX - this.camX) * Math.min(1, dt * 6);
    this.camY += (targetCamY - this.camY) * Math.min(1, dt * 4);

    // Ring: lewati cincin = skor + lonceng.
    for (var i = 0; i < this.mission.rings.length; i++) {
      var ring = this.mission.rings[i];
      if (ring.passed) continue;
      var dx = f.x - ring.x, dy = f.y - ring.y;
      if (dx * dx + dy * dy < (ring.r + 6) * (ring.r + 6)) {
        ring.passed = true;
        this.ringsPassed++;
        var pts = 100 * level.difficulty;
        this.score += pts;
        this.message = 'Ring! +' + pts + ' poin';
        this.messageUntil = this.timeSec + 1.6;
        this.audio.ring();
      }
    }

    // Bahan bakar habis di udara: meluncur sampai jatuh = game over.
    if (f.fuel <= 0) {
      f.throttle = 0;
      if (f.y <= this.terrain.heightAt(f.x) + 4) {
        this.endGameOver('Bahan bakar habis di udara.');
        return;
      }
    }

    // Sentuh tanah / runway.
    if (ev.hitGround) {
      var nearRunway = Math.abs(f.x - level.runwayX) < 170;
      if (nearRunway) {
        var quality = global.FlightPhysics.landingQuality(f);
        if (quality === 'fatal') {
          this.endCrash('Pendaratan terlalu keras di runway.');
        } else {
          this.endLanded(quality);
        }
      } else {
        var dmg = global.FlightPhysics.impactDamage(f.verticalSpeed);
        if (dmg > 0) {
          f.damage += dmg;
          // Memantul: naik kembali dengan kecepatan cukup untuk pulih,
          // supaya satu benturan tidak berujung gesekan berulang di tanah.
          f.speed = Math.max(f.speed * 0.55, this.planeDef().cruiseSpeed * 0.7);
          f.angle = 0.3;
          f.y = this.terrain.heightAt(f.x) + 12;
          this.impactFlash = 0.8;
          this.audio.crash();
          this.message = 'Benturan! Damage +' + dmg + '%';
          this.messageUntil = this.timeSec + 2;
          if (f.damage >= 100) {
            this.endCrash('Pesawat hancur setelah menabrak terrain.');
            return;
          }
        } else {
          // Sentuhan ringan: memantul kembali ke udara.
          f.y = this.terrain.heightAt(f.x) + 3;
          f.angle = 0.3;
          f.speed *= 0.8;
        }
      }
    }
  };

  Game.prototype.endCrash = function (cause) {
    this.crashCause = cause;
    this.state = 'crash';
    this.audio.stopFlight();
    this.audio.crash();
    this.endAt = this.timeSec;
  };

  Game.prototype.endGameOver = function (cause) {
    this.crashCause = cause;
    this.state = 'gameover';
    this.audio.stopFlight();
    this.audio.crash();
  };

  Game.prototype.endLanded = function (quality) {
    var f = this.flight;
    var level = this.level;
    var landingPts = quality === 'soft' ? 500 : 150;
    var timeBonus = Math.max(0, Math.round(level.timeBonus - f.time * 8));
    var fuelBonus = Math.round(f.fuel * 5);
    var ringBonus = this.ringsPassed * 100 * level.difficulty;
    var total = ringBonus + landingPts + timeBonus + fuelBonus;
    this.score = total;
    this.landingReport = {
      quality: quality,
      qualityText: quality === 'soft' ? 'MULUS' : 'KERAS',
      rings: this.ringsPassed + '/' + this.mission.totalRings,
      ringBonus: ringBonus,
      landingPts: landingPts,
      timeBonus: timeBonus,
      fuelBonus: fuelBonus,
      time: f.time,
      total: total
    };
    this.state = 'landed';
    this.audio.stopFlight();
    this.audio.landed();
  };

  // ---------- Klik / tombol ----------
  Game.prototype.handleClick = function (click) {
    for (var i = 0; i < this.buttons.length; i++) {
      var b = this.buttons[i];
      if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
        this.audio.ensure();
        this.audio.click();
        b.action();
        return;
      }
    }
  };

  Game.prototype.addButton = function (id, x, y, w, h, action) {
    this.buttons.push({ id: id, x: x, y: y, w: w, h: h, action: action });
  };

  Game.prototype.drawButton = function (ctx, x, y, w, h, text, primary, hover) {
    var mx = this.input.mouseX, my = this.input.mouseY;
    var isHover = mx >= x && mx <= x + w && my >= y && my <= y + h;
    ctx.save();
    ctx.fillStyle = primary ? (isHover ? '#ffcf4d' : '#f2b705') : (isHover ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)');
    global.HUD.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = primary ? '#8a6400' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    global.HUD.label(ctx, text, x + w / 2, y + h / 2 + 1, 18, primary ? '#241a00' : '#ffffff', 'center');
    ctx.restore();
  };

  // ---------- Render ----------
  Game.prototype.render = function () {
    var ctx = this.ctx;
    this.buttons = [];
    var t = this.now();

    if (this.state === 'menu' || this.state === 'howto' || this.state === 'select') {
      this.renderBackdrop(t);
      if (this.state === 'menu') this.renderMenu();
      else if (this.state === 'howto') this.renderHowto();
      else this.renderSelect();
      return;
    }

    // Dunia terbang.
    var level = this.level;
    global.Terrain.drawSky(ctx, W, H, level, this.camX, t);
    var self = this;
    global.Terrain.drawGround(ctx, W, H, level, this.terrain, this.camX, this.camY,
      function (wy) { return self.toScreenY(wy); });

    // Ring.
    for (var i = 0; i < this.mission.rings.length; i++) {
      var ring = this.mission.rings[i];
      var sx = this.toScreenX(ring.x), sy = this.toScreenY(ring.y);
      if (sx < -80 || sx > W + 80) continue;
      global.HUD.drawRing(ctx, sx, sy, ring.r * PX_M * 0.9, ring.passed, t);
    }

    // Pesawat.
    var px = PLANE_SCREEN_X, py = this.toScreenY(this.flight.y);
    global.Planes.drawPlane(ctx, px, py, this.flight.angle, this.planeDef(), this.flight.throttle, t);

    // Hujan.
    if (level.rain) global.Terrain.drawRain(ctx, W, H, t, level.rain);

    // Kilat benturan.
    if (this.impactFlash > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,60,40,' + (this.impactFlash * 0.25) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // HUD.
    var ringsLeft = this.mission.totalRings - this.ringsPassed;
    global.HUD.drawHUD(ctx, this.flight, this.mission, level, this.planeDef(),
      this.score, ringsLeft, t);

    // Pesan tengah layar.
    if (t < this.messageUntil && this.message) {
      ctx.save();
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,18,30,0.7)';
      var mw = ctx.measureText(this.message).width + 36;
      global.HUD.roundRect(ctx, W / 2 - mw / 2, 140, mw, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(this.message, W / 2, 163);
      ctx.restore();
    }

    // Peringatan terrain berdasarkan jarak bersih ke tanah di bawah pesawat
    // (bukan ketinggian absolut — penting di pegunungan yang tanahnya tinggi).
    var clearance = this.flight.y - this.terrain.heightAt(this.flight.x);
    if (clearance < 45 && this.state === 'play') {
      var blinkWarn = Math.floor(t * 3) % 2 === 0;
      if (blinkWarn) global.HUD.label(ctx, 'TERRAIN! TARIK KE ATAS!', W / 2, 92, 20, '#ff6b6b', 'center');
    }

    if (this.muted) {
      global.HUD.label(ctx, 'SUARA MATI (M)', W - 24, 100, 13, '#ffb02e', 'right');
    }

    if (this.state === 'pause') this.renderPause();
    else if (this.state === 'crash') this.renderEnd('CRASH!', this.crashCause, '#ff5a4d');
    else if (this.state === 'gameover') this.renderEnd('GAME OVER', this.crashCause, '#ff5a4d');
    else if (this.state === 'landed') this.renderLanded();
  };

  // Latar menu: langit pagi + terrain berjalan pelan.
  Game.prototype.renderBackdrop = function (t) {
    var ctx = this.ctx;
    var level = this.level || global.Levels.getLevel('pagi');
    var terrain = this.terrain || global.Terrain.makeTerrain(level, 11);
    this.menuDrift += 0.35;
    var fakeCamX = this.menuDrift;
    var fakeCamY = 40;
    var self = this;
    global.Terrain.drawSky(ctx, W, H, level, fakeCamX, t);
    global.Terrain.drawGround(ctx, W, H, level, terrain, fakeCamX, fakeCamY,
      function (wy) { return 560 - (wy - fakeCamY) * PY_M; });
    // Pesawat hiasan melintas.
    var hx = ((t * 60) % (W + 200)) - 100;
    global.Planes.drawPlane(ctx, hx, 220 + Math.sin(t * 0.8) * 14, 0.05,
      global.Planes.PLANES.elang, 0.6, t);
  };

  Game.prototype.renderMenu = function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,24,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    global.HUD.label(ctx, 'LANGIT NUSANTARA', W / 2, 150, 64, '#ffffff', 'center');
    ctx.save();
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#f2b705';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('LANGIT NUSANTARA', W / 2, 150);
    ctx.restore();
    global.HUD.label(ctx, 'Terbang melintasi Indonesia — lewati ring, hemat bahan bakar, mendarat mulus.', W / 2, 205, 20, '#ffe9a8', 'center');
    global.HUD.label(ctx, 'Laut • Pantai • Sawah • Hutan • Sungai • Gunung • Desa', W / 2, 238, 16, '#cfe3f2', 'center');

    var self = this;
    this.drawButton(ctx, W / 2 - 160, 300, 320, 62, 'TERBANG', true);
    this.addButton('fly', W / 2 - 160, 300, 320, 62, function () { self.state = 'select'; });
    this.drawButton(ctx, W / 2 - 160, 380, 320, 62, 'CARA MAIN', false);
    this.addButton('howto', W / 2 - 160, 380, 320, 62, function () { self.state = 'howto'; });
    global.HUD.label(ctx, 'Keyboard: panah / WASD  •  P jeda  •  R ulang  •  M suara', W / 2, 490, 14, 'rgba(255,255,255,0.8)', 'center');
    global.HUD.label(ctx, 'Skor: ring + waktu + kelembutan mendarat + sisa bahan bakar', W / 2, 518, 14, 'rgba(255,255,255,0.8)', 'center');
  };

  Game.prototype.renderHowto = function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    global.HUD.panel(ctx, W / 2 - 380, 90, 760, 500);
    global.HUD.label(ctx, 'CARA MAIN', W / 2, 130, 34, '#ffd23f', 'center');
    var lines = [
      '1. Pilih pesawat dan level, lalu tekan MULAI TERBANG.',
      '2. Terbang dengan tombol panah atau WASD:',
      '     Atas / W = naik  •  Bawah / S = turun',
      '     Kanan / D = tambah throttle  •  Kiri / A = kurangi throttle',
      '3. Lewati semua cincin emas untuk poin. Ring = 100 x tingkat level.',
      '4. Jaga bahan bakar: throttle penuh membakar cepat.',
      '5. Jangan menabrak terrain — benturan menambah damage.',
      '6. Mendarat di runway dengan pelan: kecepatan turun kecil,',
      '     sayap rata, kecepatan rendah. Mendarat mulus = +500 poin.',
      '7. Bahan bakar habis di udara = jatuh. Damage 100% = crash.',
      '',
      'P = jeda  •  R = ulang penerbangan  •  M = suara hidup/mati'
    ];
    ctx.save();
    ctx.font = '17px Arial, sans-serif';
    ctx.fillStyle = '#eaf3fa';
    ctx.textAlign = 'left';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2 - 350, 175 + i * 30);
    }
    ctx.restore();
    var self = this;
    this.drawButton(ctx, W / 2 - 110, 610, 220, 52, 'KEMBALI', true);
    this.addButton('back', W / 2 - 110, 610, 220, 52, function () { self.state = 'menu'; });
  };

  Game.prototype.renderSelect = function () {
    var ctx = this.ctx;
    var self = this;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,24,0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    global.HUD.label(ctx, 'PILIH PESAWAT', W / 2, 60, 30, '#ffffff', 'center');

    // Kartu pesawat.
    var cardW = 300, cardH = 210, gap = 30;
    var totalW = cardW * 3 + gap * 2;
    var x0 = (W - totalW) / 2;
    global.Planes.PLANE_ORDER.forEach(function (id, idx) {
      var def = global.Planes.PLANES[id];
      var x = x0 + idx * (cardW + gap), y = 90;
      var selected = self.planeId === id;
      ctx.save();
      ctx.fillStyle = selected ? 'rgba(242,183,5,0.28)' : 'rgba(8,18,30,0.72)';
      global.HUD.roundRect(ctx, x, y, cardW, cardH, 14);
      ctx.fill();
      ctx.strokeStyle = selected ? '#ffd23f' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.stroke();
      ctx.restore();
      global.Planes.drawPlaneCard(ctx, x + cardW / 2, y + 62, def, 1.5);
      global.HUD.label(ctx, def.name, x + cardW / 2, y + 118, 22, '#ffffff', 'center');
      global.HUD.label(ctx, def.tagline, x + cardW / 2, y + 146, 12, '#cfe3f2', 'center');
      global.HUD.label(ctx, 'Max ' + Math.round(def.maxSpeed * 3.6) + ' km/jam  •  BBM ' +
        (def.fuelBurn < 0.5 ? 'irit' : def.fuelBurn < 0.8 ? 'sedang' : 'boros'),
        x + cardW / 2, y + 172, 12, '#ffd23f', 'center');
      if (selected) global.HUD.label(ctx, 'DIPILIH', x + cardW - 16, y + 22, 13, '#ffd23f', 'right');
      self.addButton('plane-' + id, x, y, cardW, cardH, (function (pid) {
        return function () { self.planeId = pid; };
      })(id));
    });

    // Kartu level.
    global.HUD.label(ctx, 'PILIH LEVEL', W / 2, 350, 30, '#ffffff', 'center');
    var lCardW = 300, lCardH = 130;
    var lx0 = (W - (lCardW * 3 + gap * 2)) / 2;
    global.Levels.LEVELS.forEach(function (lv, idx) {
      var x = lx0 + idx * (lCardW + gap), y = 380;
      var selected = self.levelId === lv.id;
      ctx.save();
      ctx.fillStyle = selected ? 'rgba(242,183,5,0.28)' : 'rgba(8,18,30,0.72)';
      global.HUD.roundRect(ctx, x, y, lCardW, lCardH, 14);
      ctx.fill();
      ctx.strokeStyle = selected ? '#ffd23f' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.stroke();
      ctx.restore();
      global.HUD.label(ctx, lv.name, x + lCardW / 2, y + 30, 19, '#ffffff', 'center');
      global.HUD.label(ctx, lv.tagline, x + lCardW / 2, y + 60, 12, '#cfe3f2', 'center');
      var diff = lv.difficulty === 1 ? 'Mudah' : lv.difficulty === 2 ? 'Sedang' : 'Sulit';
      global.HUD.label(ctx, diff + '  •  ' + lv.ringCount + ' ring  •  ' + lv.length + ' m',
        x + lCardW / 2, y + 92, 12, '#ffd23f', 'center');
      if (selected) global.HUD.label(ctx, 'DIPILIH', x + lCardW - 16, y + 22, 13, '#ffd23f', 'right');
      self.addButton('level-' + lv.id, x, y, lCardW, lCardH, (function (lid) {
        return function () { self.levelId = lid; };
      })(lv.id));
    });

    this.drawButton(ctx, W / 2 - 170, 545, 340, 60, 'MULAI TERBANG', true);
    this.addButton('start', W / 2 - 170, 545, 340, 60, function () { self.startFlight(); });
    this.drawButton(ctx, W / 2 - 170, 620, 340, 44, 'KEMBALI', false);
    this.addButton('back', W / 2 - 170, 620, 340, 44, function () { self.state = 'menu'; });
  };

  Game.prototype.renderPause = function () {
    var ctx = this.ctx;
    var self = this;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,24,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    global.HUD.label(ctx, 'JEDA', W / 2, 220, 54, '#ffffff', 'center');
    global.HUD.label(ctx, 'Istirahat sebentar — langit menunggu.', W / 2, 272, 17, '#cfe3f2', 'center');
    this.drawButton(ctx, W / 2 - 150, 320, 300, 56, 'LANJUTKAN', true);
    this.addButton('resume', W / 2 - 150, 320, 300, 56, function () { self.state = 'play'; });
    this.drawButton(ctx, W / 2 - 150, 392, 300, 56, 'ULANGI', false);
    this.addButton('restart', W / 2 - 150, 392, 300, 56, function () { self.startFlight(); });
    this.drawButton(ctx, W / 2 - 150, 464, 300, 56, 'MENU UTAMA', false);
    this.addButton('menu', W / 2 - 150, 464, 300, 56, function () { self.state = 'menu'; });
  };

  Game.prototype.renderEnd = function (title, cause, color) {
    var ctx = this.ctx;
    var self = this;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,24,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    global.HUD.label(ctx, title, W / 2, 200, 56, color, 'center');
    global.HUD.label(ctx, cause, W / 2, 252, 19, '#eaf3fa', 'center');
    global.HUD.label(ctx, 'Skor: ' + this.score + '   •   Ring: ' + this.ringsPassed + '/' + this.mission.totalRings +
      '   •   Jarak: ' + Math.round(this.flight.distance) + ' m', W / 2, 296, 18, '#ffd23f', 'center');
    this.drawButton(ctx, W / 2 - 150, 350, 300, 56, 'COBA LAGI (R)', true);
    this.addButton('retry', W / 2 - 150, 350, 300, 56, function () { self.startFlight(); });
    this.drawButton(ctx, W / 2 - 150, 422, 300, 56, 'MENU UTAMA', false);
    this.addButton('menu', W / 2 - 150, 422, 300, 56, function () { self.state = 'menu'; });
  };

  Game.prototype.renderLanded = function () {
    var ctx = this.ctx;
    var self = this;
    var r = this.landingReport;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,24,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    global.HUD.label(ctx, 'MENDARAT!', W / 2, 150, 56, '#35d461', 'center');
    global.HUD.label(ctx, 'Pendaratan ' + r.qualityText + ' di runway — selamat datang kembali.',
      W / 2, 202, 19, '#eaf3fa', 'center');
    global.HUD.panel(ctx, W / 2 - 260, 240, 520, 210);
    var rows = [
      ['Ring (' + r.rings + ')', r.ringBonus],
      ['Pendaratan ' + r.qualityText, r.landingPts],
      ['Bonus waktu (' + Math.round(r.time) + ' dtk)', r.timeBonus],
      ['Bonus bahan bakar', r.fuelBonus]
    ];
    ctx.save();
    ctx.font = '18px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#eaf3fa';
    for (var i = 0; i < rows.length; i++) {
      ctx.fillText(rows[i][0], W / 2 - 230, 280 + i * 34);
      ctx.textAlign = 'right';
      ctx.fillText('+' + rows[i][1], W / 2 + 230, 280 + i * 34);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    global.HUD.label(ctx, 'TOTAL SKOR: ' + r.total, W / 2, 420, 26, '#ffd23f', 'center');
    this.drawButton(ctx, W / 2 - 150, 480, 300, 56, 'TERBANG LAGI (R)', true);
    this.addButton('retry', W / 2 - 150, 480, 300, 56, function () { self.startFlight(); });
    this.drawButton(ctx, W / 2 - 150, 552, 300, 56, 'MENU UTAMA', false);
    this.addButton('menu', W / 2 - 150, 552, 300, 56, function () { self.state = 'menu'; });
  };

  global.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
