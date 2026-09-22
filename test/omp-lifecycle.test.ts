import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { omp } from '../src/hosts/omp';
import { ompWriter } from '../src/hosts/omp-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { writeFiles } from './util';

function fixture(files: Record<string, string> = {}): { plugin: PluginSource; resolved: ResolvedSource } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-omp-source-')); const dir = join(root, 'plugins', 'demo-plugin');
  writeFiles(dir, { 'plugin.json': '{"name":"demo-plugin","version":"1.2.0"}', 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\nbody\n', 'resources/value.txt': 'one\n', ...files });
  const plugin: PluginSource = { dir, name: 'demo-plugin', marketplace: 'personal', contentFingerprint: 'one' };
  return { plugin, resolved: { sourceUri: root, sha: '1.2.0', isGit: false, plugins: [plugin] } };
}
async function isolated(run: (root: string) => Promise<void>): Promise<void> { const root = mkdtempSync(join(tmpdir(), 'plgnz-omp-home-')); const old = process.env['OPEN_PLUGIN_OMP_ROOT']; process.env['OPEN_PLUGIN_OMP_ROOT'] = join(root, '.omp'); try { await run(root); } finally { if (old === undefined) delete process.env['OPEN_PLUGIN_OMP_ROOT']; else process.env['OPEN_PLUGIN_OMP_ROOT'] = old; rmSync(root, { recursive: true, force: true }); } }
async function failure(run: () => Promise<unknown>): Promise<Error> { try { await run(); } catch (error) { return error as Error; } throw new Error('expected failure'); }

describe('OMP native cache lifecycle', () => {
  test('activates a marked copy and preserves unrelated user configuration', async () => isolated(async root => {
    const incoming = fixture(); writeFiles(join(root, '.omp'), { 'marketplaces.json': '{"marketplaces":[{"name":"user"}]}' });
    await ompWriter.add(incoming.plugin, incoming.resolved);
    const target = join(root, '.omp/plugins/cache/plugins/personal___demo-plugin___1.2.0');
    expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('one\n');
    expect(JSON.parse(readFileSync(join(target, '.plgnz-install.json'), 'utf8')).source).toBe(incoming.resolved.sourceUri);
    expect(readFileSync(join(root, '.omp/marketplaces.json'), 'utf8')).toContain('user');
    expect(omp.listInstalled().find(plugin => plugin.id === 'demo-plugin@personal')?.path).toBe(target);
  }));
  test('is unchanged for equal bytes and refreshes changed same-version content', async () => isolated(async root => {
    const incoming = fixture(); await ompWriter.add(incoming.plugin, incoming.resolved); expect(await ompWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
    const target = join(root, '.omp/plugins/cache/plugins/personal___demo-plugin___1.2.0');
    const lock = join(root, '.omp/plugins/omp-plugins.lock.json');
    writeFileSync(lock, JSON.stringify({ plugins: { 'demo-plugin': { version: '1.2.0', enabled: false, userSetting: 'keep' } } }));
    expect(await ompWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
    expect(JSON.parse(readFileSync(lock, 'utf8')).plugins['demo-plugin']).toEqual({ version: '1.2.0', enabled: true, userSetting: 'keep' });
    expect(readdirSync(join(root, '.omp/plugins/cache/plugins')).some(name => name.startsWith('.plgnz-omp-stage-'))).toBe(false);
    writeFileSync(join(incoming.plugin.dir, 'resources/value.txt'), 'two\n'); incoming.plugin.contentFingerprint = 'two'; await ompWriter.add(incoming.plugin, incoming.resolved);
    expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('two\n');
  }));
  test('fails unsupported invocation policy before dry-run creates a store', async () => isolated(async root => {
    const incoming = fixture({ 'skills/manual/SKILL.md': '---\nname: manual\ndescription: manual\ndisable-model-invocation: true\n---\nbody\n' });
    expect((await failure(() => ompWriter.add(incoming.plugin, incoming.resolved, { dryRun: true }))).message).toContain('disable-model-invocation'); expect(existsSync(join(root, '.omp/plugins'))).toBe(false);
  }));
  test('refuses an unowned collision, retains old content on stage failure, and removes only marked copy', async () => isolated(async root => {
    const incoming = fixture(); const target = join(root, '.omp/plugins/cache/plugins/personal___demo-plugin___1.2.0'); writeFiles(target, { 'foreign.txt': 'keep\n' });
    expect((await failure(() => ompWriter.add(incoming.plugin, incoming.resolved))).message).toContain('unowned'); expect(readFileSync(join(target, 'foreign.txt'), 'utf8')).toBe('keep\n'); rmSync(target, { recursive: true, force: true });
    await ompWriter.add(incoming.plugin, incoming.resolved); writeFileSync(join(incoming.plugin.dir, 'plugin.json'), '{bad'); incoming.plugin.contentFingerprint = 'bad'; await failure(() => ompWriter.add(incoming.plugin, incoming.resolved));
    expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('one\n'); writeFiles(join(root, '.omp/plugins/cache/plugins/personal___foreign___1.0.0'), { 'foreign.txt': 'keep\n' }); await ompWriter.remove('demo-plugin@personal');
    expect(existsSync(target)).toBe(false); expect(existsSync(join(root, '.omp/plugins/cache/plugins/personal___foreign___1.0.0'))).toBe(true);
  }));
  test('refuses unverified commands before activation and compares binary resource bytes', async () => isolated(async root => {
    const commands = fixture({ 'commands/example.toml': 'name = "example"\n' });
    expect((await failure(() => ompWriter.add(commands.plugin, commands.resolved))).message).toContain('command conversion/lifecycle');
    expect(existsSync(join(root, '.omp/plugins'))).toBe(false);
    const incoming = fixture({ 'resources/value.bin': '\uFFFD' }); await ompWriter.add(incoming.plugin, incoming.resolved);
    const writeBytes = writeFileSync as unknown as (path: string, data: Uint8Array) => void;
    writeBytes(join(incoming.plugin.dir, 'resources/value.bin'), new Uint8Array([0xfe])); incoming.plugin.contentFingerprint = 'binary-two';
    await ompWriter.add(incoming.plugin, incoming.resolved);
    const target = join(root, '.omp/plugins/cache/plugins/personal___demo-plugin___1.2.0/resources/value.bin');
    const raw = readFileSync as unknown as (path: string) => Uint8Array;
    expect(Array.from(raw(target))).toEqual([0xfe]);
  }));
  test('rolls back an earlier owned path when a later remove move fails', async () => isolated(async root => {
    const incoming = fixture(); await ompWriter.add(incoming.plugin, incoming.resolved);
    const target = join(root, '.omp/plugins/cache/plugins/personal___demo-plugin___1.2.0'); const registry = join(root, '.omp/plugins/installed_plugins.json');
    const document = JSON.parse(readFileSync(registry, 'utf8')); document.plugins['demo-plugin@personal'].push({ ...document.plugins['demo-plugin@personal'][0] }); writeFileSync(registry, JSON.stringify(document));
    await failure(() => ompWriter.remove('demo-plugin@personal'));
    expect(existsSync(target)).toBe(true); expect(JSON.parse(readFileSync(registry, 'utf8'))).toEqual(document);
  }));
});
