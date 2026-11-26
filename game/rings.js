// rings.js — glowing target rings: course layout, pass detection, scoring.

import { ringMesh, uploadMesh } from './gl.js';

export const RING_RADIUS = 15;
export const RING_POINTS = 100;

export function buildRingMeshes(ctx) {
  return {
    next: uploadMesh(ctx.gl, ctx.att, ringMesh(RING_RADIUS, 1.1, 28, 8, [1.0, 0.8, 0.15])),
    done: uploadMesh(ctx.gl, ctx.att, ringMesh(RING_RADIUS, 1.1, 28, 8, [0.25, 0.85, 0.35])),
    later: uploadMesh(ctx.gl, ctx.att, ringMesh(RING_RADIUS, 1.1, 28, 8, [0.75, 0.85, 1.0])),
  };
}

// A ring faces the incoming flight direction: its plane is perpendicular to `dir`.
export function ringYaw(dir) { return Math.atan2(-dir[0], -dir[2]); }

// Check whether the plane passed through ring i. Returns points earned (0 if not passed).
// Pass = plane within the ring disc (distance to center < RING_RADIUS - 2) while crossing
// the ring plane, or simply flying very close to the center (forgiving for arcade play).
export function checkRingPass(flight, ring, prevPos) {
  if (ring.passed) return 0;
  const dx = flight.x - ring.x, dy = flight.y - ring.y, dz = flight.z - ring.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < RING_RADIUS + 2) {
    ring.passed = true;
    return RING_POINTS;
  }
  // Plane-crossing test: sign of dot with ring normal flipped between frames.
  const nx = -Math.sin(ring.yaw), nz = -Math.cos(ring.yaw);
  const before = (prevPos.x - ring.x) * nx + (prevPos.z - ring.z) * nz;
  const after = dx * nx + dz * nz;
  if (before > 0 && after <= 0 && dist < RING_RADIUS + 8) {
    ring.passed = true;
    return RING_POINTS;
  }
  return 0;
}

export function ringsRemaining(rings) {
  return rings.filter((r) => !r.passed).length;
}
export function nextRing(rings) {
  return rings.find((r) => !r.passed) || null;
}
