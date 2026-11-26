// plane.js — aircraft built from primitives + arcade flight physics + 3 plane definitions.
// Aircraft convention: forward = -Z in local space, up = +Y. Yaw 0 faces north (-Z).

import { emptyMesh, addBox, addCone, addCylinder, finalizeMesh, clamp, lerp } from './gl.js';

export const PLANES = {
  elang: {
    id: 'elang', name: 'Elang', desc: 'Cepat, lincah, bahan bakar boros',
    maxSpeed: 95, accel: 0.9, turnRate: 1.15, pitchRate: 1.05, stallSpeed: 30,
    fuelBurn: 1.6, climb: 1.15,
    body: [0.85, 0.25, 0.15], wing: [0.95, 0.45, 0.10], accent: [0.95, 0.75, 0.15],
    wingSpan: 13.5, fuselageLen: 9,
  },
  garuda: {
    id: 'garuda', name: 'Garuda', desc: 'Seimbang di segala cuaca',
    maxSpeed: 78, accel: 0.7, turnRate: 0.9, pitchRate: 0.85, stallSpeed: 24,
    fuelBurn: 1.0, climb: 1.0,
    body: [0.75, 0.15, 0.12], wing: [0.95, 0.85, 0.75], accent: [0.15, 0.35, 0.65],
    wingSpan: 12, fuselageLen: 8.5,
  },
  merpati: {
    id: 'merpati', name: 'Merpati Pos', desc: 'Lambat, stabil, bahan bakar irit',
    maxSpeed: 58, accel: 0.5, turnRate: 0.65, pitchRate: 0.6, stallSpeed: 17,
    fuelBurn: 0.55, climb: 0.8,
    body: [0.85, 0.85, 0.88], wing: [0.55, 0.65, 0.70], accent: [0.85, 0.30, 0.30],
    wingSpan: 15, fuselageLen: 8,
  },
};

// Build a low-poly propeller plane from boxes/cones/cylinders. Returns { body, prop }
// where prop is a separate mesh that spins around the nose (local -Z axis).
export function buildPlaneMesh(def) {
  const L = def.fuselageLen, W = def.wingSpan;
  const m = emptyMesh();
  const B = def.body, A = def.accent, WG = def.wing;
  const DARK = [0.12, 0.12, 0.14], GLASS = [0.35, 0.65, 0.85];
  // Fuselage: main box + tapered nose + tail taper.
  addBox(m, 0, 0, 0, 0.85, 0.85, L * 0.32, B);
  addBox(m, 0, 0, -L * 0.32 - 0.9, 0.62, 0.62, 0.9, A);
  addBox(m, 0, 0.15, L * 0.32 + 0.8, 0.55, 0.55, 1.4, B); // tail taper
  // Canopy.
  addBox(m, 0, 0.85, -0.6, 0.55, 0.45, 1.1, GLASS);
  // Main wing (flat, wide) and tailplane.
  addBox(m, 0, -0.1, 0.4, W / 2, 0.18, 1.5, WG);
  addBox(m, 0, 0.1, L * 0.32 + 1.2, W * 0.22, 0.14, 0.9, WG);
  // Vertical fin.
  addBox(m, 0, 0.9, L * 0.32 + 1.1, 0.14, 1.0, 1.1, A);
  // Wingtip lights.
  addBox(m, -W / 2 + 0.3, -0.1, 0.4, 0.25, 0.25, 0.5, [1.0, 0.2, 0.2]);
  addBox(m, W / 2 - 0.3, -0.1, 0.4, 0.25, 0.25, 0.5, [0.2, 1.0, 0.3]);
  // Landing gear stubs.
  addBox(m, -0.7, -1.0, -0.8, 0.18, 0.5, 0.18, DARK);
  addBox(m, 0.7, -1.0, -0.8, 0.18, 0.5, 0.18, DARK);
  addBox(m, 0, -1.0, L * 0.32 + 0.6, 0.18, 0.5, 0.18, DARK);

  const p = emptyMesh();
  // Propeller: hub + two blades in the XY plane at the nose; spins around local Z.
  addBox(p, 0, 0, 0, 0.35, 0.35, 0.3, A);
  addBox(p, 0, 2.0, 0, 0.28, 1.9, 0.12, DARK);
  addBox(p, 0, -2.0, 0, 0.28, 1.9, 0.12, DARK);
  return { body: finalizeMesh(m), prop: finalizeMesh(p) };
}

export function newFlight(def, spawn) {
  return {
    def,
    x: spawn.x, y: spawn.y, z: spawn.z,
    yaw: spawn.yaw, pitch: 0, roll: 0,
    speed: spawn.speed || 0, throttle: spawn.throttle || 0,
    fuel: 100, damage: 0, propAngle: 0,
    vx: 0, vy: 0, vz: 0, // last-frame velocity, for landing hardness
    score: 0, ringsPassed: 0, startTime: 0, elapsed: 0,
    windGust: 0,
  };
}

// One arcade physics step. input: { pitch: -1..1 (up positive), roll: -1..1, throttleDelta }.
// wind: extra yaw drift in radians/sec. Returns 'flying' | 'crashed' | 'landed' (landing decided by caller).
export function stepFlight(f, input, dt, terrain, runway, wind) {
  const d = f.def;
  f.throttle = clamp(f.throttle + (input.throttleDelta || 0) * dt, 0, 1);
  if (f.fuel <= 0) f.throttle = 0;

  // Pitch / roll follow the stick with smoothing.
  const targetPitch = input.pitch * 0.55 * d.pitchRate;
  const targetRoll = input.roll * 1.25 * d.turnRate;
  f.pitch = lerp(f.pitch, targetPitch, clamp(dt * 2.2, 0, 1));
  f.roll = lerp(f.roll, targetRoll, clamp(dt * 2.6, 0, 1));

  // Speed chases throttle; drag grows with speed.
  const targetSpeed = f.throttle * d.maxSpeed;
  f.speed += (targetSpeed - f.speed) * clamp(dt * d.accel, 0, 1);
  f.speed -= f.speed * 0.02 * dt;

  // Stall: below stall speed the nose drops and the plane sinks.
  const stalled = f.speed < d.stallSpeed;
  if (stalled) {
    f.pitch = lerp(f.pitch, -0.35, clamp(dt * 1.5, 0, 1));
    f.speed = Math.max(f.speed - 6 * dt, 8);
  }

  // Yaw follows bank; wind adds drift. Full bank turns ~1 rad/s so a ring can be lined up.
  const turn = -f.roll * 0.85 * (0.45 + 0.55 * (f.speed / d.maxSpeed));
  f.yaw += (turn + (wind || 0)) * dt;
  f.yaw = ((f.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  // Velocity from heading + pitch.
  const climb = Math.sin(f.pitch) * d.climb;
  const cp = Math.cos(f.pitch);
  const dx = -Math.sin(f.yaw) * cp;
  const dz = -Math.cos(f.yaw) * cp;
  const dy = climb + (stalled ? -0.35 : 0);
  f.vx = dx * f.speed; f.vy = dy * f.speed; f.vz = dz * f.speed;
  f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;

  // World bounds: soft push back toward the map.
  if (Math.abs(f.x) > 880) f.x = clamp(f.x, -880, 880);
  if (Math.abs(f.z) > 880) f.z = clamp(f.z, -880, 880);
  if (f.y > 420) f.y = 420;

  // Fuel burn: base + throttle, scaled by plane.
  f.fuel -= (0.35 + f.throttle * 1.5) * d.fuelBurn * dt * 0.12;
  if (f.fuel < 0) f.fuel = 0;

  f.propAngle += (2 + f.throttle * 40) * dt;
  f.elapsed += dt;

  // Terrain collision.
  const ground = terrain.heightAt(f.x, f.z);
  if (f.y <= ground + 1.6) {
    // Rollout stop: slow and gentle on the ground means the sortie is over,
    // wherever the wheels stopped.
    if (f.speed < 12 && Math.abs(f.vy) < 6) {
      f.y = ground + 1.6;
      f.speed = 0;
      return 'landed';
    }
    // Landing? On the runway strip, slow and descending gently: wheels down.
    // A level touchdown is clean; a banked or steep one still lands but scrapes.
    const onRunway = Math.abs(f.x - runway.x) < runway.length / 2 &&
      Math.abs(f.z - runway.z) < runway.width / 2 + 6;
    if (onRunway && f.y <= runway.y + 2.2 && f.speed < 55 && f.vy > -12) {
      const gentle = Math.abs(f.pitch) < 0.35 && Math.abs(f.roll) < 0.5;
      if (!gentle) f.damage += Math.abs(f.roll) * 25 + Math.abs(f.pitch) * 20;
      f.y = runway.y + 1.6;
      return 'landed';
    }
    // Hard ground contact: damage scales with impact speed. A short cooldown
    // keeps one rough touchdown from counting as several hits; a runway
    // touchdown is more forgiving than rough terrain.
    const impact = Math.abs(f.vy) + f.speed * 0.25;
    if (f.elapsed - (f.lastBounceT || -99) > 1.5) {
      f.damage += impact * (onRunway ? 1.4 : 2.2);
      f.lastBounceT = f.elapsed;
    }
    f.y = ground + 1.6;
    f.speed *= 0.35;
    if (f.damage >= 100) { f.damage = 100; return 'crashed'; }
    return 'bounced';
  }
  return 'flying';
}

// Forward unit vector of the aircraft (local -Z rotated by yaw/pitch).
export function forwardVector(f) {
  const cp = Math.cos(f.pitch);
  return [-Math.sin(f.yaw) * cp, Math.sin(f.pitch), -Math.cos(f.yaw) * cp];
}
