/**
 * paths.ts is where filesystem layout is decided (AGENTS.md: every path the
 * tool touches resolves through it; tests redirect the world via
 * OPEN_PLUGIN_HOME). These tests pin the two-branch rule `stateFile()` and
 * `cacheRoot()` share: under `OPEN_PLUGIN_HOME` the entry sits directly in
 * the stand-in home; in real use it sits under `~/.open-plugin/…` — never a
 * generic file or directory dropped straight into `$HOME`.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { cacheRoot, stateFile } from '../src/paths';

/** Apply `env` (undefined deletes) and always restore the previous values. */
function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('paths · OPEN_PLUGIN_HOME stand-in', () => {
  test('ledger and clone cache sit directly in the override home', () => {
    const home = '/tmp/open-plugin-standin-home';
    withEnv({ OPEN_PLUGIN_HOME: home }, () => {
      expect(stateFile()).toBe(join(home, 'state.json'));
      expect(cacheRoot()).toBe(join(home, 'cache'));
    });
  });
});

describe('paths · real use (no override)', () => {
  test('the clone cache lives under ~/.open-plugin/cache, not $HOME/cache', () => {
    const home = '/tmp/open-plugin-real-home';
    withEnv({ OPEN_PLUGIN_HOME: undefined, HOME: home }, () => {
      expect(cacheRoot()).toBe(join(home, '.open-plugin', 'cache'));
      // the regression this guards: a generic `cache/` straight into $HOME
      expect(cacheRoot() === join(home, 'cache')).toBe(false);
    });
  });

  test('the ledger follows the same rule as the cache', () => {
    const home = '/tmp/open-plugin-real-home';
    withEnv({ OPEN_PLUGIN_HOME: undefined, HOME: home }, () => {
      expect(stateFile()).toBe(join(home, '.open-plugin', 'state.json'));
    });
  });
});
