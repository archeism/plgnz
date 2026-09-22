import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { withHostEnvAsync, initGitRepo, writeLedger } from './util';
import { main } from '../src/cli';
import { claudeCode } from '../src/hosts/claude-code';
import { codex } from '../src/hosts/codex';
import { cursor } from '../src/hosts/cursor';
import { kimi } from '../src/hosts/kimi';
import { omp } from '../src/hosts/omp';
import { readState } from '../src/state';

const pluginsMap = {
  'plugin.json': JSON.stringify({ name: "demo-plugin", mcpServers: { demo: { command: "demo" } } }, null, 2),
  'mcp.json': JSON.stringify({ mcpServers: { demo: { command: "demo" } } }, null, 2)
};

describe('remove', () => {
  test('--target removes only that host record', async () => {
    await withHostEnvAsync('codex', async (home) => {
      writeLedger(home, [
        { host: 'codex', id: 'demo-plugin@local', source: '/codex-source', sourceSha: 'one' },
        { host: 'cursor', id: 'demo-plugin@local', source: '/cursor-source', sourceSha: 'two' },
      ]);
      expect(await main(['remove', 'demo-plugin@local', '--target', 'codex'])).toBe(0);
      expect(readState().find((record) => record.host === 'codex')).toBeUndefined();
      expect(readState().find((record) => record.host === 'cursor')?.source).toBe('/cursor-source');
    });
  });

  test('refuses an unrecorded native install', async () => {
    await withHostEnvAsync('codex', async () => {
      expect(codex.listInstalled().some((plugin) => plugin.id === 'demo-plugin@demo-market')).toBe(true);
      expect(await main(['remove', 'demo-plugin@demo-market', '--target', 'codex'])).toBe(1);
      expect(codex.listInstalled().some((plugin) => plugin.id === 'demo-plugin@demo-market')).toBe(true);
    });
  });

  test('claude-code > removes plugin from registry', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      await main(['add', sourceDir, '--target', 'claude-code']);
      
      const code = await main(['remove', 'demo-plugin@local']);
      expect(code).toBe(0);

      const installed = claudeCode.listInstalled();
      expect(installed.find(p => p.id === 'demo-plugin@local')).toBeUndefined();
      
      const state = readState();
      expect(state.find(r => r.id === 'demo-plugin@local')).toBeUndefined();
    });
  });

  test('codex > removes plugin from config', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      await main(['add', sourceDir, '--target', 'codex']);
      
      const code = await main(['remove', 'demo-plugin@local']);
      expect(code).toBe(0);

      const installed = codex.listInstalled();
      expect(installed.find(p => p.id === 'demo-plugin@local')).toBeUndefined();
    });
  });

  test('kimi > removes plugin from registry', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      await main(['add', sourceDir, '--target', 'kimi']);
      
      const code = await main(['remove', 'demo-plugin']);
      expect(code).toBe(0);

      const installed = kimi.listInstalled();
      expect(installed.find(p => p.id === 'demo-plugin')).toBeUndefined();
    });
  });

  test('cursor > removes directory', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, {
        ...pluginsMap,
        'plugin.json': JSON.stringify({ name: 'demo-plugin', version: '1.0.0', mcpServers: { demo: { command: 'demo' } } }, null, 2),
      });
      // The Cursor fixture already has a same-name local plugin. The lifecycle
      // requires an explicit adoption before this test may remove it as owned.
      expect(await main(['add', sourceDir, '--target', 'cursor', '--adopt-existing'])).toBe(0);
      
      const code = await main(['remove', 'demo-plugin']);
      expect(code).toBe(0);

      const installed = cursor.listInstalled();
      expect(installed.find(p => p.id === 'demo-plugin')).toBeUndefined();
    });
  });

  test('omp > removes from registry and lockfile', async () => {
    await withHostEnvAsync('omp', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      await main(['add', sourceDir, '--target', 'omp']);
      
      const code = await main(['remove', 'demo-plugin@local']);
      expect(code).toBe(0);

      const installed = omp.listInstalled();
      expect(installed.find(p => p.id === 'demo-plugin@local')).toBeUndefined();
    });
  });
});
