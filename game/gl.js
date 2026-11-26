// gl.js — WebGL context, shader compile, buffers, matrix math (raw WebGL, no libraries).
// All matrices are column-major Float32Array(16), as WebGL expects.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

// ---- matrices ----
export function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}
export function mat4LookAt(eye, center, up) {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let zl = Math.hypot(zx, zy, zz); const z = [zx / zl, zy / zl, zz / zl];
  let xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0];
  let xl = Math.hypot(xx, xy, xz); const x = [xx / xl, xy / xl, xz / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}
export function mat4Translate(x, y, z) {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}
export function mat4Scale(x, y, z) {
  return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}
export function mat4RotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
export function mat4RotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
export function mat4RotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
// Euler: yaw around Y, then pitch around X, then roll around Z (aircraft convention).
export function mat4FromYawPitchRoll(yaw, pitch, roll) {
  return mat4Multiply(mat4RotateY(yaw), mat4Multiply(mat4RotateX(pitch), mat4RotateZ(roll)));
}

// ---- WebGL setup ----
const VERT_SRC = `
attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor;
uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uProj * uView * w;
}`;
const FRAG_SRC = `
precision mediump float;
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbient;
uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uCamPos;
uniform float uEmissive;
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 col = vColor * (uAmbient + uSunColor * diff);
  col = mix(col, vColor * 1.6, uEmissive);
  float d = distance(vWorld, uCamPos);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL unavailable');
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VERT_SRC); gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) throw new Error('vertex shader: ' + gl.getShaderInfoLog(vs));
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, FRAG_SRC); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error('fragment shader: ' + gl.getShaderInfoLog(fs));
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('program link: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const loc = (n) => gl.getUniformLocation(prog, n);
  const uni = {
    proj: loc('uProj'), view: loc('uView'), model: loc('uModel'),
    sunDir: loc('uSunDir'), sunColor: loc('uSunColor'), ambient: loc('uAmbient'),
    fogColor: loc('uFogColor'), fogDensity: loc('uFogDensity'), camPos: loc('uCamPos'),
    emissive: loc('uEmissive'),
  };
  const att = {
    pos: gl.getAttribLocation(prog, 'aPos'),
    normal: gl.getAttribLocation(prog, 'aNormal'),
    color: gl.getAttribLocation(prog, 'aColor'),
  };
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  return { gl, prog, uni, att };
}

// A mesh: { pos: Float32Array, nor: Float32Array, col: Float32Array, idx: Uint16Array|Uint32Array }
export function uploadMesh(gl, att, mesh) {
  const b = {};
  const mk = (data, size, loc) => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf, size, loc };
  };
  b.pos = mk(mesh.pos, 3, att.pos);
  b.nor = mk(mesh.nor, 3, att.normal);
  b.col = mk(mesh.col, 3, att.color);
  b.idx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
  b.count = mesh.idx.length;
  b.is32 = mesh.idx instanceof Uint32Array;
  return b;
}

export function drawMesh(ctx, meshBuf, model, emissive) {
  const { gl, uni, att } = ctx;
  gl.uniformMatrix4fv(uni.model, false, model);
  gl.uniform1f(uni.emissive, emissive || 0);
  for (const k of ['pos', 'nor', 'col']) {
    const a = meshBuf[k];
    gl.bindBuffer(gl.ARRAY_BUFFER, a.buf);
    gl.enableVertexAttribArray(a.loc);
    gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, 0, 0);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshBuf.idx);
  gl.drawElements(gl.TRIANGLES, meshBuf.count, meshBuf.is32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
}

// ---- mesh builders (positions/normals/colors, indexed triangles) ----
export function emptyMesh() { return { pos: [], nor: [], col: [], idx: [] }; }

function pushVert(m, p, n, c) {
  m.pos.push(p[0], p[1], p[2]);
  m.nor.push(n[0], n[1], n[2]);
  m.col.push(c[0], c[1], c[2]);
  return m.pos.length / 3 - 1;
}
function tri(m, a, b, c) { m.idx.push(a, b, c); }
function quad(m, a, b, c, d) { tri(m, a, b, c); tri(m, a, c, d); }

// Axis-aligned box centered at cx,cy,cz with half extents hx,hy,hz and one color.
export function addBox(m, cx, cy, cz, hx, hy, hz, color) {
  const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
  const faces = [
    { n: [1, 0, 0], v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { n: [-1, 0, 0], v: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]] },
    { n: [0, 1, 0], v: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]] },
    { n: [0, -1, 0], v: [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]] },
    { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
  ];
  for (const f of faces) {
    const ids = f.v.map((p) => pushVert(m, p, f.n, color));
    quad(m, ids[0], ids[1], ids[2], ids[3]);
  }
}

// Cone (apex up) with nSides sides, base radius r, height h, base center at y0.
export function addCone(m, cx, y0, cz, r, h, nSides, color) {
  const apex = pushVert(m, [cx, y0 + h, cz], [0, 1, 0], color);
  const base = [];
  for (let i = 0; i < nSides; i++) {
    const a = (i / nSides) * Math.PI * 2;
    const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
    const n = [Math.cos(a) * 0.8, 0.45, Math.sin(a) * 0.8];
    base.push(pushVert(m, [px, y0, pz], n, color));
  }
  for (let i = 0; i < nSides; i++) {
    const j = (i + 1) % nSides;
    tri(m, apex, base[i], base[j]);
  }
  const bc = pushVert(m, [cx, y0, cz], [0, -1, 0], color);
  for (let i = 0; i < nSides; i++) {
    const j = (i + 1) % nSides;
    tri(m, bc, base[j], base[i]);
  }
}

// Cylinder along Y, radius r, from y0 to y1, nSides sides.
export function addCylinder(m, cx, y0, y1, cz, r, nSides, color) {
  const top = [], bot = [];
  for (let i = 0; i < nSides; i++) {
    const a = (i / nSides) * Math.PI * 2;
    const n = [Math.cos(a), 0, Math.sin(a)];
    top.push(pushVert(m, [cx + Math.cos(a) * r, y1, cz + Math.sin(a) * r], n, color));
    bot.push(pushVert(m, [cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r], n, color));
  }
  for (let i = 0; i < nSides; i++) {
    const j = (i + 1) % nSides;
    quad(m, bot[i], bot[j], top[j], top[i]);
  }
  const tc = pushVert(m, [cx, y1, cz], [0, 1, 0], color);
  const bc = pushVert(m, [cx, y0, cz], [0, -1, 0], color);
  for (let i = 0; i < nSides; i++) {
    const j = (i + 1) % nSides;
    tri(m, tc, top[i], top[j]);
    tri(m, bc, bot[j], bot[i]);
  }
}

// Flat quad in XZ plane (top face only, normal up), for ground markings.
export function addFlatQuad(m, x0, z0, x1, z1, y, color) {
  const a = pushVert(m, [x0, y, z0], [0, 1, 0], color);
  const b = pushVert(m, [x1, y, z0], [0, 1, 0], color);
  const c = pushVert(m, [x1, y, z1], [0, 1, 0], color);
  const d = pushVert(m, [x0, y, z1], [0, 1, 0], color);
  quad(m, a, b, c, d);
}

// Torus ring lying in the XY plane (facing +Z), tube radius tr, ring radius R.
export function ringMesh(R, tr, radialSegs, tubeSegs, color) {
  const m = emptyMesh();
  for (let i = 0; i <= radialSegs; i++) {
    const u = (i / radialSegs) * Math.PI * 2;
    const cx = Math.cos(u) * R, cy = Math.sin(u) * R;
    for (let j = 0; j <= tubeSegs; j++) {
      const v = (j / tubeSegs) * Math.PI * 2;
      const nx = Math.cos(v) * Math.cos(u), ny = Math.cos(v) * Math.sin(u), nz = Math.sin(v);
      pushVert(m, [cx + nx * tr, cy + ny * tr, nz * tr], [nx, ny, nz], color);
    }
  }
  const row = tubeSegs + 1;
  for (let i = 0; i < radialSegs; i++) {
    for (let j = 0; j < tubeSegs; j++) {
      const a = i * row + j, b = (i + 1) * row + j;
      quad(m, a, b, b + 1, a + 1);
    }
  }
  return finalizeMesh(m);
}

export function finalizeMesh(m) {
  return {
    pos: new Float32Array(m.pos),
    nor: new Float32Array(m.nor),
    col: new Float32Array(m.col),
    idx: m.pos.length / 3 > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx),
  };
}
