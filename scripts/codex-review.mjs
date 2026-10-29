#!/usr/bin/env node
// Runs one read-only Codex review round with a hard wall-clock cap, an idle cap
// and bounded retries, so a hung or disconnected Codex fails loud instead of
// stalling a build. `start` hands the round to a detached supervisor and returns
// at once; `wait` blocks in the foreground for at most --for seconds, so callers
// loop it inside the Bash tool's 10-minute limit and never leave a job running.
//
// Usage:
//   codex-review.mjs start <out.md> --prompt-file <file> [--cd <dir>] [--cap 1800] [--idle 600] [--retries 2]
//   codex-review.mjs start <out.md> --resume <thread-id> --message <text> [same options]
//   codex-review.mjs wait <out.md> [--for 540]
//
// Files beside <out.md>: <out.md> (Codex's last message, written only on success),
// <out.md>.status.json, <out.md>.jsonl (event stream, every attempt), <out.md>.stderr.
// wait exits 0 done (prints the thread id and the VERDICT line), 1 failed, 2 still running.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, renameSync, rmSync, statSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [cmd, outArg, ...rest] = process.argv.slice(2);
const usage = () => {
  console.error('usage: codex-review.mjs start <out.md> (--prompt-file <f> | --resume <thread> --message <text>) [--cd <dir>] [--cap s] [--idle s] [--retries n]\n       codex-review.mjs wait <out.md> [--for s]');
  process.exit(64);
};
if (!cmd || !outArg) usage();
const out = resolve(outArg);
const statusFile = `${out}.status.json`;

const opts = {};
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i].startsWith('--') || rest[i + 1] === undefined) usage();
  opts[rest[i].slice(2)] = rest[i + 1];
}

const readStatus = () => (existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : null);
const writeStatus = (s) => {
  writeFileSync(`${statusFile}.tmp`, JSON.stringify({ ...s, updated: new Date().toISOString() }, null, 2));
  renameSync(`${statusFile}.tmp`, statusFile);
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

if (cmd === 'start') {
  if (!opts['prompt-file'] === !opts.resume) usage();
  if (opts.resume && !opts.message) usage();
  if (opts['prompt-file'] && !existsSync(opts['prompt-file'])) usage();
  const prev = readStatus();
  if (prev?.state === 'running' && alive(prev.pid)) {
    console.log(`RUNNING already (pid ${prev.pid}); wait on it: codex-review.mjs wait ${outArg}`);
    process.exit(0);
  }
  for (const f of [out, statusFile, `${out}.jsonl`, `${out}.stderr`]) rmSync(f, { force: true });
  // The supervisor runs in --cd, so hand it an absolute prompt path.
  const fwd = Object.entries({ ...opts, ...(opts['prompt-file'] && { 'prompt-file': resolve(opts['prompt-file']) }) }).flatMap(([k, v]) => [`--${k}`, v]);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'supervise', out, ...fwd], {
    detached: true,
    stdio: 'ignore',
    cwd: opts.cd ? resolve(opts.cd) : process.cwd(),
  });
  writeStatus({ state: 'running', pid: child.pid, attempt: 0, started: new Date().toISOString() });
  child.unref();
  console.log(`STARTED pid ${child.pid}; next: codex-review.mjs wait ${outArg}`);
  process.exit(0);
}

if (cmd === 'wait') {
  const until = Date.now() + Number(opts.for ?? 540) * 1000;
  for (;;) {
    const s = readStatus();
    if (!s) {
      console.log(`FAILED no review started for ${outArg}`);
      process.exit(1);
    }
    if (s.state === 'done') {
      const text = readFileSync(out, 'utf8').trim();
      const verdict = text.split('\n').reverse().find((l) => /VERDICT:/.test(l)) ?? 'no VERDICT line';
      console.log(`DONE thread ${s.thread} attempts ${s.attempt}\n${verdict.trim()}\nout ${outArg}`);
      process.exit(0);
    }
    if (s.state === 'failed') {
      console.log(`FAILED ${s.reason} after ${s.attempt} attempt(s); logs ${outArg}.jsonl ${outArg}.stderr`);
      process.exit(1);
    }
    if (!alive(s.pid)) {
      writeStatus({ ...s, state: 'failed', reason: 'supervisor exited without a result' });
      continue;
    }
    if (Date.now() >= until) {
      const since = s.lastEvent ? Math.round((Date.now() - Date.parse(s.lastEvent)) / 1000) : '-';
      console.log(`RUNNING attempt ${s.attempt}, last Codex event ${since}s ago; run wait again`);
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

if (cmd !== 'supervise') usage();

// Supervisor: runs the attempts and owns every Codex process it starts.
const cap = Number(opts.cap ?? 1800) * 1000;
const idle = Number(opts.idle ?? 600) * 1000;
const retries = Number(opts.retries ?? 2);
const bin = process.env.RATCHET_CODEX_BIN ?? 'codex';
const tmp = `${out}.tmp`;
const args = opts.resume
  ? ['exec', 'resume', opts.resume, '-c', 'sandbox_mode="read-only"', '--json', '-o', tmp, opts.message]
  : ['exec', '-s', 'read-only', '--json', '-o', tmp, readFileSync(opts['prompt-file'], 'utf8')];

const attemptOnce = (n) =>
  new Promise((done) => {
    appendFileSync(`${out}.jsonl`, `${JSON.stringify({ type: 'ratchet.attempt', n, at: new Date().toISOString() })}\n`);
    rmSync(tmp, { force: true });
    const stderr = openSync(`${out}.stderr`, 'a');
    // stdin is /dev/null: codex exec otherwise waits for stdin EOF forever.
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', stderr], detached: true });
    let thread = opts.resume ?? null;
    let reason = null;
    let lastEvent = Date.now();
    let buf = '';
    const kill = (why) => {
      if (reason) return;
      reason = why;
      try {
        process.kill(-p.pid, 'SIGTERM');
      } catch {}
      setTimeout(() => {
        try {
          process.kill(-p.pid, 'SIGKILL');
        } catch {}
      }, 5000).unref();
    };
    const wall = setTimeout(() => kill(`wall-clock cap ${cap / 1000}s`), cap);
    const tick = setInterval(() => {
      if (Date.now() - lastEvent > idle) kill(`no Codex event for ${idle / 1000}s`);
    }, 5000);
    p.stdout.on('data', (chunk) => {
      appendFileSync(`${out}.jsonl`, chunk);
      lastEvent = Date.now();
      writeStatus({ ...readStatus(), lastEvent: new Date(lastEvent).toISOString() });
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const m = line.match(/"type":"thread\.started","thread_id":"([^"]+)"/);
        if (m) thread = m[1];
      }
    });
    p.on('error', (e) => kill(`could not start ${bin}: ${e.message}`));
    p.on('close', (code) => {
      clearTimeout(wall);
      clearInterval(tick);
      const wrote = existsSync(tmp) && statSync(tmp).size > 0;
      if (!reason && code === 0 && wrote) return done({ ok: true, thread });
      const said = readFileSync(`${out}.stderr`, 'utf8').trim().split('\n').filter((l) => !/additional input from stdin/.test(l)).pop();
      const why = reason ?? (code !== 0 ? `codex exited ${code}` : 'codex wrote no final message');
      done({ ok: false, thread, reason: said ? `${why} (stderr: ${said.slice(0, 200)})` : why });
    });
  });

let last;
for (let n = 1; n <= retries + 1; n++) {
  writeStatus({ ...readStatus(), state: 'running', pid: process.pid, attempt: n });
  last = await attemptOnce(n);
  if (last.ok) {
    renameSync(tmp, out);
    writeStatus({ ...readStatus(), state: 'done', attempt: n, thread: last.thread });
    process.exit(0);
  }
}
writeStatus({ ...readStatus(), state: 'failed', reason: last.reason, thread: last.thread });
process.exit(1);
