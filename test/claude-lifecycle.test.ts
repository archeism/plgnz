import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { claudeCode } from '../src/hosts/claude-code';
import { claudeCodeWriter } from '../src/hosts/claude-code-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { writeFiles } from './util';

declare const Bun: {
  write(path: string, data: Uint8Array): Promise<void>;
  file(path: string): { arrayBuffer(): Promise<ArrayBuffer> };
};

function fixture(files: Record<string, string>): { plugin: PluginSource; resolved: ResolvedSource } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-claude-lifecycle-source-'));
  const dir = join(root, 'plugins', 'addy');
  writeFiles(dir, {
    'plugin.json': '{"name":"addy","version":"0.1.0"}',
    '.claude-plugin/plugin.json': '{"name":"addy","version":"0.1.0","skills":"./skills/","custom":"preserved"}',
    '.claude/commands/build.md': 'native command\n',
    'commands/build.toml': 'name = "build"\n',
    'skills/build/SKILL.md': 'canonical amended skill\n',
    ...files,
  });
  writeFiles(root, { '.claude-plugin/marketplace.json': '{"name":"personal","owner":{"name":"Charles"},"plugins":[{"name":"addy","source":"./plugins/addy"}]}' });
  const plugin: PluginSource = {
    dir,
    name: 'addy',
    marketplace: 'personal',
    contentFingerprint: JSON.stringify(files),
  };
  return { plugin, resolved: { sourceUri: root, sha: '0.1.0', isGit: false, plugins: [plugin] } };
}

function rootFixture(files: Record<string, string>): { plugin: PluginSource; resolved: ResolvedSource } {
  const incoming = fixture(files);
  rmSync(join(incoming.resolved.sourceUri, '.claude-plugin'), { recursive: true, force: true });
  incoming.plugin.marketplace = 'local';
  return incoming;
}

async function isolated(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-claude-code-root-'));
  const saved = process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'];
  process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'] = root;
  try { await fn(root); }
  finally {
    if (saved === undefined) delete process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'];
    else process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'] = saved;
    rmSync(root, { recursive: true, force: true });
  }
}

async function failure(run: () => Promise<unknown>): Promise<Error> {
  try { await run(); } catch (error) { return error as Error; }
  throw new Error('expected operation to fail');
}

describe('claude-code lifecycle', () => {
  test('reports native user enablement rather than treating installation as activation', async () => {
    await isolated(async root => {
      const incoming = fixture({});
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      expect(claudeCode.listInstalled()[0]?.enabled).toBe(true);
      writeFileSync(join(root, 'settings.json'), JSON.stringify({ enabledPlugins: { 'addy@personal': false } }));
      expect(claudeCode.listInstalled()[0]?.enabled).toBe(false);
      writeFileSync(join(root, 'settings.json'), '{}');
      expect(claudeCode.listInstalled()[0]?.enabled).toBe(false);
    });
  });
  test('validates a dry-run without creating a Claude store', async () => {
    await isolated(async root => {
      const incoming = fixture({});
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved, { dryRun: true });
      expect(existsSync(join(root, 'plugins'))).toBe(false);
    });
  });

  test('root-source dry-run leaves no managed marketplace wrapper behind', async () => {
    await isolated(async root => {
      const incoming = rootFixture({});
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved, { dryRun: true });
      expect(existsSync(join(root, 'plugins/marketplaces/.plgnz-local'))).toBe(false);
      expect(existsSync(join(root, 'plugins/known_marketplaces.json'))).toBe(false);
    });
  });

  test('dry-run applies the same read-only root marketplace refusal as activation', async () => {
    await isolated(async root => {
      const incoming = rootFixture({});
      const wrapper = join(root, 'plugins/marketplaces/.plgnz-local');
      writeFiles(wrapper, { 'foreign.txt': 'keep\n' });
      const wrapperBefore = readFileSync(join(wrapper, 'foreign.txt'), 'utf8');
      for (const opts of [{ dryRun: true }, { dryRun: true, adoptExisting: true }, undefined]) {
        expect((await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved, opts))).message).toContain('wrapper');
        expect(readFileSync(join(wrapper, 'foreign.txt'), 'utf8')).toBe(wrapperBefore);
      }

      rmSync(wrapper, { recursive: true, force: true });
      const known = join(root, 'plugins/known_marketplaces.json');
      writeFileSync(known, JSON.stringify({ local: { source: { source: 'directory', path: '/foreign' }, installLocation: '/foreign' } }));
      const knownBefore = readFileSync(known, 'utf8');
      for (const opts of [{ dryRun: true }, { dryRun: true, adoptExisting: true }, undefined]) {
        expect((await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved, opts))).message).toContain('different source');
        expect(readFileSync(known, 'utf8')).toBe(knownBefore);
      }
    });
  });

  test('dry-run refuses the same unowned target that a real activation would refuse', async () => {
    await isolated(async root => {
      const incoming = fixture({});
      writeFiles(join(root, 'plugins/cache/personal/addy/0.1.0'), { 'foreign.txt': 'keep\n' });
      expect((await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved, { dryRun: true }))).message).toContain('unowned');
      expect(readFileSync(join(root, 'plugins/cache/personal/addy/0.1.0/foreign.txt'), 'utf8')).toBe('keep\n');
    });
  });

  test('adopts one exact unmarked native user install into a marked sibling without deleting the prior cache', async () => {
    await isolated(async root => {
      const incoming = fixture({ 'resources/value.txt': 'incoming\n' });
      const legacy = join(root, 'plugins/cache/personal/addy/0.1.0');
      writeFiles(legacy, {
        'plugin.json': '{"name":"addy","version":"0.1.0"}',
        '.claude-plugin/plugin.json': '{"name":"addy","version":"0.1.0","skills":"./skills/"}',
        'resources/value.txt': 'native-old\n',
      });
      const registry = join(root, 'plugins/installed_plugins.json');
      writeFiles(join(root, 'plugins'), { 'installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'addy@personal': [{ scope: 'user', installPath: legacy, version: '0.1.0' }] } }) });
      const marketplaces = join(root, 'plugins/known_marketplaces.json');
      writeFileSync(marketplaces, JSON.stringify({ personal: { source: { source: 'directory', path: '/native-personal' }, installLocation: '/native-personal' } }));
      const marketplacesBefore = readFileSync(marketplaces, 'utf8');

      await claudeCodeWriter.add(incoming.plugin, incoming.resolved, { dryRun: true, adoptExisting: true });
      expect(existsSync(join(root, 'plugins/cache/personal/addy/0.1.0.plgnz'))).toBe(false);
      expect(readFileSync(join(legacy, 'resources/value.txt'), 'utf8')).toBe('native-old\n');
      expect(readFileSync(marketplaces, 'utf8')).toBe(marketplacesBefore);

      await claudeCodeWriter.add(incoming.plugin, incoming.resolved, { adoptExisting: true });
      const adopted = join(root, 'plugins/cache/personal/addy/0.1.0.plgnz');
      expect(existsSync(join(legacy, '.plgnz-install.json'))).toBe(false);
      expect(readFileSync(join(legacy, 'resources/value.txt'), 'utf8')).toBe('native-old\n');
      expect(existsSync(join(adopted, '.plgnz-install.json'))).toBe(true);
      expect(JSON.parse(readFileSync(registry, 'utf8')).plugins['addy@personal'][0].installPath).toBe(adopted);
      expect(readFileSync(marketplaces, 'utf8')).toBe(marketplacesBefore);
      expect(await claudeCodeWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
      expect(readFileSync(marketplaces, 'utf8')).toBe(marketplacesBefore);
      expect(await claudeCodeWriter.add(incoming.plugin, incoming.resolved, { adoptExisting: true })).toBe('unchanged');
      incoming.resolved.sha = '0.1.0-next';
      incoming.plugin.contentFingerprint = 'next';
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved, { adoptExisting: true });
      expect(JSON.parse(readFileSync(registry, 'utf8')).plugins['addy@personal'][0].installPath).toBe(join(root, 'plugins/cache/personal/addy/0.1.0-next'));
      expect(existsSync(legacy)).toBe(true);
      expect(readFileSync(marketplaces, 'utf8')).toBe(marketplacesBefore);
    });
  });

  test('refuses adoption when the unmarked user root lacks the selected native identity', async () => {
    await isolated(async root => {
      const incoming = fixture({});
      const legacy = join(root, 'plugins/cache/personal/addy/0.1.0');
      writeFiles(legacy, { '.claude-plugin/plugin.json': '{"name":"other","version":"0.1.0"}', 'foreign.txt': 'keep\n' });
      writeFiles(join(root, 'plugins'), { 'installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'addy@personal': [{ scope: 'user', installPath: legacy, version: '0.1.0' }] } }) });
      expect((await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved, { adoptExisting: true }))).message).toContain('identity');
      expect(readFileSync(join(legacy, 'foreign.txt'), 'utf8')).toBe('keep\n');
      expect(existsSync(join(root, 'plugins/cache/personal/addy/0.1.0.plgnz'))).toBe(false);
    });
  });

  test('retains native command and skill bytes, then refreshes changed bytes at the same version', async () => {
    await isolated(async root => {
      const incoming = fixture({ 'resources/value.txt': 'one\n' });
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      const target = join(root, 'plugins/cache/personal/addy/0.1.0');
      expect(readFileSync(join(target, '.claude/commands/build.md'), 'utf8')).toBe('native command\n');
      expect(readFileSync(join(target, 'commands/build.toml'), 'utf8')).toBe('name = "build"\n');
      expect(readFileSync(join(target, 'skills/build/SKILL.md'), 'utf8')).toBe('canonical amended skill\n');
      const nativeManifest = JSON.parse(readFileSync(join(target, '.claude-plugin/plugin.json'), 'utf8')) as { custom?: string; commands?: string[] };
      expect(nativeManifest.custom).toBe('preserved');
      expect(nativeManifest.commands).toEqual(['./.claude/commands/build.md']);
      const settings = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8')) as { enabledPlugins: Record<string, boolean> };
      expect(settings.enabledPlugins['addy@personal']).toBe(true);
      expect(await claudeCodeWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
      expect(readdirSync(join(root, 'plugins/cache/personal/addy'))).toEqual(['0.1.0']);
      writeFiles(incoming.plugin.dir, { 'resources/value.txt': 'two\n' });
      incoming.plugin.contentFingerprint = 'changed';
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('two\n');
      expect(claudeCode.listInstalled().find(entry => entry.id === 'addy@personal')?.path).toBe(target);
    });
  });

  test('refuses a foreign cache slot and does not replace an owned active copy when staging fails', async () => {
    await isolated(async root => {
      const incoming = fixture({ 'resources/value.txt': 'safe\n' });
      const target = join(root, 'plugins/cache/personal/addy/0.1.0');
      writeFiles(target, { 'foreign.txt': 'keep\n' });
      expect((await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved))).message).toContain('unowned');
      expect(readFileSync(join(target, 'foreign.txt'), 'utf8')).toBe('keep\n');
      rmSync(target, { recursive: true, force: true });
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      writeFileSync(join(incoming.plugin.dir, 'plugin.json'), '{bad json');
      incoming.plugin.contentFingerprint = 'bad-stage';
      await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved));
      expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('safe\n');
    });
  });

  test('restores the old root wrapper and all native metadata when post-stage registration is refused', async () => {
    await isolated(async root => {
      const incoming = rootFixture({ 'resources/value.txt': 'old\n' });
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      const wrapper = join(root, 'plugins/marketplaces/.plgnz-local');
      const registry = join(root, 'plugins/installed_plugins.json');
      const settings = join(root, 'settings.json');
      const marketplaces = join(root, 'plugins/known_marketplaces.json');
      const known = JSON.parse(readFileSync(marketplaces, 'utf8')) as Record<string, unknown>;
      known['local'] = { source: { source: 'directory', path: '/foreign' }, installLocation: '/foreign' };
      writeFileSync(marketplaces, JSON.stringify(known));
      const wrapperFiles = [join(wrapper, 'plugins/addy/resources/value.txt'), join(wrapper, '.claude-plugin/marketplace.json'), join(wrapper, '.plgnz-install.json')];
      const before = [...wrapperFiles, registry, settings, marketplaces].map(file => readFileSync(file, 'utf8'));
      writeFiles(incoming.plugin.dir, { 'resources/value.txt': 'new\n' });
      incoming.plugin.contentFingerprint = 'changed';
      expect((await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved))).message).toContain('different source');
      for (const [index, file] of [...wrapperFiles, registry, settings, marketplaces].entries()) expect(readFileSync(file, 'utf8')).toBe(before[index]);
    });
  });

  test('removes only a marker-owned cache entry', async () => {
    await isolated(async root => {
      const incoming = fixture({});
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      const foreign = join(root, 'plugins/cache/personal/addy/foreign');
      writeFiles(foreign, { 'foreign.txt': 'keep\n' });
      const registry = join(root, 'plugins/installed_plugins.json');
      const registryDocument = JSON.parse(readFileSync(registry, 'utf8')) as { plugins: Record<string, unknown[]> };
      registryDocument.plugins['addy@personal']?.push({ scope: 'project', installPath: '/native-project-copy', version: '0.1.0' });
      writeFileSync(registry, JSON.stringify(registryDocument));
      await claudeCodeWriter.remove('addy@personal');
      expect(existsSync(join(root, 'plugins/cache/personal/addy/0.1.0'))).toBe(false);
      expect(existsSync(foreign)).toBe(true);
      const retained = (JSON.parse(readFileSync(registry, 'utf8')) as { plugins: Record<string, Array<{ scope: string; installPath: string }>> }).plugins['addy@personal'] ?? [];
      expect(retained).toEqual([{ scope: 'project', installPath: '/native-project-copy', version: '0.1.0' }]);
      const settings = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8')) as { enabledPlugins: Record<string, boolean> };
      expect(settings.enabledPlugins['addy@personal']).toBe(false);
    });
  });

  test('restores already moved owned cache paths when a later duplicate move fails', async () => {
    await isolated(async root => {
      const incoming = fixture({});
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      const registry = join(root, 'plugins/installed_plugins.json');
      const document = JSON.parse(readFileSync(registry, 'utf8')) as { plugins: Record<string, unknown[]> };
      document.plugins['addy@personal']?.push({ ...(document.plugins['addy@personal']?.[0] as Record<string, unknown>) });
      writeFileSync(registry, JSON.stringify(document));
      const target = join(root, 'plugins/cache/personal/addy/0.1.0');
      await failure(() => claudeCodeWriter.remove('addy@personal'));
      expect(existsSync(target)).toBe(true);
      expect(JSON.parse(readFileSync(registry, 'utf8'))).toEqual(document);
    });
  });

  test('refreshes a source at a new SHA while retaining other native scopes', async () => {
    await isolated(async root => {
      const incoming = fixture({ 'resources/value.txt': 'old\n' });
      incoming.resolved.sha = 'old-sha';
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      const registry = join(root, 'plugins/installed_plugins.json');
      const document = JSON.parse(readFileSync(registry, 'utf8')) as { plugins: Record<string, unknown[]> };
      document.plugins['addy@personal']?.push({ scope: 'project', installPath: '/project-owned-by-claude', version: '0.1.0' });
      writeFileSync(registry, JSON.stringify(document));
      writeFiles(incoming.plugin.dir, { 'resources/value.txt': 'new\n' });
      incoming.plugin.contentFingerprint = 'new-sha-content';
      incoming.resolved.sha = 'new-sha';
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      const rows = (JSON.parse(readFileSync(registry, 'utf8')) as { plugins: Record<string, Array<{ scope: string; installPath: string }>> }).plugins['addy@personal'] ?? [];
      expect(rows).toHaveLength(2);
      expect(rows.find(row => row.scope === 'user')?.installPath).toContain('/new-sha');
      expect(rows.find(row => row.scope === 'project')?.installPath).toBe('/project-owned-by-claude');
      expect(existsSync(join(root, 'plugins/cache/personal/addy/old-sha'))).toBe(false);
    });
  });

  test('keeps durable root activation when obsolete owned-cache cleanup fails', async () => {
    await isolated(async root => {
      const incoming = rootFixture({});
      const externalParent = mkdtempSync(join(tmpdir(), 'plgnz-claude-cleanup-'));
      const stale = join(externalParent, 'stale');
      writeFiles(stale, { '.plgnz-install.json': JSON.stringify({ source: incoming.resolved.sourceUri, pluginId: 'addy@local', fingerprint: 'old' }) });
      writeFiles(join(root, 'plugins'), { 'installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'addy@local': [{ scope: 'user', installPath: stale, version: 'old' }] } }) });
      chmodSync(externalParent, 0o555);
      try {
        expect((await failure(() => claudeCodeWriter.add(incoming.plugin, incoming.resolved))).name).toBe('Error');
        const active = join(root, 'plugins/cache/local/addy/0.1.0');
        expect(existsSync(active)).toBe(true);
        expect(existsSync(join(root, 'plugins/marketplaces/.plgnz-local'))).toBe(true);
        expect((JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8')) as { enabledPlugins: Record<string, boolean> }).enabledPlugins['addy@local']).toBe(true);
        expect((JSON.parse(readFileSync(join(root, 'plugins/installed_plugins.json'), 'utf8')) as { plugins: Record<string, Array<{ installPath: string }>> }).plugins['addy@local']?.[0]?.installPath).toBe(active);
      } finally {
        chmodSync(externalParent, 0o755);
        rmSync(externalParent, { recursive: true, force: true });
      }
    });
  });

  test('compares opaque resource bytes and rejects mismatched manifests before activation', async () => {
    await isolated(async root => {
      const incoming = fixture({});
      const resource = join(incoming.plugin.dir, 'resources/blob.bin');
      mkdirSync(join(incoming.plugin.dir, 'resources'), { recursive: true });
      await Bun.write(resource, new Uint8Array([0xff]));
      incoming.plugin.contentFingerprint = 'binary-one';
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      await Bun.write(resource, new Uint8Array([0xfe]));
      incoming.plugin.contentFingerprint = 'binary-two';
      await claudeCodeWriter.add(incoming.plugin, incoming.resolved);
      const active = join(root, 'plugins/cache/personal/addy/0.1.0/resources/blob.bin');
      expect(Array.from(new Uint8Array(await Bun.file(active).arrayBuffer()))).toEqual([0xfe]);

      const mismatched = fixture({ 'plugin.json': '{"name":"other","version":"0.1.0"}', '.claude-plugin/plugin.json': '{"name":"wrong","version":"0.1.0"}' });
      mismatched.plugin.name = 'other';
      mismatched.resolved.sourceUri = incoming.resolved.sourceUri;
      expect((await failure(() => claudeCodeWriter.add(mismatched.plugin, mismatched.resolved))).message).toContain('identity');
      expect(existsSync(join(root, 'plugins/cache/personal/other/0.1.0'))).toBe(false);
    });
  });
});
