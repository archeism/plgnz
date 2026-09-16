import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { withHostEnvAsync, initGitRepo } from './util';
import { main } from '../src/cli';
import { readState } from '../src/state';
import { claudeCode } from '../src/hosts/claude-code';
import { codex } from '../src/hosts/codex';
import { kimi } from '../src/hosts/kimi';
import { cursor } from '../src/hosts/cursor';
import { omp } from '../src/hosts/omp';

const pluginsMap = {
  'plugin.json': JSON.stringify({ name: "new-plugin", mcpServers: { demo: { command: "demo" } } }, null, 2),
  'mcp.json': JSON.stringify({ mcpServers: { demo: { command: "demo" } } }, null, 2)
};

describe('add', () => {
  test('claude-code > writes registry and copies files', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      
      const code = await main(['add', sourceDir, '--target', 'claude-code']);
      expect(code).toBe(0);

      const installed = claudeCode.listInstalled();
      expect(installed.length).toBeGreaterThan(0);
      const plugin = installed.find(p => p.name === 'new-plugin');
      expect(plugin !== undefined).toBe(true);
      expect(plugin?.path && existsSync(plugin.path)).toBe(true);
      expect(plugin?.path && existsSync(join(plugin.path, '.claude-plugin', 'plugin.json'))).toBe(true);

      const state = readState();
      expect(state.find(r => r.id === 'new-plugin@local') !== undefined).toBe(true);
    });
  });

  test('codex > writes config and copies files', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      
      const code = await main(['add', sourceDir, '--target', 'codex']);
      expect(code).toBe(0);

      const installed = codex.listInstalled();
      expect(installed.find(p => p.name === 'new-plugin') !== undefined).toBe(true);

      const state = readState();
      expect(state.find(r => r.id === 'new-plugin@local' && r.host === 'codex') !== undefined).toBe(true);
    });
  });

  test('kimi > writes registry and copies files', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      
      const code = await main(['add', sourceDir, '--target', 'kimi']);
      expect(code).toBe(0);

      const installed = kimi.listInstalled();
      expect(installed.find(p => p.name === 'new-plugin') !== undefined).toBe(true);

      const state = readState();
      expect(state.find(r => r.id === 'new-plugin' && r.host === 'kimi') !== undefined).toBe(true);
    });
  });

  test('cursor > writes directory directly', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      
      const code = await main(['add', sourceDir, '--target', 'cursor']);
      expect(code).toBe(0);

      const installed = cursor.listInstalled();
      expect(installed.find(p => p.name === 'new-plugin') !== undefined).toBe(true);

      const state = readState();
      expect(state.find(r => r.id === 'new-plugin' && r.host === 'cursor') !== undefined).toBe(true);
    });
  });

  test('omp > writes registry, lockfile and copies files', async () => {
    await withHostEnvAsync('omp', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      
      const code = await main(['add', sourceDir, '--target', 'omp']);
      expect(code).toBe(0);

      const installed = omp.listInstalled();
      expect(installed.find(p => p.name === 'new-plugin') !== undefined).toBe(true);
      
      const state = readState();
      expect(state.find(r => r.id === 'new-plugin@local' && r.host === 'omp') !== undefined).toBe(true);
    });
  });

  test('idempotency > running twice works and produces same result', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      
      const code1 = await main(['add', sourceDir, '--target', 'claude-code']);
      expect(code1).toBe(0);
      const state1 = readState();
      
      const code2 = await main(['add', sourceDir, '--target', 'claude-code']);
      expect(code2).toBe(0);
      const state2 = readState();
      
      expect(state1.length).toBe(state2.length);
    });
  });
});
