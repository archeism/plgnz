import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hermes } from '../src/hosts/hermes';
import { hermesWriter } from '../src/hosts/hermes-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { writeFiles } from './util';

declare const Bun: { YAML: { parse(input: string): unknown } };

function fixture(files: Record<string, string> = {}): { plugin: PluginSource; resolved: ResolvedSource } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-hermes-source-'));
  const dir = join(root, 'plugins', 'demo-plugin');
  writeFiles(dir, {
    'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo-plugin","version":"1.2.0","description":"demo"}',
    'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary skill\n---\nordinary body\n',
    'references/guide.md': 'resource\n',
    ...files,
  });
  const plugin: PluginSource = { dir, name: 'demo-plugin', marketplace: 'personal', contentFingerprint: 'one' };
  return { plugin, resolved: { sourceUri: root, sha: 'fixture', isGit: false, plugins: [plugin] } };
}

async function isolated(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-hermes-home-'));
  const previous = process.env.OPEN_PLUGIN_HERMES_ROOT;
  process.env.OPEN_PLUGIN_HERMES_ROOT = join(root, '.hermes');
  try { await run(root); }
  finally {
    if (previous === undefined) delete process.env.OPEN_PLUGIN_HERMES_ROOT; else process.env.OPEN_PLUGIN_HERMES_ROOT = previous;
    rmSync(root, { recursive: true, force: true });
  }
}

async function failure(run: () => Promise<unknown>): Promise<Error> {
  try { await run(); } catch (error) { return error as Error; }
  throw new Error('expected failure');
}

describe('Hermes native portable-plugin lifecycle', () => {
  test('installs an ordinary portable package, preserves resources, and reads enabled state', async () => isolated(async root => {
    const incoming = fixture({ 'mcp.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json","mcpServers":{"demo":{"type":"stdio","command":"demo-bin","args":["serve"]}}}' });
    writeFiles(join(root, '.hermes'), { 'config.yaml': 'model: preserved\nplugins:\n  disabled:\n    - stale\n' });
    await hermesWriter.add(incoming.plugin, incoming.resolved);
    const target = join(root, '.hermes', 'plugins', 'demo-plugin');
    expect(readFileSync(join(target, 'skills/ordinary/SKILL.md'), 'utf8')).toContain('ordinary body');
    expect(readFileSync(join(target, 'references/guide.md'), 'utf8')).toBe('resource\n');
    expect(readFileSync(join(root, '.hermes', 'config.yaml'), 'utf8')).toContain('model: preserved');
    expect(readFileSync(join(root, '.hermes', 'plugins/demo-plugin.plgnz-commands/__init__.py'), 'utf8')).toContain('register_system_prompt_section');
    const installed = hermes.listInstalled();
    expect(installed).toHaveLength(1);
    expect(installed[0]?.id).toBe('demo-plugin@personal');
    expect(installed[0]?.marketplace).toBe('personal');
    expect(installed[0]?.path).toBe(target);
    expect(installed[0]?.enabled).toBe(true);
    expect(installed[0]?.contentRoots).toEqual({ package: target, commands: join(root, '.hermes', 'plugins/demo-plugin.plgnz-commands') });
    expect(hermes.mcpEntries()[0]?.name).toBe('demo');
    expect(hermes.mcpEntries()[0]?.pluginId).toBe('demo-plugin@personal');
    expect(hermes.mcpEntries()[0]?.command).toBe('demo-bin');
    expect(hermes.mcpEntries()[0]?.args).toEqual(['serve']);
    const pin = await hermesWriter.pin(installed[0]!, { dryRun: true });
    expect(pin.refusals[0]?.server).toBe('demo'); expect(pin.refusals[0]?.command).toBe('demo-bin');
  }));

  test('is unchanged on equal bytes and refreshes changed same-version bytes', async () => isolated(async root => {
    const incoming = fixture();
    await hermesWriter.add(incoming.plugin, incoming.resolved);
    expect(await hermesWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
    writeFileSync(join(incoming.plugin.dir, 'references/guide.md'), 'updated\n'); incoming.plugin.contentFingerprint = 'two';
    await hermesWriter.add(incoming.plugin, incoming.resolved);
    expect(readFileSync(join(root, '.hermes', 'plugins/demo-plugin/references/guide.md'), 'utf8')).toBe('updated\n');
  }));

  test('installs prompt commands through the owned native companion and removes both owned roots', async () => isolated(async root => {
    const incoming = fixture(); const target = join(root, '.hermes', 'plugins', 'demo-plugin');
    writeFiles(join(incoming.plugin.dir, 'commands'), { 'run.toml': 'description = "Run"\nprompt = "body $ARGUMENTS"\n' });
    await hermesWriter.add(incoming.plugin, incoming.resolved);
    const companion = join(root, '.hermes', 'plugins', 'demo-plugin.plgnz-commands');
    expect(readFileSync(join(companion, '__init__.py'), 'utf8')).toContain('ctx.inject_message(prompt)');
    expect(readFileSync(join(companion, '__init__.py'), 'utf8')).toContain('demo-plugin:run');
    expect(readFileSync(join(companion, '__init__.py'), 'utf8')).toContain('return None');
    writeFiles(join(root, '.hermes', 'plugins', 'foreign'), { 'plugin.json': '{"name":"foreign"}' });
    await hermesWriter.remove('demo-plugin@personal');
    expect(existsSync(target)).toBe(false);
    expect(existsSync(companion)).toBe(false);
    expect(existsSync(join(root, '.hermes', 'plugins', 'foreign'))).toBe(true);
  }));

  test('projects user-only skills to private package content and namespaced native commands', async () => isolated(async root => {
    const incoming = fixture({ 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary skill\ndisable-model-invocation: true\n---\nbody\n' });
    await hermesWriter.add(incoming.plugin, incoming.resolved);
    const installed = join(root, '.hermes', 'plugins', 'demo-plugin');
    expect(existsSync(join(installed, 'skills/ordinary'))).toBe(false);
    expect(readFileSync(join(installed, '.plgnz-user-skills/ordinary/SKILL.md'), 'utf8')).toContain('disable-model-invocation: true');
    expect(readFileSync(join(root, '.hermes', 'plugins/demo-plugin.plgnz-commands/__init__.py'), 'utf8')).toContain('demo-plugin:ordinary');
    await hermesWriter.remove('demo-plugin@personal');
    const target = join(root, '.hermes', 'plugins', 'demo-plugin');
    writeFiles(target, { 'plugin.json': '{"name":"demo-plugin"}', 'foreign.txt': 'keep\n' });
    const normal = fixture(); normal.resolved.sourceUri = incoming.resolved.sourceUri;
    expect((await failure(() => hermesWriter.add(normal.plugin, normal.resolved))).message).toContain('unowned');
    expect(readFileSync(join(target, 'foreign.txt'), 'utf8')).toBe('keep\n');
  }));

  test('recognizes sidecar-only user-only policy and preserves a profile config symlink and mode', async () => isolated(async root => {
    const userOnly = fixture({ 'skills/ordinary/agents/openai.yaml': 'policy:\n  allow_implicit_invocation: false\n' });
    expect(await hermesWriter.add(userOnly.plugin, userOnly.resolved, { dryRun: true })).toBeUndefined();
    const configDir = join(root, 'profile');
    writeFiles(configDir, { 'actual.yaml': 'model: preserved\nplugins:\n  "enabled":\n  - existing\n  disabled: []\n  entries:\n    existing:\n      settings:\n        value: keep\n' });
    chmodSync(join(configDir, 'actual.yaml'), 0o640);
    symlinkSync(join(configDir, 'actual.yaml'), join(configDir, 'config-link.yaml'));
    writeFiles(join(root, '.hermes'), { '.keep': '' });
    symlinkSync(join(configDir, 'config-link.yaml'), join(root, '.hermes', 'config.yaml'));
    const previous = process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH;
    process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH = join(configDir, 'config-link.yaml');
    const normal = fixture();
    try { await hermesWriter.add(normal.plugin, normal.resolved); }
    finally { if (previous === undefined) delete process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH; else process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH = previous; }
    expect(lstatSync(join(configDir, 'config-link.yaml')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(root, '.hermes', 'config.yaml')).isSymbolicLink()).toBe(true);
    expect((statSync(join(configDir, 'actual.yaml')) as unknown as { mode: number }).mode & 0o777).toBe(0o640);
    const config = readFileSync(join(configDir, 'actual.yaml'), 'utf8');
    expect(config).toContain('model: preserved'); expect(config).toContain('value: keep'); expect(config).toContain('demo-plugin.plgnz-commands');
  }));

  test('refuses a config override Hermes itself will not read before plugin mutation', async () => isolated(async root => {
    const incoming = fixture(); const separate = join(root, 'separate.yaml');
    writeFileSync(separate, 'model: unused\n');
    const previous = process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH;
    process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH = separate;
    try { expect((await failure(() => hermesWriter.add(incoming.plugin, incoming.resolved))).message).toContain('must already resolve to the same file'); }
    finally { if (previous === undefined) delete process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH; else process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH = previous; }
    expect(existsSync(join(root, '.hermes', 'plugins'))).toBe(false);
  }));

  test('does not remove or disable a foreign companion occupying the deterministic id', async () => isolated(async root => {
    const incoming = fixture(); await hermesWriter.add(incoming.plugin, incoming.resolved);
    const companion = join(root, '.hermes', 'plugins/demo-plugin.plgnz-commands');
    writeFileSync(join(companion, '.plgnz-install.json'), JSON.stringify({ source: '/foreign', pluginId: 'demo-plugin@personal', fingerprint: 'one' }));
    await hermesWriter.remove('demo-plugin@personal');
    expect(existsSync(companion)).toBe(true);
    const config = Bun.YAML.parse(readFileSync(join(root, '.hermes/config.yaml'), 'utf8')) as { plugins: { enabled: string[]; disabled: string[] } };
    expect(config.plugins.enabled).toContain('demo-plugin.plgnz-commands');
    expect(config.plugins.disabled.includes('demo-plugin.plgnz-commands')).toBe(false);
  }));

  test('rolls both active roots back when config activation fails after staged swaps', async () => isolated(async root => {
    const incoming = fixture();
    writeFiles(join(incoming.plugin.dir, 'commands'), { 'run.toml': 'description = "Run"\nprompt = "old $ARGUMENTS"\n' });
    await hermesWriter.add(incoming.plugin, incoming.resolved);
    const target = join(root, '.hermes/plugins/demo-plugin'); const companion = join(root, '.hermes/plugins/demo-plugin.plgnz-commands');
    const oldPackage = readFileSync(join(target, 'references/guide.md'), 'utf8');
    const oldCompanion = readFileSync(join(companion, '__init__.py'), 'utf8');
    writeFileSync(join(incoming.plugin.dir, 'references/guide.md'), 'new bytes\n');
    writeFileSync(join(incoming.plugin.dir, 'commands/run.toml'), 'description = "Run"\nprompt = "new $ARGUMENTS"\n');
    incoming.plugin.contentFingerprint = 'changed';
    const badConfig = 'plugins: invalid\nmodel: preserved\n';
    writeFileSync(join(root, '.hermes/config.yaml'), badConfig);
    expect((await failure(() => hermesWriter.add(incoming.plugin, incoming.resolved))).message).toContain('plugins config is not a mapping');
    expect(readFileSync(join(target, 'references/guide.md'), 'utf8')).toBe(oldPackage);
    expect(readFileSync(join(companion, '__init__.py'), 'utf8')).toBe(oldCompanion);
    expect(readFileSync(join(root, '.hermes/config.yaml'), 'utf8')).toBe(badConfig);
  }));

  test('refuses a foreign companion conflict before changing the package or config', async () => isolated(async root => {
    const incoming = fixture(); await hermesWriter.add(incoming.plugin, incoming.resolved);
    const target = join(root, '.hermes/plugins/demo-plugin'); const companion = join(root, '.hermes/plugins/demo-plugin.plgnz-commands');
    writeFileSync(join(companion, '.plgnz-install.json'), JSON.stringify({ source: '/foreign', pluginId: 'demo-plugin@personal', fingerprint: 'one' }));
    const oldPackage = readFileSync(join(target, 'references/guide.md'), 'utf8');
    const oldCompanion = readFileSync(join(companion, '__init__.py'), 'utf8');
    const oldConfig = readFileSync(join(root, '.hermes/config.yaml'), 'utf8');
    writeFileSync(join(incoming.plugin.dir, 'references/guide.md'), 'new bytes\n'); incoming.plugin.contentFingerprint = 'changed';
    expect((await failure(() => hermesWriter.add(incoming.plugin, incoming.resolved))).message).toContain('belongs to another source');
    expect(readFileSync(join(target, 'references/guide.md'), 'utf8')).toBe(oldPackage);
    expect(readFileSync(join(companion, '__init__.py'), 'utf8')).toBe(oldCompanion);
    expect(readFileSync(join(root, '.hermes/config.yaml'), 'utf8')).toBe(oldConfig);
  }));
});
