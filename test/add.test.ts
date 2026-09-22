import { test, expect, describe } from 'bun:test';
import { join } from 'node:path';
import { chmodSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { materialize, materializeInto, withHostEnvAsync, initGitRepo, repoRoot } from './util';
import { main } from '../src/cli';
import { readState } from '../src/state';
import { claudeCode } from '../src/hosts/claude-code';
import { codex } from '../src/hosts/codex';
import { kimi } from '../src/hosts/kimi';
import { cursor } from '../src/hosts/cursor';
import { omp } from '../src/hosts/omp';
import { runDoctor } from '../src/doctor';
import { writers } from '../src/hosts/writers';
import type { HostWriter } from '../src/host';
import { CompatibilityError } from '../src/compatibility';
import { withKimiNative } from './kimi-fixture';

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
      const record = state.find(r => r.id === 'new-plugin@local' && r.host === 'codex');
      expect(record !== undefined).toBe(true);
      expect(record?.sourceDir).toContain('open-plugin-source-');
      expect(record?.installedFingerprint?.length).toBe(64);
    });
  });

  test('kimi > writes registry and copies files', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
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

  test('json dry-run reports a planned install without writing state or host content', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', sourceDir, '--target', 'codex', '--dry-run', '--json'])).toBe(0);
      } finally {
        console.log = originalLog;
      }

      const outcomes = JSON.parse(output.join('')) as Array<{ plugin: string; target: string; status: string; dryRun: boolean }>;
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.plugin).toBe('new-plugin');
      expect(outcomes[0]?.target).toBe('codex');
      expect(outcomes[0]?.status).toBe('installed');
      expect(outcomes[0]?.dryRun).toBe(true);
      expect(readState().find((record) => record.host === 'codex' && record.id === 'new-plugin@local')).toBeUndefined();
      expect(codex.listInstalled().find((plugin) => plugin.name === 'new-plugin')).toBeUndefined();
    });
  });

  test('rejects duplicate or absent requested targets before writing', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      const originalLog = console.log;
      const output: string[] = [];
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', sourceDir, '--target', 'codex', '--target', 'codex', '--json'])).toBe(2);
      } finally {
        console.log = originalLog;
      }
      const outcomes = JSON.parse(output.join('')) as Array<{ status: string; diagnostic?: string }>;
      expect(outcomes[0]?.status).toBe('failed');
      expect(outcomes[0]?.diagnostic).toContain('duplicate target');
      expect(readState()).toEqual([]);
      expect(codex.listInstalled().find((plugin) => plugin.name === 'new-plugin')).toBeUndefined();
    });
  });

  test('reports an explicitly requested but absent dcode target without creating a native store', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try { expect(await main(['add', sourceDir, '--target', 'dcode', '--json'])).toBe(2); }
      finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ target: string; status: string; diagnostic?: string }>;
      expect(outcomes).toHaveLength(1); expect(outcomes[0]?.target).toBe('dcode'); expect(outcomes[0]?.status).toBe('failed'); expect(outcomes[0]?.diagnostic).toContain("requested target 'dcode' is not present on this machine");
      expect(readState()).toEqual([]); expect(existsSync(join(home, '.deepagents'))).toBe(false);
    });
  });

  test('rejects a name outside the frozen target inventory before source or native writes', async () => {
    await withHostEnvAsync('codex', async () => {
      const before = codex.listInstalled().map((plugin) => plugin.id);
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', '/not/read', '--target', 'not-a-target', '--json'])).toBe(2);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ target: string; status: string; diagnostic?: string }>;
      expect(outcomes[0]?.target).toBe('not-a-target');
      expect(outcomes[0]?.status).toBe('failed');
      expect(outcomes[0]?.diagnostic).toContain("unknown target 'not-a-target'");
      expect(readState()).toEqual([]);
      expect(codex.listInstalled().map((plugin) => plugin.id)).toEqual(before);
    });
  });

  test('selects one plugin from a marketplace and rejects unknown selectors before writing', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-marketplace-'));
      mkdirSync(join(sourceDir, '.claude-plugin'), { recursive: true });
      for (const name of ['one', 'two']) {
        mkdirSync(join(sourceDir, name));
        writeFileSync(join(sourceDir, name, 'plugin.json'), JSON.stringify({ name }));
      }
      writeFileSync(join(sourceDir, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: 'personal', plugins: [{ source: 'one' }, { source: 'two' }] }));
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', sourceDir, '--target', 'codex', '--plugin', 'one', '--dry-run', '--json'])).toBe(0);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ plugin: string; nativeId?: string }>;
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.plugin).toBe('one');
      expect(outcomes[0]?.nativeId).toBe('one@personal');
      expect(codex.listInstalled().find((plugin) => plugin.name === 'one')).toBeUndefined();
    });
  });

  test('rejects an unknown plugin selector and unknown option before writing', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      for (const args of [
        ['add', sourceDir, '--target', 'codex', '--plugin', 'missing', '--json'],
        ['add', sourceDir, '--target', 'codex', '--unknown', '--json'],
      ]) {
        const output: string[] = [];
        const originalLog = console.log;
        console.log = (value: string) => output.push(value);
        try { expect(await main(args)).toBe(2); } finally { console.log = originalLog; }
        const outcomes = JSON.parse(output.join('')) as Array<{ status: string }>;
        expect(outcomes[0]?.status).toBe('failed');
      }
      expect(readState()).toEqual([]);
      expect(codex.listInstalled().find((plugin) => plugin.name === 'new-plugin')).toBeUndefined();
    });
  });

  test('refuses --adopt-existing on an unsupported selected host before source or state writes', async () => {
    await withHostEnvAsync('claude-code', async () => {
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', '/not/read', '--target', 'claude-code', '--adopt-existing', '--json'])).toBe(2);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ target: string; status: string; diagnostic?: string }>;
      expect(outcomes).toEqual([{ plugin: '*', target: 'claude-code', status: 'unsupported', action: 'install', dryRun: false, diagnostic: "target 'claude-code' does not support --adopt-existing" }]);
      expect(readState()).toEqual([]);
    });
  });

  test('reports a declared target with no active adapter as unverified without mutation', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', sourceDir, '--target', 'hermes', '--json'])).toBe(1);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ plugin: string; target: string; status: string; action: string; dryRun: boolean; diagnostic?: string }>;
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.plugin).toBe('new-plugin');
      expect(outcomes[0]?.target).toBe('hermes');
      expect(outcomes[0]?.status).toBe('unverified');
      expect(outcomes[0]?.action).toBe('install');
      expect(outcomes[0]?.dryRun).toBe(false);
      expect(outcomes[0]?.diagnostic).toContain('unverified for install');
      expect(readState()).toEqual([]);
      expect(codex.listInstalled().find((plugin) => plugin.name === 'new-plugin')).toBeUndefined();
    });
  });

  test('refuses an explicitly selected unverified adapter without mutation', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', sourceDir, '--target', 'gemini-cli', '--json'])).toBe(1);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ plugin: string; target: string; status: string; action: string; dryRun: boolean; diagnostic?: string }>;
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.plugin).toBe('new-plugin');
      expect(outcomes[0]?.target).toBe('gemini-cli');
      expect(outcomes[0]?.status).toBe('unverified');
      expect(outcomes[0]?.action).toBe('install');
      expect(outcomes[0]?.dryRun).toBe(false);
      expect(outcomes[0]?.diagnostic).toContain('unverified for install');
      expect(readState()).toEqual([]);
      expect(codex.listInstalled().find((plugin) => plugin.name === 'new-plugin')).toBeUndefined();
    });
  });

  test('does not start a supported target when another selected target is unverified', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      const output: string[] = [];
      const originalLog = console.log;
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', sourceDir, '--target', 'codex', '--target', 'hermes', '--json'])).toBe(1);
      } finally { console.log = originalLog; }
      const outcomes = JSON.parse(output.join('')) as Array<{ target: string; status: string }>;
      expect(outcomes.find((outcome) => outcome.target === 'hermes')?.status).toBe('unverified');
      expect(outcomes.find((outcome) => outcome.target === 'codex')?.status).toBe('failed');
      expect(readState()).toEqual([]);
      expect(codex.listInstalled().find((plugin) => plugin.name === 'new-plugin')).toBeUndefined();
    });
  });

  test('preserves a writer compatibility refusal in the add outcome', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      const originalWriters = [...writers];
      const refusing: HostWriter = {
        id: 'codex', gui: false, detect: () => true, stores: () => [], listInstalled: () => [], mcpEntries: () => [],
        add: async () => { throw new CompatibilityError('codex', 'install', 'unsupported', 'test evidence'); },
        remove: async () => {}, pin: async () => ({ changes: [], refusals: [] }),
      };
      const output: string[] = [];
      const originalLog = console.log;
      writers.splice(0, writers.length, refusing);
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['add', sourceDir, '--target', 'codex', '--json'])).toBe(1);
      } finally {
        writers.splice(0, writers.length, ...originalWriters);
        console.log = originalLog;
      }
      const outcomes = JSON.parse(output.join('')) as Array<{ target: string; status: string; diagnostic?: string }>;
      expect(outcomes[0]?.target).toBe('codex');
      expect(outcomes[0]?.status).toBe('unsupported');
      expect(outcomes[0]?.diagnostic).toContain('unsupported for install');
    });
  });

  test('does not mutate a host when pending intent cannot be persisted', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
      initGitRepo(sourceDir, pluginsMap);
      writeFileSync(join(home, 'state.json'), JSON.stringify({ version: 1, installs: [] }));
      chmodSync(home, 0o555);
      try {
        expect(await main(['add', sourceDir, '--target', 'codex', '--json'])).toBe(1);
        expect(codex.listInstalled().some((plugin) => plugin.name === 'new-plugin')).toBe(false);
      } finally {
        chmodSync(home, 0o755);
      }
    });
  });

  test('persists the desired source before a writer failure leaves install pending', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const oldSource = mkdtempSync(join(tmpdir(), 'open-plugin-old-source-'));
      initGitRepo(oldSource, pluginsMap);
      const nextSource = mkdtempSync(join(tmpdir(), 'open-plugin-new-source-'));
      writeFileSync(join(nextSource, 'plugin.json'), JSON.stringify({ name: 'new-plugin', version: 'unsafe/version' }));
      writeFileSync(join(home, 'state.json'), JSON.stringify({ version: 1, installs: [
        { host: 'codex', id: 'new-plugin@local', source: oldSource, sourceSha: 'old', ownership: 'plgnz' },
      ] }));
      expect(await main(['add', nextSource, '--target', 'codex'])).toBe(1);
      const pending = readState().find((record) => record.host === 'codex' && record.id === 'new-plugin@local');
      expect(pending?.source).toBe(nextSource);
      expect(pending?.pending).toBe('install');
    });
  });

  test('actual CLI reports every selected target after a later matrix failure', () => {
    const { home, env } = materialize('codex');
    materializeInto(home, 'cursor');
    const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-invalid-codex-source-'));
    writeFileSync(join(sourceDir, 'plugin.json'), JSON.stringify({ name: 'new-plugin', version: 'unsafe/version' }));
    const result = spawnSync('bun', [join(repoRoot, 'bin', 'plgnz.mjs'), 'add', sourceDir, '--target', 'codex', '--target', 'cursor', '--json'], {
      cwd: repoRoot, env: { ...process.env, ...env }, encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    const outcomes = JSON.parse(result.stdout) as Array<{ plugin: string; target: string; status: string; diagnostic?: string }>;
    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((outcome) => outcome.target === 'codex')?.diagnostic).toContain('unsafe Codex plugin version');
    expect(outcomes.find((outcome) => outcome.target === 'cursor')?.diagnostic).toContain('not attempted');
  });

  test('actual CLI ignores absent unverified adapters and fails cleanly when no writer target is detected', () => {
    const home = mkdtempSync(join(tmpdir(), 'open-plugin-empty-home-'));
    const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-source-'));
    initGitRepo(sourceDir, pluginsMap);
    const result = spawnSync('bun', [join(repoRoot, 'bin', 'plgnz.mjs'), 'add', sourceDir, '--json'], {
      cwd: repoRoot,
      env: { ...process.env, OPEN_PLUGIN_HOME: home },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    const outcomes = JSON.parse(result.stdout) as Array<{ status: string; diagnostic?: string }>;
    expect(outcomes[0]?.status).toBe('failed');
    expect(outcomes[0]?.diagnostic).toContain('No detected writer targets');
  });

  test('doctor content proof follows install, local source refresh, and native tampering', async () => {
    await withHostEnvAsync('codex', async () => {
      const sourceDir = mkdtempSync(join(tmpdir(), 'open-plugin-content-proof-'));
      initGitRepo(sourceDir, { ...pluginsMap, 'resource.txt': 'one\n' });
      expect(await main(['add', sourceDir, '--target', 'codex'])).toBe(0);
      const content = () => runDoctor([codex]).findings.find((finding) => finding.check === 'content' && finding.pluginId === 'new-plugin@local');
      expect(content()?.mark).toBe('✓');

      writeFileSync(join(sourceDir, 'resource.txt'), 'two\n');
      expect(content()?.mark).toBe('✗');
      expect(await main(['add', sourceDir, '--target', 'codex'])).toBe(0);
      expect(content()?.mark).toBe('✓');

      const installed = codex.listInstalled().find((plugin) => plugin.id === 'new-plugin@local');
      expect(installed?.path === undefined).toBe(false);
      writeFileSync(join(installed!.path!, 'resource.txt'), 'tampered\n');
      expect(content()?.mark).toBe('✗');
    });
  });
});
