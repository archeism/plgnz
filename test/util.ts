/**
 * Test helpers: materialize a host's fixture tree into a temp
 * OPEN_PLUGIN_HOME so tests never touch the real home (AGENTS.md).
 *
 * Fixture JSON/TOML files carry the literal placeholder `__HOME__` wherever a
 * real store records an absolute path; materialization rewrites it to the
 * temp dir after copying.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** Copy `test/fixtures/<host>/` into a fresh temp home and patch __HOME__. */
export function materialize(host: string): HostEnv {
  const home = mkdtempSync(join(tmpdir(), `open-plugin-${host}-`));
  cpSync(join(fixturesRoot, host), home, { recursive: true });
  rewritePlaceholders(home, home);
  const env: Record<string, string> = { OPEN_PLUGIN_HOME: home };
  if (host === 'omp') {
    env['OPEN_PLUGIN_OMP_ROOT'] = join(home, '.omp');
  }
  return { home, env };
}

/** Run `fn` with the fixture's env applied; always restores the previous env. */
export function withHostEnv(host: string, fn: (home: string) => void): void {
  const { home, env } = materialize(host);
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    process.env[key] = env[key];
  }
  try {
    fn(home);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
