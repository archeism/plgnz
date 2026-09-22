import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pi } from '../src/hosts/pi';
import { piWriter } from '../src/hosts/pi-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { writeFiles } from './util';

function fixture(files: Record<string, string> = {}): { plugin: PluginSource; resolved: ResolvedSource } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-pi-source-')); const dir = join(root, 'demo');
  writeFiles(dir, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'resources/plugin-value.txt': 'plugin\n', 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary skill\n---\nRead ../manual/shared.txt and ../../resources/plugin-value.txt\n', 'skills/ordinary/resources/value.txt': 'one\n', 'skills/manual/SKILL.md': '---\nname: manual\ndescription: manual skill\ndisable-model-invocation: true\n---\nManual body\n', 'skills/manual/shared.txt': 'sibling\n', ...files });
  const plugin: PluginSource = { dir, name: 'demo', marketplace: 'market', contentFingerprint: 'one' };
  return { plugin, resolved: { sourceUri: root, sha: 'same-revision', isGit: false, plugins: [plugin] } };
}

async function isolated(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-pi-home-')); const old = process.env.OPEN_PLUGIN_PI_ROOT;
  process.env.OPEN_PLUGIN_PI_ROOT = join(root, '.pi', 'agent');
  try { await run(root); } finally { if (old === undefined) delete process.env.OPEN_PLUGIN_PI_ROOT; else process.env.OPEN_PLUGIN_PI_ROOT = old; rmSync(root, { recursive: true, force: true }); }
}
async function fails(fn: () => Promise<unknown>): Promise<Error> { try { await fn(); } catch (error) { return error as Error; } throw new Error('expected failure'); }

describe('Pi standalone-skill lifecycle', () => {
  test('namespaces skills, preserves Pi explicit-only policy/resources, and refreshes same-version bytes', async () => isolated(async root => {
    const incoming = fixture(); await piWriter.add(incoming.plugin, incoming.resolved);
    const skills = join(root, '.pi', 'agent', 'skills'); const pkg = join(skills, 'market___demo'); const ordinary = join(pkg, 'skills', 'ordinary'); const manual = join(pkg, 'skills', 'manual');
    expect(readFileSync(join(ordinary, 'SKILL.md'), 'utf8')).toContain('name: demo-ordinary');
    expect(readFileSync(join(ordinary, 'resources/value.txt'), 'utf8')).toBe('one\n');
    expect(readFileSync(join(pkg, 'skills/manual/shared.txt'), 'utf8')).toBe('sibling\n');
    expect(readFileSync(join(pkg, 'resources/plugin-value.txt'), 'utf8')).toBe('plugin\n');
    expect(readFileSync(join(manual, 'SKILL.md'), 'utf8')).toContain('disable-model-invocation: true');
    expect(pi.listInstalled().filter(item => item.id === 'demo@market')).toHaveLength(1);
    expect(await piWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
    writeFileSync(join(incoming.plugin.dir, 'skills/ordinary/resources/value.txt'), 'two\n'); incoming.plugin.contentFingerprint = 'two';
    await piWriter.add(incoming.plugin, incoming.resolved);
    expect(readFileSync(join(ordinary, 'resources/value.txt'), 'utf8')).toBe('two\n');
    expect(readdirSync(join(root, '.pi', 'agent')).some(name => name.startsWith('.plgnz-pi-stage-'))).toBe(false);
  }));

  test('validates before activation and dry-run makes no active writes', async () => isolated(async root => {
    const incoming = fixture({ 'commands/run.md': '---\ndescription: run\n---\n$ARGUMENTS\n' });
    await piWriter.add(incoming.plugin, incoming.resolved, { dryRun: true });
    expect(existsSync(join(root, '.pi', 'agent', 'skills'))).toBe(false);
    const valid = fixture(); await piWriter.add(valid.plugin, valid.resolved); const target = join(root, '.pi', 'agent', 'skills', 'market___demo', 'skills', 'ordinary', 'SKILL.md'); const before = readFileSync(target, 'utf8');
    writeFileSync(join(valid.plugin.dir, 'skills/ordinary/SKILL.md'), '---\nname: ordinary\n---\nmissing description\n'); valid.plugin.contentFingerprint = 'invalid';
    await fails(() => piWriter.add(valid.plugin, valid.resolved)); expect(readFileSync(target, 'utf8')).toBe(before);
    writeFileSync(join(valid.plugin.dir, 'skills/ordinary/SKILL.md'), '---\nname: ordinary\ndescription: restored\n---\nnew bytes\n'); valid.plugin.contentFingerprint = 'dry'; await piWriter.add(valid.plugin, valid.resolved, { dryRun: true }); expect(readFileSync(target, 'utf8')).toBe(before);
  }));

  test('refuses user ownership collisions and removes only the complete owned representation', async () => isolated(async root => {
    const incoming = fixture(); const skills = join(root, '.pi', 'agent', 'skills'); const foreign = join(skills, 'market___demo'); mkdirSync(foreign, { recursive: true }); writeFileSync(join(foreign, 'SKILL.md'), '---\ndescription: user\n---\nkeep\n');
    expect((await fails(() => piWriter.add(incoming.plugin, incoming.resolved))).message).toContain('unowned'); expect(readFileSync(join(foreign, 'SKILL.md'), 'utf8')).toContain('keep');
    rmSync(foreign, { recursive: true }); await piWriter.add(incoming.plugin, incoming.resolved); mkdirSync(join(skills, 'unrelated'), { recursive: true }); writeFileSync(join(skills, 'unrelated', 'SKILL.md'), '---\ndescription: keep\n---\n');
    await piWriter.remove('demo@market'); expect(existsSync(join(skills, 'market___demo'))).toBe(false); expect(existsSync(join(skills, 'unrelated'))).toBe(true);
  }));

  test('refuses malformed owned markers and symlinked host paths before active writes', async () => isolated(async root => {
    const incoming = fixture(); const skills = join(root, '.pi', 'agent', 'skills'); const pkg = join(skills, 'market___demo'); mkdirSync(pkg, { recursive: true }); writeFileSync(join(pkg, '.plgnz-install.json'), '{bad');
    expect((await fails(() => piWriter.add(incoming.plugin, incoming.resolved))).message).toContain('invalid Pi ownership marker');
    rmSync(join(root, '.pi'), { recursive: true }); mkdirSync(root, { recursive: true }); const link = join(root, '.pi'); const outside = join(root, 'outside'); mkdirSync(outside); expect(spawnSync('ln', ['-s', outside, link]).status).toBe(0);
    expect((await fails(() => piWriter.add(incoming.plugin, incoming.resolved))).message).toContain('symlink'); expect(existsSync(join(outside, 'agent', 'skills'))).toBe(false);
  }));

  test('refuses remove when a managed .pi component is redirected and preserves the owned package', async () => isolated(async root => {
    const incoming = fixture(); await piWriter.add(incoming.plugin, incoming.resolved);
    const live = join(root, '.pi'); const outside = join(root, 'outside-pi'); renameSync(live, outside);
    expect(spawnSync('ln', ['-s', outside, live]).status).toBe(0);
    expect((await fails(() => piWriter.remove('demo@market'))).message).toContain('symlink');
    expect(existsSync(join(outside, 'agent', 'skills', 'market___demo', '.plgnz-install.json'))).toBe(true);
  }));
});
