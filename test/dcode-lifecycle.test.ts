import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dcode } from '../src/hosts/dcode';
import { dcodeWriter } from '../src/hosts/dcode-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { writeFiles } from './util';

function incoming(body = 'ordinary skill\n'): { plugin: PluginSource; resolved: ResolvedSource } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-source-')); const dir = join(root, 'plugins', 'addy');
  writeFiles(dir, { 'plugin.json': '{"name":"addy","version":"0.1.0"}\n', 'skills/a/SKILL.md': `---\nname: a\ndescription: fixture\n---\n${body}` });
  const plugin: PluginSource = { dir, name: 'addy', marketplace: 'personal', contentFingerprint: body };
  return { plugin, resolved: { sourceUri: root, sha: '0.1.0', isGit: false, plugins: [plugin] } };
}
async function isolated(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-root-')); const old = process.env['OPEN_PLUGIN_DCODE_ROOT'];
  process.env['OPEN_PLUGIN_DCODE_ROOT'] = root;
  try { await fn(root); } finally { if (old === undefined) delete process.env['OPEN_PLUGIN_DCODE_ROOT']; else process.env['OPEN_PLUGIN_DCODE_ROOT'] = old; rmSync(root, { recursive: true, force: true }); }
}
async function failed(run: () => Promise<unknown>): Promise<Error> { try { await run(); } catch (error) { return error as Error; } throw new Error('expected failure'); }
const registry = (root: string) => join(root, '.state', 'installed_plugins.json');
const copy = (root: string) => join(root, 'plugins/cache/personal/addy/0.1.0');

describe('dcode lifecycle', () => {
  test('uses the isolated root and exposes enabled native installs', async () => {
    await isolated(async root => { const item = incoming(); await dcodeWriter.add(item.plugin, item.resolved); expect(dcode.detect()).toBe(true); expect(dcode.listInstalled()[0]?.id).toBe('addy@personal'); expect(dcode.listInstalled()[0]?.enabled).toBe(true); expect(dcode.listInstalled()[0]?.path).toBe(copy(root)); });
  });
  test('same content is unchanged and same-version changed bytes refresh', async () => {
    await isolated(async root => {
      const first = incoming('first\n'); await dcodeWriter.add(first.plugin, first.resolved); expect(await dcodeWriter.add(first.plugin, first.resolved)).toBe('unchanged');
      const changed = incoming('second\n'); changed.resolved.sourceUri = first.resolved.sourceUri; await dcodeWriter.add(changed.plugin, changed.resolved);
      expect(readFileSync(join(copy(root), 'skills/a/SKILL.md'), 'utf8')).toContain('second');
    });
  });
  test('copies ordinary skill bytes without normalizing line endings', async () => {
    await isolated(async root => {
      const raw = 'byte-preserved\r\n'; const item = incoming(raw); await dcodeWriter.add(item.plugin, item.resolved);
      expect(readFileSync(join(copy(root), 'skills/a/SKILL.md'), 'utf8')).toBe(`---\nname: a\ndescription: fixture\n---\n${raw}`);
    });
  });
  test('unsupported command and user-only semantics preserve the active copy', async () => {
    await isolated(async root => {
      const first = incoming('first\n'); await dcodeWriter.add(first.plugin, first.resolved); const before = readFileSync(join(copy(root), 'skills/a/SKILL.md'), 'utf8');
      const command = incoming('second\n'); command.resolved.sourceUri = first.resolved.sourceUri; writeFiles(command.plugin.dir, { 'commands/x.md': 'nope\n' });
      expect((await failed(() => dcodeWriter.add(command.plugin, command.resolved))).message).toContain('commands/agents'); expect(readFileSync(join(copy(root), 'skills/a/SKILL.md'), 'utf8')).toBe(before);
      const gated = incoming('---\nname: a\ndescription: fixture\ndisable-model-invocation: true\n---\nbody\n'); gated.resolved.sourceUri = first.resolved.sourceUri;
      expect((await failed(() => dcodeWriter.add(gated.plugin, gated.resolved))).message).toContain('user-only'); expect(readFileSync(join(copy(root), 'skills/a/SKILL.md'), 'utf8')).toBe(before);
    });
  });
  test('dry-run preflights identically and writes no active state', async () => {
    await isolated(async root => {
      const item = incoming(); await dcodeWriter.add(item.plugin, item.resolved, { dryRun: true }); expect(existsSync(registry(root))).toBe(false); expect(existsSync(copy(root))).toBe(false);
      writeFiles(copy(root), { 'foreign.txt': 'keep\n' });
      for (const opts of [{ dryRun: true }, undefined]) expect((await failed(() => dcodeWriter.add(item.plugin, item.resolved, opts))).message).toContain('unowned');
      expect(readFileSync(join(copy(root), 'foreign.txt'), 'utf8')).toBe('keep\n');
    });
  });
  test('rejects a symlinked native cache before it can write outside the dcode root', async () => {
    await isolated(async root => {
      const outside = mkdtempSync(join(tmpdir(), 'plgnz-dcode-outside-')); const item = incoming();
      mkdirSync(join(root, 'plugins'), { recursive: true }); expect(spawnSync('ln', ['-s', outside, join(root, 'plugins', 'cache')]).status).toBe(0);
      for (const opts of [{ dryRun: true }, undefined]) expect((await failed(() => dcodeWriter.add(item.plugin, item.resolved, opts))).message).toContain('symlink');
      expect(existsSync(join(outside, 'personal', 'addy'))).toBe(false); expect(existsSync(registry(root))).toBe(false); rmSync(outside, { recursive: true, force: true });
    });
  });
  test('rejects malformed native records and ownership markers without overwriting them', async () => {
    await isolated(async root => {
      const item = incoming(); writeFiles(root, { '.state/installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'addy@personal': ['broken'] } }), '.state/plugin_state.json': JSON.stringify({ version: 1, enabledPlugins: {} }) });
      const before = readFileSync(registry(root), 'utf8'); expect((await failed(() => dcodeWriter.add(item.plugin, item.resolved))).message).toContain('registry record'); expect(readFileSync(registry(root), 'utf8')).toBe(before);
      rmSync(join(root, '.state'), { recursive: true, force: true }); writeFiles(copy(root), { '.plgnz-install.json': '{bad json' });
      expect((await failed(() => dcodeWriter.add(item.plugin, item.resolved))).message).toContain('ownership marker'); expect(readFileSync(join(copy(root), '.plgnz-install.json'), 'utf8')).toBe('{bad json');
    });
  });
  test('removes only a marker-owned native record', async () => {
    await isolated(async root => {
      const item = incoming(); await dcodeWriter.add(item.plugin, item.resolved); await dcodeWriter.remove('addy@personal'); expect(existsSync(copy(root))).toBe(false); expect(JSON.parse(readFileSync(registry(root), 'utf8')).plugins['addy@personal']).toBeUndefined();
      writeFiles(copy(root), { 'foreign.txt': 'keep\n' }); writeFiles(root, { '.state/installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'addy@personal': [{ installPath: copy(root), version: '0.1.0' }] } }) });
      expect((await failed(() => dcodeWriter.remove('addy@personal'))).message).toContain('not wholly'); expect(existsSync(copy(root))).toBe(true);
    });
  });
  test('metadata failure rollback retains the prior active copy', async () => {
    await isolated(async root => {
      const item = incoming('first\n'); await dcodeWriter.add(item.plugin, item.resolved); const before = readFileSync(join(copy(root), 'skills/a/SKILL.md'), 'utf8');
      // A directory at the enablement file makes the second metadata commit fail.
      rmSync(join(root, '.state', 'plugin_state.json')); writeFiles(join(root, '.state', 'plugin_state.json'), { '.keep': '' });
      const changed = incoming('second\n'); changed.resolved.sourceUri = item.resolved.sourceUri;
      await failed(() => dcodeWriter.add(changed.plugin, changed.resolved)); expect(readFileSync(join(copy(root), 'skills/a/SKILL.md'), 'utf8')).toBe(before);
    });
  });
});
