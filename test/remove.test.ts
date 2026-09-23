import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { withHostEnvAsync, initGitRepo, writeFiles, writeLedger } from './util';
import { main } from '../src/cli';
import { claudeCode } from '../src/hosts/claude-code';
import { codex } from '../src/hosts/codex';
import { cursor } from '../src/hosts/cursor';
import { kimi } from '../src/hosts/kimi';
import { omp } from '../src/hosts/omp';
import { pi } from '../src/hosts/pi';
import { piWriter } from '../src/hosts/pi-writer';
import { hermes } from '../src/hosts/hermes';
import { readState } from '../src/state';
import { withKimiNative } from './kimi-fixture';

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

  test('removes an old plgnz-owned Pi installation through the cleanup-only public route', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-pi-cleanup-source-'));
      writeFiles(sourceDir, {
        'plugin.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
        'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\nbody\n',
      });
      await piWriter.add(
        { dir: sourceDir, name: 'demo', marketplace: 'market', contentFingerprint: 'fixture' },
        { sourceUri: sourceDir, sha: 'fixture', isGit: false, plugins: [] },
      );
      writeLedger(home, [{ host: 'pi', id: 'demo@market', source: sourceDir, sourceSha: 'fixture', ownership: 'plgnz' }]);

      expect(pi.listInstalled().some((plugin) => plugin.id === 'demo@market')).toBe(true);
      expect(await main(['remove', 'demo@market', '--target', 'pi'])).toBe(0);
      expect(pi.listInstalled().some((plugin) => plugin.id === 'demo@market')).toBe(false);
      expect(existsSync(join(home, '.pi', 'agent', 'skills', 'market___demo'))).toBe(false);
      expect(readState().find((record) => record.host === 'pi')).toBeUndefined();
    });
  });

  test('removes a marketplace-qualified Hermes install through the public route', async () => {
    await withHostEnvAsync('codex', async (home) => {
      writeFiles(home, { '.hermes/config.yaml': '', '.hermes/plugins/.keep': '' });
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-hermes-marketplace-'));
      initGitRepo(sourceDir, {
        '.claude-plugin/marketplace.json': JSON.stringify({ name: 'personal', plugins: [{ source: 'plugins/demo-plugin' }] }),
        'plugins/demo-plugin/plugin.json': JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'demo-plugin', version: '1.0.0' }),
        'plugins/demo-plugin/commands/run.toml': 'description = "Run"\nprompt = "body $ARGUMENTS"\n',
      });
      expect(await main(['add', sourceDir, '--target', 'hermes'])).toBe(0);
      expect(hermes.listInstalled().some((plugin) => plugin.id === 'demo-plugin@personal')).toBe(true);

      expect(await main(['remove', 'demo-plugin@personal', '--target', 'hermes'])).toBe(0);
      expect(hermes.listInstalled().some((plugin) => plugin.name === 'demo-plugin')).toBe(false);
      expect(existsSync(join(home, '.hermes/plugins/demo-plugin.plgnz-commands'))).toBe(false);
      expect(readState().find((record) => record.host === 'hermes')).toBeUndefined();
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

  test('kimi > removes plugin from the active registry through native lifecycle', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      await main(['add', sourceDir, '--target', 'kimi']);
      
      const code = await main(['remove', 'demo-plugin']);
      expect(code).toBe(0);

      const installed = kimi.listInstalled();
      expect(installed.find(p => p.id === 'demo-plugin')).toBeUndefined();
      });
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
