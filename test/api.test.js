'use strict';

// Regression tests for BROKEN WA API.
//
// These exist because the package shipped broken twice in ways a normal test
// suite would not have caught:
//
//   1. Five require() paths pointed at the wrong directory, so the package threw
//      "Cannot find module './utils/logger'" the moment anything imported it.
//   2. The routers were mounted with prefixes that duplicated their own internal
//      paths, so every documented endpoint 404'd.
//   3. `cors` was required but missing from package.json, so it crashed on a
//      clean install.
//   4. `npm start` pointed at index.js (the SDK) instead of src/app.js (the
//      server), so the server never started.
//
// Each of those is now a test below.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));


/** Strip line and block comments so doc examples aren't mistaken for real code. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (avoid http://)
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'test') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// ── 1. every relative require resolves ────────────────────────────────────

test('every relative require() resolves on disk', () => {
  const broken = [];
  for (const file of walk(ROOT)) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const re = /require\(\s*['"](\.[^'"]*)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      const base = path.resolve(path.dirname(file), spec);
      const ok = [base, base + '.js', base + '.json', path.join(base, 'index.js')]
        .some((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } });
      if (!ok) {
        const line = src.slice(0, m.index).split('\n').length;
        broken.push(`${path.relative(ROOT, file)}:${line} -> require('${spec}')`);
      }
    }
  }
  assert.deepStrictEqual(broken, [], 'unresolvable requires:\n  ' + broken.join('\n  '));
});

// ── 2. every external require is declared ─────────────────────────────────

test('every external require() is declared in package.json', () => {
  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]);
  const builtins = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => 'node:' + m),
    'node:test',
  ]);
  const missing = new Set();

  for (const file of walk(ROOT)) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const re = /require\(\s*['"]([^.'"][^'"]*)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (builtins.has(spec)) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!declared.has(name)) missing.add(name);
    }
  }
  assert.deepStrictEqual([...missing].sort(), [], 'undeclared dependencies will crash on install');
});

// ── 3. the package loads ──────────────────────────────────────────────────

test('the package can be required without throwing', () => {
  const api = require(ROOT);
  assert.ok(api, 'should export something');
  assert.strictEqual(typeof api.createClient, 'function', 'should export createClient');
  assert.strictEqual(typeof api.BaileysClient, 'function', 'should export BaileysClient');
});

// ── 4. the entrypoints are correct ────────────────────────────────────────

test('npm start runs the server, not the SDK', () => {
  // index.js is the SDK and exits immediately; src/app.js is the server.
  assert.match(pkg.scripts.start, /src\/app\.js/, 'start must point at src/app.js');
  assert.ok(fs.existsSync(path.join(ROOT, 'src', 'app.js')), 'src/app.js must exist');
});

test('the package entry point is the SDK', () => {
  assert.strictEqual(pkg.main, 'index.js');
});

// ── 5. routes are mounted without duplicating their own prefix ────────────

test('routers are not mounted under a prefix they already carry', () => {
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

  // The sessions router declares '/sessions' internally, so mounting it at
  // '/api/sessions' would produce /api/sessions/sessions.
  assert.ok(!/app\.use\(\s*['"]\/api\/sessions['"]\s*,\s*require\(['"]\.\/api\/sessions/.test(server),
    'sessions router must be mounted at /api, not /api/sessions');

  // The messages router declares '/:sessionId/...' internally.
  assert.ok(!/app\.use\(\s*['"]\/api\/sessions\/:sessionId\/messages['"]/.test(server),
    'messages router must be mounted at /api/sessions');
});

// ── 6. the server actually boots and serves ───────────────────────────────

test('the server boots and answers /health', async () => {
  const PORT = 3199;
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'app.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  const stop = () => { try { child.kill('SIGKILL'); } catch {} };

  try {
    let up = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/health`);
        if (res.ok) { up = true; break; }
      } catch { /* not up yet */ }
    }
    assert.ok(up, 'server did not start listening');

    // every documented route must resolve (404 = missing)
    const routes = [
      ['GET', '/'],
      ['GET', '/health'],
      ['GET', '/api/docs'],
      ['POST', '/login'],
      ['GET', '/api/sessions'],
      ['GET', '/api/owner/init'],
      ['POST', '/api/sessions/abc/send/text'],
      ['GET', '/api/sessions/abc/messages'],
      ['POST', '/api/groups/create'],
      ['GET', '/api/groups/list'],
      ['GET', '/api/scrape/npm/search?q=x'],
    ];
    const missing = [];
    for (const [method, p] of routes) {
      const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
      if (res.status === 404) missing.push(`${method} ${p}`);
    }
    assert.deepStrictEqual(missing, [], 'these documented routes 404:\n  ' + missing.join('\n  '));
  } finally {
    stop();
  }
});
