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
import { join } from 'node:path';
import { runUpdate } from '../src/update';
import { readState } from '../src/state';
import { commitAll, fakeBin, initGitRepo, materializeInto, withHostEnvAsync, withPathPrefix, writeFiles, writeLedger } from './util';

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
  test('kimi: re-materializes the copy and advances the recorded sha', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha1 = sourceRepo(repo, 'demo-plugin', { 'from-repo-v1': { type: 'stdio', command: '/bin/echo' } });
      const managed = kimiManaged(home);
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
      expect(readState(join(home, 'state.json')).find((r) => r.host === 'kimi')?.sourceSha).toBe(sha2);
    });
  });

  test('without a name every recorded install is updated', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      materializeInto(home, 'cursor');
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'from-repo': { type: 'stdio', command: '/bin/echo' } });
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

  test('--dry-run reports the update and writes nothing', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'from-repo': { type: 'stdio', command: '/bin/echo' } });
      const managed = kimiManaged(home);
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

describe('update · pins', () => {
  test('re-applies a recorded pin to the fresh copy', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'local-tool': { type: 'stdio', command: 'fixture-mcp' } });
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

  test('a pin that no longer resolves is refused, not guessed', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const repo = join(home, 'src-repo');
      const sha = sourceRepo(repo, 'demo-plugin', { 'local-tool': { type: 'stdio', command: 'fixture-mcp' } });
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
