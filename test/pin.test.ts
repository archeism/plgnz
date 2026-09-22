/**
 * `pin` fixture tests.
 *
 * The scenario mirrors the real cursor store (docs/hosts/cursor.md): a plugin
 * copy under `~/.cursor/plugins/local/` whose `.mcp.json`/`mcp.json` carry a
 * bare stdio command that cannot be assumed to resolve under a GUI app.
 *
 * PATH is controlled by the test (a temp dir prepended), so "resolves" and
 * "does not resolve" are facts the fixture creates, not properties of the
 * machine running the suite.
 */
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPin } from '../src/pin';
import { cursorWriter } from '../src/hosts/cursor-writer';
import { kimiWriter } from '../src/hosts/kimi-writer';
import { readState } from '../src/state';
import { repoRoot, fakeBin, materialize, materializeInto, withHostEnvAsync, withPathPrefix } from './util';

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

function serverCommand(file: string, name: string): string | undefined {
  const root = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: Record<string, { command?: string }> };
  return root.mcpServers?.[name]?.command;
}

/** A plugin copy in the cursor local store with the given `mcpServers`. */
function writeCursorPlugin(home: string, name: string, mcpServers: unknown): string {
  const dir = join(home, '.cursor', 'plugins', 'local', name);
  mkdirSync(join(dir, '.cursor-plugin'), { recursive: true });
  writeFileSync(join(dir, '.cursor-plugin', 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }, null, 2));
  const mcp = JSON.stringify({ $schema: SCHEMA, mcpServers }, null, 2);
  writeFileSync(join(dir, 'mcp.json'), mcp);
  writeFileSync(join(dir, '.mcp.json'), mcp);
  return dir;
}

function cursorFixtureWithoutDemoPlugin(home: string): void {
  // Keep the run focused on the plugin this test writes; the shipped cursor
  // fixture (demo-plugin) is covered by doctor.test.ts.
  rmSync(join(home, '.cursor', 'plugins', 'local', 'demo-plugin'), { recursive: true, force: true });
}

describe('pin · cursor (GUI host)', () => {
  test('rewrites a bare command in every copy, leaves absolute ones alone', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      cursorFixtureWithoutDemoPlugin(home);
      const bin = fakeBin(home, 'fixture-mcp');
      const dir = writeCursorPlugin(home, 'pinned-plugin', {
        'local-tool': { type: 'stdio', command: 'fixture-mcp', args: ['serve'] },
        'abs-tool': { type: 'stdio', command: '/bin/echo' },
      });

      await withPathPrefix(bin, async () => {
        const result = await runPin({ writers: [cursorWriter] });
        expect(result.exitCode).toBe(0);
        expect(result.findings.some((f) => f.mark === '✓' && f.message.includes("server 'local-tool'"))).toBe(true);
        expect(result.findings.some((f) => f.message.includes('abs-tool'))).toBe(false);
      });

      // both statements of the server are rewritten, not just the first
      expect(serverCommand(join(dir, 'mcp.json'), 'local-tool')).toBe(join(bin, 'fixture-mcp'));
      expect(serverCommand(join(dir, '.mcp.json'), 'local-tool')).toBe(join(bin, 'fixture-mcp'));
      expect(serverCommand(join(dir, 'mcp.json'), 'abs-tool')).toBe('/bin/echo');
    });
  });

  test('refuses a bare command that does not resolve, and leaves it bare', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      cursorFixtureWithoutDemoPlugin(home);
      const dir = writeCursorPlugin(home, 'pinned-plugin', {
        'ghost-tool': { type: 'stdio', command: 'open-plugin-no-such-command' },
        'good-tool': { type: 'stdio', command: 'fixture-mcp' },
      });

      const result = await withPathPrefix(fakeBin(home, 'fixture-mcp'), () => runPin({ writers: [cursorWriter] }));

      expect(result.exitCode).toBe(1);
      const refusal = result.findings.find((f) => f.mark === '✗');
      expect(refusal?.message).toContain("server 'ghost-tool'");
      expect(refusal?.message).toContain('not found on PATH');
      expect(serverCommand(join(dir, 'mcp.json'), 'ghost-tool')).toBe('open-plugin-no-such-command');
      // the resolvable sibling in the same file is still pinned
      expect(serverCommand(join(dir, 'mcp.json'), 'good-tool')).toBe(join(home, 'fake-bin', 'fixture-mcp'));
    });
  });

  test('--dry-run reports the change and writes nothing', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      cursorFixtureWithoutDemoPlugin(home);
      const dir = writeCursorPlugin(home, 'pinned-plugin', {
        'local-tool': { type: 'stdio', command: 'fixture-mcp' },
      });

      const result = await withPathPrefix(fakeBin(home, 'fixture-mcp'), () =>
        runPin({ writers: [cursorWriter], dryRun: true }),
      );

      expect(result.exitCode).toBe(0);
      expect(result.findings.some((f) => f.message.startsWith('[dry-run] ') && f.message.includes('pinned'))).toBe(true);
      expect(serverCommand(join(dir, 'mcp.json'), 'local-tool')).toBe('fixture-mcp');
      expect(readState(join(home, 'state.json'))).toHaveLength(0);
    });
  });

  test('default targets are the GUI hosts; --all covers the rest', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      cursorFixtureWithoutDemoPlugin(home);
      const cursorDir = writeCursorPlugin(home, 'pinned-plugin', {
        'gui-tool': { type: 'stdio', command: 'fixture-mcp' },
      });
      // kimi is not a GUI host: its copy declares the same bare command.
      materializeInto(home, 'kimi');
      const kimiFile = join(home, '.kimi-code', 'plugins', 'managed', 'demo-plugin', 'mcp.json');
      writeFileSync(
        kimiFile,
        JSON.stringify({ $schema: SCHEMA, mcpServers: { 'cli-tool': { type: 'stdio', command: 'fixture-mcp' } } }, null, 2),
      );

      const bin = fakeBin(home, 'fixture-mcp');
      const byDefault = await withPathPrefix(bin, () => runPin({ writers: [cursorWriter, kimiWriter] }));
      expect(byDefault.findings.some((f) => f.host === 'kimi')).toBe(false);
      expect(serverCommand(join(cursorDir, 'mcp.json'), 'gui-tool')).toBe(join(bin, 'fixture-mcp'));
      expect(serverCommand(kimiFile, 'cli-tool')).toBe('fixture-mcp');

      const all = await withPathPrefix(bin, () => runPin({ writers: [cursorWriter, kimiWriter], all: true }));
      expect(all.findings.some((f) => f.host === 'kimi' && f.mark === '✓')).toBe(true);
      expect(serverCommand(kimiFile, 'cli-tool')).toBe(join(bin, 'fixture-mcp'));
    });
  });

  test('records what it pinned in state.json, and flags a plugin it did not install', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      cursorFixtureWithoutDemoPlugin(home);
      writeCursorPlugin(home, 'ours', { tool: { type: 'stdio', command: 'fixture-mcp' } });
      writeCursorPlugin(home, 'theirs', { tool: { type: 'stdio', command: 'fixture-mcp' } });
      writeFileSync(
        join(home, 'state.json'),
        JSON.stringify(
          {
            version: 1,
            installs: [{ host: 'cursor', id: 'ours', source: '/tmp/marketplace', sourceSha: 'local' }],
          },
          null,
          2,
        ),
      );

      const result = await withPathPrefix(fakeBin(home, 'fixture-mcp'), () => runPin({ writers: [cursorWriter] }));

      expect(result.exitCode).toBe(0);
      const unknown = result.findings.find((f) => f.mark === '!');
      expect(unknown?.message).toContain("plugin 'theirs' has no record in state.json");
      const records = readState(join(home, 'state.json'));
      expect(records.find((r) => r.id === 'ours')?.pins).toEqual(['tool']);
      expect(records.find((r) => r.id === 'ours')?.installedFingerprint === undefined).toBe(false);
      expect(records.find((r) => r.id === 'theirs')).toBeUndefined();
    });
  });
});

describe('pin · CLI', () => {
  test('`pin --target cursor` exits 1 on an unresolvable bare command', () => {
    const { home, env } = materialize('cursor');
    writeCursorPlugin(home, 'pinned-plugin', { 'ghost-tool': { type: 'stdio', command: 'open-plugin-no-such-command' } });
    const r = spawnSync('bun', [join(repoRoot, 'bin', 'plgnz.mjs'), 'pin', '--target', 'cursor'], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("server 'ghost-tool'");
  });

  test('`pin --target <unknown host>` is a usage error', () => {
    const { env } = materialize('cursor');
    const r = spawnSync('bun', [join(repoRoot, 'bin', 'plgnz.mjs'), 'pin', '--target', 'nope'], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown target 'nope'");
  });
});
