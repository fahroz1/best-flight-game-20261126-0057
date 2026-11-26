// weather.js — rain lines, stars, sun/moon discs, wind gusts, sky lighting per level.

import { emptyMesh, addBox, finalizeMesh, uploadMesh, drawMesh, mat4Translate, mat4Scale, mat4Multiply } from './gl.js';

const RAIN_DROPS = 260;

// Rain: a line segment cloud that follows the plane and falls. Drawn with gl.LINES
// through the same shader program (positions + colors bound, normals dummy).
export function createRain(ctx, seed) {
  const { gl, att } = ctx;
  const drops = [];
  let s = seed * 1234567 + 7;
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) ^ (s >>> 13)) >>> 0; return s / 4294967296; };
  for (let i = 0; i < RAIN_DROPS; i++) {
    drops.push({ x: (rnd() - 0.5) * 220, y: rnd() * 90, z: (rnd() - 0.5) * 220, speed: 55 + rnd() * 35 });
  }
  const posBuf = gl.createBuffer();
  const colBuf = gl.createBuffer();
  const norBuf = gl.createBuffer();
  const idxBuf = gl.createBuffer();
  const idx = new Uint16Array(RAIN_DROPS * 2);
  for (let i = 0; i < RAIN_DROPS; i++) { idx[i * 2] = i * 2; idx[i * 2 + 1] = i * 2 + 1; }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  const col = new Float32Array(RAIN_DROPS * 2 * 3);
  for (let i = 0; i < RAIN_DROPS * 2; i++) { col[i * 3] = 0.65; col[i * 3 + 1] = 0.75; col[i * 3 + 2] = 0.95; }
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
  const nor = new Float32Array(RAIN_DROPS * 2 * 3);
  for (let i = 0; i < RAIN_DROPS * 2; i++) nor[i * 3 + 1] = 1;
  gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
  gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);

  const pos = new Float32Array(RAIN_DROPS * 2 * 3);
  return {
    update(dt, cx, cy, cz) {
      for (let i = 0; i < RAIN_DROPS; i++) {
        const d = drops[i];
        d.y -= d.speed * dt;
        if (d.y < cy - 40) d.y = cy + 45;
        // Keep the cloud centered on the plane.
        if (Math.abs(d.x - cx) > 110) d.x = cx + (d.x > cx ? -110 : 110) + (Math.random() - 0.5) * 20;
        if (Math.abs(d.z - cz) > 110) d.z = cz + (d.z > cz ? -110 : 110) + (Math.random() - 0.5) * 20;
        pos[i * 6] = d.x; pos[i * 6 + 1] = d.y; pos[i * 6 + 2] = d.z;
        pos[i * 6 + 3] = d.x; pos[i * 6 + 4] = d.y + 2.2; pos[i * 6 + 5] = d.z;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    },
    draw(ctx, model) {
      const { gl, uni } = ctx;
      gl.uniformMatrix4fv(uni.model, false, model);
      gl.uniform1f(uni.emissive, 0.25);
      const bind = (buf, loc) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      };
      bind(posBuf, att.pos); bind(norBuf, att.normal); bind(colBuf, att.color);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.drawElements(gl.LINES, RAIN_DROPS * 2, gl.UNSIGNED_SHORT, 0);
    },
  };
}

// Stars: small bright boxes scattered on a dome, drawn emissive at night.
export function createStars(ctx, seed) {
  const m = emptyMesh();
  let s = seed * 99991 + 3;
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) ^ (s >>> 13)) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2, e = 0.15 + rnd() * 1.2, r = 800;
    const x = Math.cos(a) * Math.cos(e) * r, y = Math.sin(e) * r + 20, z = Math.sin(a) * Math.cos(e) * r;
    const b = 0.8 + rnd() * 0.2;
    addBox(m, x, y, z, 1.6, 1.6, 1.6, [b, b, b * 1.05]);
  }
  return uploadMesh(ctx.gl, ctx.att, finalizeMesh(m));
}

// Sun / moon disc: a thin bright box placed far in the sky in the sun direction.
export function createSkyDisc(ctx, color, size) {
  const m = emptyMesh();
  addBox(m, 0, 0, 0, size, size, 0.5, color);
  return uploadMesh(ctx.gl, ctx.att, finalizeMesh(m));
}

export function discModel(level, dist) {
  const d = level.sunDir;
  const l = Math.hypot(d[0], d[1], d[2]);
  const x = (d[0] / l) * dist, y = Math.max((d[1] / l) * dist, 60), z = (d[2] / l) * dist;
  return mat4Multiply(mat4Translate(x, y, z), mat4Scale(1, 1, 1));
}

// Wind gust (yaw drift rad/s) for the storm level; calm elsewhere.
export function windGust(level, t) {
  if (!level.wind) return 0;
  return level.wind * (0.6 + 0.4 * Math.sin(t * 0.7) + 0.3 * Math.sin(t * 1.9 + 2.0));
}
