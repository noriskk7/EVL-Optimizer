'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.setPath('userData', path.join(app.getPath('appData'), 'Evl Optimizer', 'gpubench'));

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const seconds = Math.min(Math.max(arg('seconds', 6), 2), 60);

function bench(secs) {
  const W = 1920;
  const H = 1080;
  const ITER = 128;
  const FLOPS = 20;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance', antialias: false, depth: false });
  if (!gl) return { ok: false, reason: 'webgl' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, W, H);
  const vs = '#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';
  const fs = `#version 300 es
precision highp float;
uniform float u_t;
out vec4 o;
void main() {
  vec2 c = gl_FragCoord.xy / vec2(${W}.0, ${H}.0) * 3.0 - vec2(2.0, 1.5) + vec2(u_t * 1e-6);
  vec2 z = vec2(0.0);
  float acc = 0.0;
  for (int i = 0; i < ${ITER}; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    z = z / (1.0 + dot(z, z) * 0.25);
    acc += sin(z.x) * cos(z.y);
  }
  o = vec4(acc, z, 1.0);
}`;
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { ok: false, reason: 'shader', renderer };
  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());
  const ut = gl.getUniformLocation(prog, 'u_t');
  const px = new Uint8Array(4);
  const draw = (n, seed) => {
    for (let d = 0; d < n; d++) {
      gl.uniform1f(ut, seed + d);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  draw(1, 0);
  let n = 1;
  for (let k = 0; k < 10; k++) {
    const t0 = performance.now();
    draw(n, k);
    if (performance.now() - t0 > 35 || n >= 1024) break;
    n *= 2;
  }
  const work = W * H * ITER * FLOPS;
  const per = [];
  let total = 0;
  const start = performance.now();
  const end = start + secs * 1000;
  let secStart = start;
  let secDraws = 0;
  while (performance.now() < end) {
    draw(n, Math.random() * 1000);
    total += n;
    secDraws += n;
    const now = performance.now();
    if (now - secStart >= 1000) {
      const g = (secDraws * work) / ((now - secStart) / 1000) / 1e9;
      per.push(g);
      console.log(`EVLGPUTICK:${g}`);
      secStart = now;
      secDraws = 0;
    }
  }
  const elapsed = (performance.now() - start) / 1000;
  return {
    ok: true,
    renderer,
    software: /swiftshader|llvmpipe|basic render|microsoft basic|warp|software/i.test(renderer),
    gflops: (total * work) / elapsed / 1e9,
    per,
    draws: n,
    check: px[3],
  };
}

app.whenReady().then(async () => {
  const kill = setTimeout(() => { process.stdout.write('EVLGPU:{"ok":false,"reason":"timeout"}\n'); app.exit(2); }, (seconds + 30) * 1000);
  try {
    const win = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true } });
    win.webContents.on('console-message', (e) => {
      const msg = String((e && e.message) || '');
      if (msg.startsWith('EVLGPUTICK:')) process.stdout.write(`${msg}\n`);
    });
    await win.loadURL('about:blank');
    const result = await win.webContents.executeJavaScript(`(${bench.toString()})(${seconds})`);
    process.stdout.write(`EVLGPU:${JSON.stringify(result)}\n`);
  } catch (err) {
    process.stdout.write(`EVLGPU:${JSON.stringify({ ok: false, reason: 'error', detail: String((err && err.message) || err).slice(0, 200) })}\n`);
  }
  clearTimeout(kill);
  app.exit(0);
});
