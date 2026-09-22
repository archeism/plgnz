/**
 * `update` fixture tests.
 *
 * The recorded source in `state.json` is the whole input: each test builds a
 * real git repo (the stand-in for a marketplace checkout), records it, then
 * moves the repo on and checks that `update` re-materializes the host's copy,
 * refreshes the ledger and re-applies recorded pins.
 *
 * Tests never touch the real home (AGENTS.md): every path comes from a
 * materialized fixture home via `OPEN_PLUGIN_HOME`.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { runUpdate } from '../src/update';
import { main } from '../src/cli';
import { readState } from '../src/state';
import { kimiWriter } from '../src/hosts/kimi-writer';
import type { HostWriter } from '../src/host';
import type { InstallRecord } from '../src/state';
import { CompatibilityError } from '../src/compatibility';
import { commitAll, fakeBin, initGitRepo, materialize, materializeInto, repoRoot, withHostEnvAsync, withPathPrefix, writeFiles, writeLedger } from './util';
import { kimiNativeEnv, resetKimiNativeStore, withKimiNative } from './kimi-fixture';

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

function mcpJson(servers: Record<string, { type: string; command: string }>): string {
  return JSON.stringify({ $schema: SCHEMA, mcpServers: servers }, null, 2);
}

/** A source repo holding one plugin (`<plugin>/plugin.json` + `mcp.json`). */
function sourceRepo(dir: string, plugin: string, servers: Record<string, { type: string; command: string }>): string {
  return initGitRepo(dir, {
    [`${plugin}/plugin.json`]: JSON.stringify({ $schema: SCHEMA, name: plugin, version: '1.0.0' }, null, 2),
    [`${plugin}/mcp.json`]: mcpJson(servers),
  });
}

function kimiManaged(home: string, plugin = 'demo-plugin'): string {
  return join(home, '.kimi-code', 'plugins', 'managed', plugin);
}

describe('update · re-add from the recorded source', () => {
  test('rejects a name outside the frozen target inventory before reading the ledger', async () => {
    await withHostEnvAsync('kimi', async () => {
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['update', '--target', 'not-a-target', '--json'])).toBe(2);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ target: string; status: string; diagnostic?: string }>;
      expect(outcomes[0]?.target).toBe('not-a-target');
      expect(outcomes[0]?.status).toBe('failed');
      expect(outcomes[0]?.diagnostic).toContain("unknown target 'not-a-target'");
      expect(readState()).toEqual([]);
    });
  });

  test('reports a declared target with no active adapter as unverified without reading or writing the ledger', async () => {
    await withHostEnvAsync('kimi', async () => {
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['update', '--target', 'hermes', '--json'])).toBe(1);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ target: string; status: string; action: string; dryRun: boolean; diagnostic?: string }>;
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.target).toBe('hermes');
      expect(outcomes[0]?.status).toBe('unverified');
      expect(outcomes[0]?.action).toBe('update');
      expect(outcomes[0]?.dryRun).toBe(false);
      expect(outcomes[0]?.diagnostic).toContain('unverified for update');
      expect(readState()).toEqual([]);
    });
  });

  test('selected writers leave records for other hosts untouched', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { tool: { type: 'stdio', command: '/bin/echo' } });
      writeLedger(home, [
        { host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha },
        { host: 'cursor', id: 'demo-plugin', source: repo, sourceSha: sha },
      ]);
      const result = await runUpdate(undefined, { writers: [kimiWriter] });
      expect(result.exitCode).toBe(0);
      expect(result.findings.some((finding) => finding.host === 'cursor')).toBe(false);
      expect(readState().find((record) => record.host === 'cursor')?.sourceSha).toBe(sha);
      });
    });
  });

  test('finalizes each successful target and leaves a durable pending intent for a later failure', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = initGitRepo(repo, {
        'good/plugin.json': JSON.stringify({ name: 'good' }),
        'bad/plugin.json': JSON.stringify({ name: 'bad' }),
      });
      writeLedger(home, [
        { host: 'good-host', id: 'good', source: repo, sourceSha: sha },
        { host: 'bad-host', id: 'bad', source: repo, sourceSha: sha },
      ]);
      const base = {
        gui: false,
        detect: () => true,
        stores: () => [],
        listInstalled: () => [],
        mcpEntries: () => [],
        remove: async () => {},
        pin: async () => ({ changes: [], refusals: [] }),
      };
      const good = { ...base, id: 'good-host', listInstalled: () => [{ id: 'good', name: 'good', enabled: true, path: join(repo, 'good') }], add: async () => {} } as HostWriter;
      const bad = { ...base, id: 'bad-host', add: async () => { throw new Error('later target failed'); } } as HostWriter;

      const result = await runUpdate(undefined, { writers: [good, bad] });
      expect(result.exitCode).toBe(1);
      const state = readState();
      expect(state.find((record) => record.host === 'good-host')?.pending).toBeUndefined();
      expect(state.find((record) => record.host === 'bad-host')?.pending).toBe('install');
    });
  });

  test('preserves a writer compatibility refusal as a nonzero typed update finding', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { tool: { type: 'stdio', command: '/bin/echo' } });
      const writer: HostWriter = {
        id: 'compat-host', gui: false, detect: () => true, stores: () => [], listInstalled: () => [], mcpEntries: () => [],
        add: async () => { throw new CompatibilityError('compat-host', 'update', 'unverified', 'test evidence'); },
        remove: async () => {}, pin: async () => ({ changes: [], refusals: [] }),
      };
      const result = await runUpdate(undefined, {
        state: [{ host: 'compat-host', id: 'demo-plugin', source: repo, sourceSha: sha }],
        writers: [writer],
        writeState: () => {},
      });
      expect(result.exitCode).toBe(1);
      expect(result.findings[0]?.status).toBe('unverified');
      expect(result.findings[0]?.message).toContain('refused');
    });
  });

  test('does not flush a failed finalization as complete while finalizing a later record', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = initGitRepo(repo, {
        'first/plugin.json': JSON.stringify({ name: 'first' }),
        'second/plugin.json': JSON.stringify({ name: 'second' }),
      });
      const initial: InstallRecord[] = [
        { host: 'first-host', id: 'first', source: repo, sourceSha: sha },
        { host: 'second-host', id: 'second', source: repo, sourceSha: sha },
      ];
      const copy = (records: InstallRecord[]): InstallRecord[] => JSON.parse(JSON.stringify(records)) as InstallRecord[];
      let durable = copy(initial);
      let writes = 0;
      const writer = (id: string): HostWriter => ({
        id, gui: false, detect: () => true, stores: () => [], listInstalled: () => [{ id: id.replace('-host', ''), name: id.replace('-host', ''), enabled: true, path: join(repo, id.replace('-host', '')) }], mcpEntries: () => [],
        add: async () => {}, remove: async () => {}, pin: async () => ({ changes: [], refusals: [] }),
      });
      const result = await runUpdate(undefined, {
        state: copy(initial),
        writers: [writer('first-host'), writer('second-host')],
        writeState: (records) => {
          writes += 1;
          if (writes === 2) throw new Error('forced first finalization write failure');
          durable = copy(records);
        },
      });
      expect(result.exitCode).toBe(1);
      expect(durable.find((record) => record.host === 'first-host')?.pending).toBe('install');
      expect(durable.find((record) => record.host === 'second-host')?.pending).toBeUndefined();
    });
  });

  test('actual CLI emits clean JSON for update dry-run', () => {
    const { home, env } = materialize('kimi');
    resetKimiNativeStore(home);
    const repo = join(home, 'src-repo');
    const sha = sourceRepo(repo, 'demo-plugin', { tool: { type: 'stdio', command: '/bin/echo' } });
    writeLedger(home, [{ host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha }]);
    const result = spawnSync('bun', [join(repoRoot, 'bin', 'plgnz.mjs'), 'update', '--target', 'kimi', '--dry-run', '--json'], {
      cwd: repoRoot,
      env: { ...process.env, ...env, ...kimiNativeEnv(home) },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(Array.isArray(JSON.parse(result.stdout))).toBe(true);
  });

  test('actual CLI reports corrupt state as a failed JSON update outcome', () => {
    const { home, env } = materialize('kimi');
    writeFileSync(join(home, 'state.json'), '{not json');
    const result = spawnSync('bun', [join(repoRoot, 'bin', 'plgnz.mjs'), 'update', '--target', 'kimi', '--json'], {
      cwd: repoRoot, env: { ...process.env, ...env }, encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    const outcomes = JSON.parse(result.stdout) as Array<{ status: string; action?: string; diagnostic?: string }>;
    expect(outcomes[0]?.status).toBe('failed');
    expect(outcomes[0]?.action).toBe('update');
    expect(outcomes[0]?.diagnostic).toContain('Invalid state.json');
  });

  test('kimi: re-materializes the copy and advances the recorded sha', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
      const repo = join(home, 'src-repo');
      const sha1 = sourceRepo(repo, 'demo-plugin', { 'from-repo-v1': { type: 'stdio', command: '/bin/echo' } });
      const managed = kimiManaged(home);
      expect(await main(['add', repo, '--target', 'kimi'])).toBe(0);
      writeFileSync(join(managed, 'stale.txt'), 'left by the previous install\n');
      writeLedger(home, [{ host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha1 }]);

      writeFiles(repo, { 'demo-plugin/mcp.json': mcpJson({ 'from-repo-v2': { type: 'stdio', command: '/bin/echo' } }) });
      const sha2 = commitAll(repo, 'v2');

      const result = await runUpdate('demo-plugin');

      expect(result.exitCode).toBe(0);
      expect(result.findings.some((f) => f.mark === '✓' && f.message.includes('updated'))).toBe(true);
      expect(readFileSync(join(managed, 'mcp.json'), 'utf8')).toContain('from-repo-v2');
      // a copy-based store is replaced, not merged into
      expect(existsSync(join(managed, 'stale.txt'))).toBe(false);
      const record = readState(join(home, 'state.json')).find((r) => r.host === 'kimi');
      expect(record?.sourceSha).toBe(sha2);
      expect(record?.sourceDir?.endsWith('/src-repo/demo-plugin')).toBe(true);
      expect(record?.installedFingerprint === undefined).toBe(false);
      });
    });
  });

  test('without a name every recorded install is updated', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
      materializeInto(home, 'cursor');
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'from-repo': { type: 'stdio', command: '/bin/echo' } });
      // The materialized Cursor fixture is deliberately unowned. Adopt it
      // through the public route before asking `update` to re-materialize it.
      expect(await main(['add', repo, '--target', 'cursor', '--adopt-existing'])).toBe(0);
      writeLedger(home, [
        { host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha },
        { host: 'cursor', id: 'demo-plugin', source: repo, sourceSha: sha },
      ]);

      const result = await runUpdate();

      expect(result.exitCode).toBe(0);
      expect(result.findings.filter((f) => f.mark === '✓').map((f) => f.host).sort()).toEqual(['cursor', 'kimi']);
      expect(readFileSync(join(home, '.cursor', 'plugins', 'local', 'demo-plugin', 'mcp.json'), 'utf8')).toContain('from-repo');
      });
    });
  });

  test('--dry-run reports the update and writes nothing', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'from-repo': { type: 'stdio', command: '/bin/echo' } });
      const managed = kimiManaged(home);
      expect(await main(['add', repo, '--target', 'kimi'])).toBe(0);
      const before = readFileSync(join(managed, 'mcp.json'), 'utf8');
      writeLedger(home, [{ host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha }]);

      const result = await runUpdate('demo-plugin', { dryRun: true });

      expect(result.exitCode).toBe(0);
      expect(result.findings.some((f) => f.message.startsWith('[dry-run] '))).toBe(true);
      expect(readFileSync(join(managed, 'mcp.json'), 'utf8')).toBe(before);
      expect(readState(join(home, 'state.json'))[0]?.sourceSha).toBe(sha);
      });
    });
  });
});

describe('update · pins', () => {
  test('re-applies a recorded pin to the fresh copy', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'local-tool': { type: 'stdio', command: 'fixture-mcp' } });
      expect(await main(['add', repo, '--target', 'kimi'])).toBe(0);
      writeLedger(home, [
        { host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha, pins: ['local-tool'] },
      ]);

      const bin = fakeBin(home, 'fixture-mcp');
      const result = await withPathPrefix(bin, () => runUpdate('demo-plugin'));

      expect(result.exitCode).toBe(0);
      expect(result.findings.some((f) => f.message.includes("re-pinned 'local-tool'"))).toBe(true);
      const copies = ['mcp.json', '.mcp.json'].map((f) => join(kimiManaged(home), f)).filter((f) => existsSync(f));
      expect(copies.length).toBeGreaterThan(0);
      const pinned = JSON.parse(readFileSync(join(kimiManaged(home), 'mcp.json'), 'utf8')) as {
        mcpServers: Record<string, { command: string }>;
      };
      expect(pinned.mcpServers['local-tool']?.command).toBe(join(bin, 'fixture-mcp'));
      });
    });
  });

  test('a pin that no longer resolves is refused, not guessed', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'local-tool': { type: 'stdio', command: 'fixture-mcp' } });
      expect(await main(['add', repo, '--target', 'kimi'])).toBe(0);
      writeLedger(home, [
        { host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha, pins: ['local-tool'] },
      ]);

      const result = await runUpdate('demo-plugin');

      expect(result.exitCode).toBe(1);
      expect(result.findings.some((f) => f.mark === '✗' && f.message.includes('re-apply the pin'))).toBe(true);
      const copy = JSON.parse(readFileSync(join(kimiManaged(home), 'mcp.json'), 'utf8')) as {
        mcpServers: Record<string, { command: string }>;
      };
      expect(copy.mcpServers['local-tool']?.command).toBe('fixture-mcp');
      });
    });
  });
});

describe('update · refuses what it did not install', () => {
  test('a name with no ledger record is reported, never modified', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const registry = join(home, '.kimi-code', 'plugins', 'installed.json');
      const before = readFileSync(registry, 'utf8');
      writeLedger(home, []);

      const result = await runUpdate('demo-plugin');

      expect(result.exitCode).toBe(1);
      expect(result.findings[0]?.message).toContain('refusing to modify');
      expect(readFileSync(registry, 'utf8')).toBe(before);
    });
  });

  test('an empty ledger is reported as nothing to do, not as an error', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const result = await runUpdate();
      expect(result.exitCode).toBe(0);
      expect(result.findings[0]?.message).toContain('nothing to update');
    });
  });

  test('a host that is not on this machine is skipped', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'from-repo': { type: 'stdio', command: '/bin/echo' } });
      writeLedger(home, [{ host: 'omp', id: 'demo-plugin', source: repo, sourceSha: sha }]);

      const result = await runUpdate('demo-plugin');

      expect(result.exitCode).toBe(0);
      expect(result.findings[0]?.mark).toBe('!');
      expect(result.findings[0]?.message).toContain('not present on this machine');
    });
  });

  test('a source that no longer provides the plugin is reported', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'other-plugin', { tool: { type: 'stdio', command: '/bin/echo' } });
      writeLedger(home, [{ host: 'kimi', id: 'demo-plugin', source: repo, sourceSha: sha }]);

      const result = await runUpdate('demo-plugin');

      expect(result.exitCode).toBe(1);
      expect(result.findings[0]?.message).toContain("no longer provides 'demo-plugin'");
    });
  });
});
