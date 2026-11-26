// main.js — boot, game loop, state machine (menu/playing/paused/crashed/landed),
// cameras, scoring, deterministic ?shot= modes and ?autopilot=1 verification.

import {
  createGL, uploadMesh, drawMesh, mat4Perspective, mat4LookAt, mat4Translate,
  mat4Scale, mat4Multiply, mat4FromYawPitchRoll, mat4RotateZ, clamp, lerp,
} from './gl.js';
import { makeTerrain } from './terrain.js';
import { PLANES, buildPlaneMesh, newFlight, stepFlight, forwardVector } from './plane.js';
import { buildRingMeshes, checkRingPass, ringsRemaining, nextRing } from './rings.js';
import { LEVELS, freshLevel } from './levels.js';
import { createRain, createStars, createSkyDisc, discModel, windGust } from './weather.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const AUTOPILOT = params.get('autopilot') === '1';
const FAST = params.get('fast') === '1'; // skip rendering: headless verification runs at full sim speed
const PARAM_PLANE = params.get('plane') || '';
const PARAM_LEVEL = params.get('level');
const PARAM_SEED = params.get('seed');

const canvas = document.getElementById('gl');
const ctx = createGL(canvas);
const { gl } = ctx;
const hud = createHud(document);
const audio = createAudio();
const input = createInput();

let selectedPlane = PLANES.garuda;
let selectedLevelId = 0;
let level = freshLevel(0);
let terrain = null;
let meshes = null; // uploaded terrain/plane/ring/weather meshes for current level
let flight = null;
let state = 'menu'; // menu | playing | paused | crashed | landed | complete
let cameraMode = 'chase';
let camPos = [0, 60, 120];
let timeSec = 0;
let highScore = 0;
try { highScore = Number(localStorage.getItem('langit3d_highscore') || 0) || 0; } catch (e) { highScore = 0; }
let autopilotDone = false;
let autopilotStart = 0;
let finalLatched = false; // once the autopilot commits to the final, it stays committed

const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// ---- level / flight setup ----
function loadLevel(id) {
  level = freshLevel(id);
  if (PARAM_SEED) level.seed = Number(PARAM_SEED) || level.seed;
  terrain = makeTerrain(level);
  // Ring yaw: each ring faces the flight direction into it.
  let prev = { x: level.spawn.x, y: level.spawn.y, z: level.spawn.z };
  for (const r of level.rings) {
    const dx = r.x - prev.x, dz = r.z - prev.z;
    r.yaw = Math.atan2(dx, dz);
    prev = r;
  }
  const planeMeshes = {};
  for (const key of Object.keys(PLANES)) {
    const built = buildPlaneMesh(PLANES[key]);
    planeMeshes[key] = {
      body: uploadMesh(gl, ctx.att, built.body),
      prop: uploadMesh(gl, ctx.att, built.prop),
      noseZ: -(PLANES[key].fuselageLen * 0.32 + 1.9),
    };
  }
  meshes = {
    ground: uploadMesh(gl, ctx.att, terrain.groundMesh),
    sea: uploadMesh(gl, ctx.att, terrain.seaMesh),
    trees: uploadMesh(gl, ctx.att, terrain.treeMesh),
    runway: uploadMesh(gl, ctx.att, terrain.runwayMesh),
    rings: buildRingMeshes(ctx),
    stars: createStars(ctx, level.seed),
    sunDisc: createSkyDisc(ctx, level.night ? [0.85, 0.88, 0.95] : [1.0, 0.9, 0.6], level.night ? 14 : 22),
    rain: level.rain ? createRain(ctx, level.seed) : null,
    planes: planeMeshes,
  };
}

function startFlight() {
  flight = newFlight(selectedPlane, level.spawn);
  flight.startTime = timeSec;
  state = 'playing';
  cameraMode = 'chase';
  // Snap the chase camera behind the plane so the first frame is already framed.
  const f0 = forwardVector(flight);
  camPos = [flight.x - f0[0] * 16, flight.y - f0[1] * 16 + 5, flight.z - f0[2] * 16];
  document.getElementById('menu').style.display = 'none';
  document.getElementById('pause').style.display = 'none';
  document.getElementById('end').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  hud.clearMessage();
  hud.message(level.name + ' — lewati ' + level.rings.length + ' ring, lalu mendarat!', 3500);
  audio.unlock();
  finalLatched = false;
  if (AUTOPILOT) autopilotStart = timeSec;
}

function showEnd(title, detail) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-detail').textContent = detail;
  document.getElementById('end').style.display = 'flex';
}

function missionComplete() {
  const timeBonus = Math.max(0, Math.round(240 - flight.elapsed));
  const fuelBonus = Math.round(flight.fuel) * 2;
  const bonus = 200 + timeBonus + fuelBonus;
  flight.score += bonus;
  state = 'complete';
  audio.fanfare();
  if (flight.score > highScore) {
    highScore = flight.score;
    try { localStorage.setItem('langit3d_highscore', String(highScore)); } catch (e) { /* private mode */ }
  }
  showEnd('MISI SELESAI!',
    'Semua ring dilewati dan mendarat mulus. Skor ' + flight.score +
    ' (bonus pendaratan ' + bonus + ', waktu ' + Math.round(flight.elapsed) + ' dtk). Skor tertinggi: ' + highScore +
    '. Tekan R untuk terbang lagi.');
  reportAutopilot(true);
}

function crashEnd(reason) {
  state = 'crashed';
  audio.thud();
  window.__crash = {
    x: Math.round(flight.x), y: Math.round(flight.y), z: Math.round(flight.z),
    speed: Math.round(flight.speed), vy: Math.round(flight.vy * 10) / 10,
    pitch: Math.round(flight.pitch * 100) / 100, roll: Math.round(flight.roll * 100) / 100,
    fuel: Math.round(flight.fuel), reason,
  };
  console.log('CRASH ' + JSON.stringify(window.__crash));
  showEnd('PESAWAT JATUH', reason + ' Skor ' + flight.score + ' — ring ' + flight.ringsPassed + '/' + level.rings.length +
    '. Tekan R untuk mencoba lagi.');
  reportAutopilot(false);
}

function reportAutopilot(landed) {
  if (!AUTOPILOT || autopilotDone) return;
  autopilotDone = true;
  const result = {
    plane: selectedPlane.id, level: selectedLevelId,
    rings: flight.ringsPassed, totalRings: level.rings.length,
    landed: landed ? 1 : 0, score: flight.score,
    fuel: Math.round(flight.fuel), damage: Math.round(flight.damage),
    time: Math.round(flight.elapsed),
  };
  window.__autopilot = result;
  const line = 'AUTOPILOT DONE plane=' + result.plane + ' level=' + result.level +
    ' rings=' + result.rings + '/' + result.totalRings + ' landed=' + result.landed +
    ' score=' + result.score + ' fuel=' + result.fuel + ' damage=' + result.damage +
    ' time=' + result.time + 's';
  document.title = line;
  console.log(line);
}

// ---- autopilot controller ----
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function autopilotInput() {
  const target = nextRing(level.rings);
  let tx, ty, tz, wantThrottle;
  if (target) {
    tx = target.x; ty = target.y + 2; tz = target.z;
    // Slow down for the ring: a tight turn needs low speed.
    const dTarget = Math.hypot(target.x - flight.x, target.z - flight.z);
    wantThrottle = dTarget < 70 ? 0.32 : dTarget < 170 ? 0.45 : 0.72;
  } else {
    // Landing: line up on the centerline at a safe altitude, then commit to the
    // final only while heading east along it — the commit is a heading + position
    // window, never a fixed point to orbit.
    const rw = level.runway;
    const lineupAlt = level.night ? 75 : 45;
    const headingEast = Math.abs(wrapAngle(flight.yaw + Math.PI / 2)) < 0.6;
    const commitX = rw.x - (lineupAlt > 50 ? 200 : 60);
    // Lateral window wider than the slowest plane's turn radius, so an orbit
    // around the fix still passes through the commit window heading east.
    // The commit latches: once on final, the plane never turns back to the fix.
    if (!finalLatched) {
      finalLatched = headingEast && flight.x < commitX && Math.abs(flight.z - rw.z) < 90;
    }
    const onFinal = finalLatched;
    if (onFinal) {
      tx = rw.x + 250; ty = rw.y + 1.0; tz = rw.z;
      // Keep comfortably above stall speed on final.
      wantThrottle = Math.max(0.30, (flight.def.stallSpeed + 6) / flight.def.maxSpeed);
    } else {
      tx = rw.x - 250; ty = rw.y + lineupAlt; tz = rw.z; wantThrottle = 0.45;
    }
  }
  const dx = tx - flight.x, dz = tz - flight.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  let yawErr = desiredYaw - flight.yaw;
  while (yawErr > Math.PI) yawErr -= Math.PI * 2;
  while (yawErr < -Math.PI) yawErr += Math.PI * 2;
  const altErr = ty - flight.y;
  const dist = Math.hypot(dx, dz);
  // Flare: keep the descent gentle when close to the ground (any terrain, not
  // just the runway — the ground west of the strip is higher than the strip).
  // Higher up, cap the dive so the flare has time to work.
  let pitchIn = clamp(altErr * 0.045, -1, 1);
  if (!target) {
    const clearance = flight.y - terrain.heightAt(flight.x, flight.z);
    pitchIn = clearance < 25 ? clamp(pitchIn, -0.35, 0.35) : clamp(pitchIn, -0.6, 1);
  }
  // Gentle bank on final so the wings are level at touchdown; firm bank for rings.
  const rollGain = target ? 2.0 : 0.8;
  return {
    pitch: pitchIn * (dist < 60 ? 0.5 : 1),
    roll: clamp(-yawErr * rollGain, -1, 1),
    throttleDelta: (wantThrottle - flight.throttle) * 1.4,
  };
}

// ---- physics + scoring step ----
function stepGame(dt) {
  const prev = { x: flight.x, y: flight.y, z: flight.z };
  let inp;
  if (AUTOPILOT) {
    inp = autopilotInput();
  } else {
    const s = input.stick();
    inp = { pitch: s.pitch, roll: s.roll, throttleDelta: s.throttleDelta };
  }
  const wind = windGust(level, timeSec);
  const res = stepFlight(flight, inp, dt, terrain, level.runway, wind);

  const ring = nextRing(level.rings);
  if (ring) {
    const pts = checkRingPass(flight, ring, prev);
    if (pts > 0) {
      flight.score += pts;
      flight.ringsPassed++;
      audio.ring();
      hud.message('RING ' + flight.ringsPassed + '/' + level.rings.length + '  +' + pts, 1400);
    }
  }
  if (res === 'landed') {
    if (ringsRemaining(level.rings) === 0) {
      missionComplete();
    } else {
      state = 'landed';
      hud.message('Mendarat — ' + ringsRemaining(level.rings) + ' ring tersisa. Tekan W untuk lepas landas lagi.', 4000);
    }
  } else if (res === 'crashed') {
    crashEnd(flight.fuel <= 0 ? 'Bahan bakar habis dan pesawat menabrak tanah.' : 'Pesawat menabrak tanah.');
  } else if (res === 'bounced') {
    audio.thud();
    hud.message('Benturan keras! Damage ' + Math.round(flight.damage) + '%', 1500);
    if (flight.damage >= 100) crashEnd('Kerusakan 100% — pesawat hancur.');
  }
  if (flight.fuel <= 0 && state === 'playing') {
    hud.message('BAHAN BAKAR HABIS — meluncur!', 2000);
  }
}

// ---- rendering ----
function render() {
  resize();
  const w = canvas.width, h = canvas.height;
  gl.clearColor(level.sky[0], level.sky[1], level.sky[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const proj = mat4Perspective((62 * Math.PI) / 180, w / h, 0.5, 2400);

  // Camera.
  let eye, look;
  const fwd = flight ? forwardVector(flight) : [0, 0, -1];
  if (state === 'menu') {
    const rw = level.runway;
    eye = [rw.x - 95, rw.y + 26, rw.z + 85];
    look = [rw.x, rw.y + 4, rw.z];
  } else if (cameraMode === 'cockpit' && flight) {
    eye = [flight.x + fwd[0] * 1.2, flight.y + 1.3, flight.z + fwd[2] * 1.2];
    look = [flight.x + fwd[0] * 60, flight.y + fwd[1] * 60, flight.z + fwd[2] * 60];
  } else if (flight) {
    const tx = flight.x - fwd[0] * 16, ty = flight.y - fwd[1] * 16 + 5, tz = flight.z - fwd[2] * 16;
    const k = 1 - Math.exp(-6 * (1 / 60));
    camPos[0] += (tx - camPos[0]) * k;
    camPos[1] += (ty - camPos[1]) * k;
    camPos[2] += (tz - camPos[2]) * k;
    eye = camPos;
    look = [flight.x + fwd[0] * 24, flight.y + fwd[1] * 24 + 1, flight.z + fwd[2] * 24];
  } else {
    eye = [0, 80, 160]; look = [0, 10, 0];
  }
  const view = mat4LookAt(eye, look, [0, 1, 0]);
  gl.uniformMatrix4fv(ctx.uni.proj, false, proj);
  gl.uniformMatrix4fv(ctx.uni.view, false, view);
  gl.uniform3fv(ctx.uni.sunDir, level.sunDir);
  gl.uniform3fv(ctx.uni.sunColor, level.sunColor);
  gl.uniform3fv(ctx.uni.ambient, level.ambient);
  gl.uniform3fv(ctx.uni.fogColor, level.fogColor);
  gl.uniform1f(ctx.uni.fogDensity, level.fogDensity);
  gl.uniform3fv(ctx.uni.camPos, eye);

  drawMesh(ctx, meshes.ground, IDENT, 0);
  drawMesh(ctx, meshes.sea, IDENT, 0);
  drawMesh(ctx, meshes.trees, IDENT, 0);
  drawMesh(ctx, meshes.runway, IDENT, level.night ? 0.35 : 0);
  if (level.stars) drawMesh(ctx, meshes.stars, IDENT, 0.9);
  drawMesh(ctx, meshes.sunDisc, discModel(level, 700), 0.85);

  // Rings: next ring glows and pulses, passed rings green, later rings pale.
  const pulse = 1 + 0.06 * Math.sin(timeSec * 4);
  for (let i = 0; i < level.rings.length; i++) {
    const r = level.rings[i];
    let mesh = meshes.rings.later, emis = 0.12, scale = 1;
    if (r.passed) { mesh = meshes.rings.done; emis = 0.25; }
    else if (r === nextRing(level.rings)) { mesh = meshes.rings.next; emis = 0.85; scale = pulse; }
    const model = mat4Multiply(
      mat4Translate(r.x, r.y, r.z),
      mat4Multiply(mat4RotateZ(0), mat4Multiply(
        // face the approach direction (rotate torus normal onto flight dir)
        new Float32Array([Math.cos(r.yaw), 0, -Math.sin(r.yaw), 0, 0, 1, 0, 0, Math.sin(r.yaw), 0, Math.cos(r.yaw), 0, 0, 0, 0, 1]),
        mat4Scale(scale, scale, scale))));
    drawMesh(ctx, mesh, model, emis);
  }

  // Aircraft.
  if (flight) {
    const pm = meshes.planes[selectedPlane.id];
    const model = mat4Multiply(
      mat4Translate(flight.x, flight.y, flight.z),
      mat4FromYawPitchRoll(flight.yaw, flight.pitch, flight.roll));
    drawMesh(ctx, pm.body, model, 0);
    const propModel = mat4Multiply(model,
      mat4Multiply(mat4Translate(0, 0, pm.noseZ), mat4RotateZ(flight.propAngle)));
    drawMesh(ctx, pm.prop, propModel, 0);
  }

  if (meshes.rain && state !== 'menu') {
    meshes.rain.update(1 / 60, flight ? flight.x : 0, flight ? flight.y : 50, flight ? flight.z : 0);
    meshes.rain.draw(ctx, IDENT);
  }
}

// ---- menu wiring ----
function buildMenu() {
  const planeBox = document.getElementById('plane-pick');
  const levelBox = document.getElementById('level-pick');
  for (const key of Object.keys(PLANES)) {
    const p = PLANES[key];
    const b = document.createElement('button');
    b.className = 'pick' + (key === selectedPlane.id ? ' sel' : '');
    b.innerHTML = '<b>' + p.name + '</b><span>' + p.desc + '</span><span>Max ' + Math.round(p.maxSpeed * 1.94) +
      ' kt · Stall ' + Math.round(p.stallSpeed * 1.94) + ' kt</span>';
    b.onclick = () => {
      selectedPlane = p;
      planeBox.querySelectorAll('.pick').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      audio.unlock();
    };
    planeBox.appendChild(b);
  }
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'pick' + (i === selectedLevelId ? ' sel' : '');
    b.innerHTML = '<b>' + lv.name + '</b><span>' + lv.desc + '</span>';
    b.onclick = () => {
      selectedLevelId = i;
      levelBox.querySelectorAll('.pick').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      loadLevel(i);
      audio.unlock();
    };
    levelBox.appendChild(b);
  });
  document.getElementById('start-btn').onclick = () => { audio.unlock(); startFlight(); };
  document.getElementById('resume-btn').onclick = () => {
    state = 'playing';
    document.getElementById('pause').style.display = 'none';
  };
  document.getElementById('restart-btn').onclick = () => { startFlight(); };
  document.getElementById('highscore').textContent = highScore > 0 ? 'Skor tertinggi: ' + highScore : '';
  document.getElementById('menu').style.display = 'flex';
}

// ---- deterministic shot poses ----
function applyShot() {
  if (PARAM_PLANE && PLANES[PARAM_PLANE]) selectedPlane = PLANES[PARAM_PLANE];
  if (PARAM_LEVEL !== null && PARAM_LEVEL !== undefined && PARAM_LEVEL !== '') {
    selectedLevelId = clamp(Number(PARAM_LEVEL) || 0, 0, LEVELS.length - 1);
  }
  loadLevel(selectedLevelId);
  if (SHOT === 'menu') {
    state = 'menu';
    flight = newFlight(selectedPlane, { x: level.runway.x, y: level.runway.y + 1.6, z: level.runway.z, yaw: -Math.PI / 2, speed: 0, throttle: 0 });
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
    return;
  }
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  if (SHOT === 'night') {
    selectedLevelId = 2;
    loadLevel(2);
    flight = newFlight(selectedPlane, { x: -170, y: 82, z: 40, yaw: -Math.PI / 2, speed: 52, throttle: 0.7 });
  } else if (SHOT === 'landing') {
    flight = newFlight(selectedPlane, { x: -90, y: 26, z: 60, yaw: -Math.PI / 2, speed: 38, throttle: 0.42 });
    flight.pitch = -0.06;
  } else {
    // cover (and default): coastal morning chase view, ring + runway ahead.
    flight = newFlight(selectedPlane, { x: -170, y: 52, z: 60, yaw: -Math.PI / 2, speed: 52, throttle: 0.7 });
  }
  flight.score = 100; // one ring already banked, so the HUD shows progress
  state = 'playing';
  const f0 = forwardVector(flight);
  camPos = [flight.x - f0[0] * 16, flight.y - f0[1] * 16 + 5, flight.z - f0[2] * 16];
  hud.update(flight, level, ringsRemaining(level.rings), 0);
}

// ---- main loop ----
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  timeSec += dt;

  if (input.consume('pause')) {
    if (state === 'playing') {
      state = 'paused';
      document.getElementById('pause').style.display = 'flex';
    } else if (state === 'paused') {
      state = 'playing';
      document.getElementById('pause').style.display = 'none';
    }
  }
  if (input.consume('restart')) {
    if (state !== 'menu') startFlight();
  }
  if (input.consume('mute')) audio.setMuted(!audio.isMuted());
  if (input.consume('camera')) cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (input.consume('confirm') && state === 'menu') startFlight();

  if (state === 'playing' && flight) {
    if (SHOT) {
      // Posed screenshot: spin the prop and pulse rings, but hold the plane still.
      flight.propAngle += dt * 30;
    } else if (AUTOPILOT) {
      // Fast-forward: many physics steps per frame so verification finishes quickly.
      for (let s = 0; s < 30 && state === 'playing'; s++) stepGame(1 / 60);
      if (!autopilotDone && timeSec - autopilotStart > 300) {
        reportAutopilot(false);
        document.title = 'AUTOPILOT TIMEOUT plane=' + selectedPlane.id + ' level=' + selectedLevelId +
          ' rings=' + flight.ringsPassed + '/' + level.rings.length;
        console.log(document.title);
      }
    } else {
      stepGame(dt);
    }
    audio.update(flight.throttle, flight.speed, flight.def.maxSpeed);
    hud.update(flight, level, ringsRemaining(level.rings), flight.elapsed);
  } else if (state === 'landed' && flight) {
    // On the ground: throttle up to take off again.
    if (AUTOPILOT && ringsRemaining(level.rings) > 0) {
      flight.throttle = 0.75;
      state = 'playing';
    } else if (input.throttleUp) {
      flight.throttle = Math.max(flight.throttle, 0.6);
      state = 'playing';
      hud.message('Lepas landas!', 1200);
    }
    flight.propAngle += dt * (2 + flight.throttle * 20);
    hud.update(flight, level, ringsRemaining(level.rings), flight.elapsed);
  } else if (state === 'menu' && flight) {
    flight.propAngle += dt * 2;
  }

  if (!FAST) render();
  requestAnimationFrame(frame);
}

// ---- boot ----
if (PARAM_PLANE && PLANES[PARAM_PLANE]) selectedPlane = PLANES[PARAM_PLANE];
if (PARAM_LEVEL !== null && PARAM_LEVEL !== undefined && PARAM_LEVEL !== '') {
  selectedLevelId = clamp(Number(PARAM_LEVEL) || 0, 0, LEVELS.length - 1);
}
loadLevel(selectedLevelId);
buildMenu();
if (SHOT) {
  applyShot();
} else {
  // Menu backdrop: plane parked on the runway.
  flight = newFlight(selectedPlane, { x: level.runway.x, y: level.runway.y + 1.6, z: level.runway.z, yaw: -Math.PI / 2, speed: 0, throttle: 0 });
  if (AUTOPILOT) {
    // Headless verification: skip the menu, start flying at once.
    document.getElementById('menu').style.display = 'none';
    startFlight();
  }
}
// Debug handle for headless verification (state, position, rings, fuel, damage).
window.__debug = () => ({
  state, plane: selectedPlane.id, level: selectedLevelId,
  x: flight ? Math.round(flight.x) : null, y: flight ? Math.round(flight.y) : null,
  z: flight ? Math.round(flight.z) : null, speed: flight ? Math.round(flight.speed) : null,
  fuel: flight ? Math.round(flight.fuel) : null, damage: flight ? Math.round(flight.damage) : null,
  rings: flight ? flight.ringsPassed : null, score: flight ? flight.score : null,
  time: Math.round(timeSec), autopilotDone,
});

render();
requestAnimationFrame(frame);
