#!/usr/bin/env node
// scripts/smoke-http.mjs — HTTP smoke tests for CI
// Starts the API, hits a few URLs, kills the process, exits 1 on failure.

import { spawn } from 'child_process';
import http from 'http';

const BASE = 'http://127.0.0.1:5198';
const TIMEOUT_MS = 60_000;

let apiProc = null;

function killApi() {
  if (!apiProc) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(apiProc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      apiProc.kill('SIGKILL');
    }
  } catch { /* already dead */ }
  apiProc = null;
}

// Clean up on SIGINT / SIGTERM so CI never leaves a zombie dotnet host
function handleSignal(sig) {
  console.error(`\nCaught ${sig} — killing API process…`);
  killApi();
  process.exit(1);
}
process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout: 10_000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function postJSON(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 30_000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

async function waitForHealth() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const r = await get('/health');
      if (r.status === 200) {
        const j = JSON.parse(r.body);
        if (j.status === 'healthy') return true;
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERT FAILED: ${msg}`);
}

const failures = [];

async function run() {
  // Start API
  apiProc = spawn('dotnet', [
    'run', '--project', 'WorkoutPlanner.Api', '--launch-profile', 'http', '--urls', BASE,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development' },
  });

  // Collect startup logs for debugging
  let startupLog = '';
  apiProc.stdout?.on('data', (d) => (startupLog += d));
  apiProc.stderr?.on('data', (d) => (startupLog += d));

  console.log('Waiting for API to start...');
  const ready = await waitForHealth();
  if (!ready) {
    console.error('API did not become healthy within 60s.');
    console.error('Startup log:\n' + startupLog);
    killApi();
    process.exit(1);
  }
  console.log('API is up.');

  try {
    // 1. GET /health
    {
      const r = await get('/health');
      assert(r.status === 200, `GET /health → ${r.status}`);
      const j = JSON.parse(r.body);
      assert(j.status === 'healthy', `GET /health body.status = ${j.status}`);
      console.log('  ✓ GET /health');
    }

    // 2. GET /
    {
      const r = await get('/');
      assert(r.status === 200, `GET / → ${r.status}`);
      assert(r.body.includes('Start a program'), `GET / missing "Start a program"`);
      console.log('  ✓ GET /');
    }

    // 3. GET /workout.html
    {
      const r = await get('/workout.html');
      assert(r.status === 200, `GET /workout.html → ${r.status}`);
      assert(r.body.includes('No plan yet'), `GET /workout.html missing "No plan yet"`);
      console.log('  ✓ GET /workout.html');
    }

    // 4. GET /history.html
    {
      const r = await get('/history.html');
      assert(r.status === 200, `GET /history.html → ${r.status}`);
      assert(r.body.includes('Track your training'), `GET /history.html missing "Track your training"`);
      console.log('  ✓ GET /history.html');
    }

    // 5. GET /account.html
    {
      const r = await get('/account.html');
      assert(r.status === 200, `GET /account.html → ${r.status}`);
      assert(r.body.includes('Save your training'), `GET /account.html missing "Save your training"`);
      console.log('  ✓ GET /account.html');
    }

    // 6. GET /sw.js
    {
      const r = await get('/sw.js');
      assert(r.status === 200, `GET /sw.js → ${r.status}`);
      assert(r.body.includes('plan4strength-v8'), `GET /sw.js missing "plan4strength-v8"`);
      assert(!r.body.includes('workoutRunner.js'), `GET /sw.js still lists workoutRunner.js in PRECACHE`);
      console.log('  ✓ GET /sw.js');
    }

    // 7. GET /manifest.json — 200, lists 192 PNG icon
    {
      const r = await get('/manifest.json');
      assert(r.status === 200, `GET /manifest.json → ${r.status}`);
      assert(r.body.includes('icon-192.png'), `GET /manifest.json missing icon-192.png`);
      assert(r.body.includes('/pwa.html'), `GET /manifest.json start_url not /pwa.html`);
      console.log('  ✓ GET /manifest.json');
    }

    // 8. GET /icon-192.png — 200 image/png
    {
      const r = await get('/icon-192.png');
      assert(r.status === 200, `GET /icon-192.png → ${r.status}`);
      console.log('  ✓ GET /icon-192.png');
    }

    // 9. GET /icon-512.png — 200 image/png
    {
      const r = await get('/icon-512.png');
      assert(r.status === 200, `GET /icon-512.png → ${r.status}`);
      console.log('  ✓ GET /icon-512.png');
    }

    // 10. GET /pwa.html — 200
    {
      const r = await get('/pwa.html');
      assert(r.status === 200, `GET /pwa.html → ${r.status}`);
      assert(r.body.includes('workoutPlan'), `GET /pwa.html missing localStorage check`);
      console.log('  ✓ GET /pwa.html');
    }

    // 11. POST /api/plan
    {
      const r = await postJSON('/api/plan', {
        weeks: 1,
        daysPerWeek: 3,
        sessionMinutes: 20,
        equipment: ['bodyweight', 'dumbbells'],
        goal: 'strength',
        level: 'beginner',
        workoutDays: [0, 2, 4],
      });
      assert(r.status === 200, `POST /api/plan → ${r.status}`);
      const j = JSON.parse(r.body);
      assert(Array.isArray(j.plan), `POST /api/plan response has no plan array`);
      assert(j.plan.length > 0, `POST /api/plan plan array is empty`);
      console.log('  ✓ POST /api/plan');
    }

    // 12. GET /api/equipment
    {
      const r = await get('/api/equipment');
      assert(r.status === 200, `GET /api/equipment → ${r.status}`);
      console.log('  ✓ GET /api/equipment');
    }

    console.log('\nAll smoke tests passed.');
  } catch (err) {
    failures.push(err.message);
    console.error('\n' + err.message);
  } finally {
    killApi();
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

run();
