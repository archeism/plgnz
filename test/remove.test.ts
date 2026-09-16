import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { withHostEnvAsync, initGitRepo } from './util';
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
      initGitRepo(sourceDir, pluginsMap);
      await main(['add', sourceDir, '--target', 'cursor']);
      
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
