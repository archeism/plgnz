/**
 * Test helpers: materialize a host's fixture tree into a temp
 * OPEN_PLUGIN_HOME so tests never touch the real home (AGENTS.md).
 *
 * Fixture JSON/TOML files carry the literal placeholder `__HOME__` wherever a
 * real store records an absolute path; materialization rewrites it to the
 * temp dir after copying.
 */
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

export const repoRoot = join(import.meta.dir, '..');
export const fixturesRoot = join(repoRoot, 'test', 'fixtures');

function rewritePlaceholders(dir: string, home: string): void {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st: { isFile(): boolean; isDirectory(): boolean };
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      rewritePlaceholders(p, home);
    } else if (entry.endsWith('.json') || entry.endsWith('.toml')) {
      const text = readFileSync(p, 'utf8');
      if (text.includes('__HOME__')) writeFileSync(p, text.replaceAll('__HOME__', home));
    }
  }
}

export interface HostEnv {
  /** The temp home the fixture was materialized into. */
  home: string;
  /** Env vars that point all host roots at that home. */
  env: Record<string, string>;
}

/** Copy `test/fixtures/<host>/` into an existing temp home and patch __HOME__. */
export function materializeInto(home: string, host: string): void {
  cpSync(join(fixturesRoot, host), home, { recursive: true });
  rewritePlaceholders(home, home);
}

/**
 * Copy `test/fixtures/<host>/` into a fresh temp home and patch __HOME__.
 * Host fixture trees do not overlap, so several can share one home via
 * `materializeInto` when a test spans hosts (as pin's default-target rule does).
 */
export function materialize(host: string): HostEnv {
  const home = mkdtempSync(join(tmpdir(), `open-plugin-${host}-`));
  materializeInto(home, host);
  const env: Record<string, string> = { OPEN_PLUGIN_HOME: home };
  if (host === 'omp') {
    env['OPEN_PLUGIN_OMP_ROOT'] = join(home, '.omp');
  }
  return { home, env };
}

/** Apply `env` and return the undo. */
function applyEnv(env: Record<string, string>): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    process.env[key] = env[key];
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** Run `fn` with the fixture's env applied; always restores the previous env. */
export function withHostEnv(host: string, fn: (home: string) => void): void {
  const { home, env } = materialize(host);
  const restore = applyEnv(env);
  try {
    fn(home);
  } finally {
    restore();
  }
}

/** `withHostEnv` for async verbs (`pin`, `update`). */
export async function withHostEnvAsync(host: string, fn: (home: string) => Promise<void>): Promise<void> {
  const { home, env } = materialize(host);
  const restore = applyEnv(env);
  try {
    await fn(home);
  } finally {
    restore();
  }
}

/** Run `fn` with `dir` prepended to PATH (and nothing else changed). */
export async function withPathPrefix<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
  const saved = process.env['PATH'];
  process.env['PATH'] = `${dir}:${saved ?? ''}`;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env['PATH'];
    else process.env['PATH'] = saved;
  }
}

/** Write `files` (repo-relative path → content) under `dir`. */
export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function git(repo: string, args: string[]): string {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * Create a git repo at `dir` (the stand-in for a marketplace checkout `add`
 * records and `update` re-resolves) and return its HEAD sha.
 */
export function initGitRepo(dir: string, files: Record<string, string>): string {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  writeFiles(dir, files);
  return commitAll(dir, 'fixture');
}

/** Commit every change in `dir`; returns the new HEAD sha. */
export function commitAll(dir: string, message: string): string {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-q', '--allow-empty', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

/** Write the open-plugin install ledger into a materialized temp home. */
export function writeLedger(home: string, installs: unknown[]): void {
  writeFileSync(join(home, 'state.json'), JSON.stringify({ version: 1, installs }, null, 2));
}

/** An executable shim named `name` in `<home>/fake-bin`; returns its directory. */
export function fakeBin(home: string, name: string): string {
  const dir = join(home, 'fake-bin');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, '#!/bin/sh\nexit 0\n');
  // Executable, so `isExecutableFile` accepts it exactly as it would a real tool.
  chmodSync(file, 0o755);
  return dir;
}
