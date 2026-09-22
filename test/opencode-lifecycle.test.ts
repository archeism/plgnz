import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { opencode } from '../src/hosts/opencode';
import { opencodeWriter } from '../src/hosts/opencode-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { writeFiles } from './util';

function fixture(extra: Record<string, string> = {}): { plugin: PluginSource; resolved: ResolvedSource } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-opencode-source-'));
  const dir = join(root, 'demo');
  writeFiles(dir, {
    'plugin.json': '{"name":"demo","version":"1.0.0"}',
    'resources/value.txt': 'kept\n',
    'resources/persona.md': 'persona\n',
    'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\nRead ../../resources/persona.md\n',
    'skills/manual/SKILL.md': '---\nname: manual\ndescription: manual\ndisable-model-invocation: true\n---\nRead ../ordinary/SKILL.md\nmanual body $ARGUMENTS\n',
    '.claude/commands/run.md': '---\n# command comment\ndescription: |\n  Run\n  exact\n---\nrun $1\n/helper\n',
    '.claude/commands/helper.md': '---\ndescription: Helper\n---\nhelper $ARGUMENTS\n',
    '.claude/commands/nested/tool.md': '---\ndescription: Nested\n---\nnested $ARGUMENTS\n',
    '.claude/commands/references/nested.txt': 'nested\n',
    ...extra,
  });
  const plugin: PluginSource = { dir, name: 'demo', marketplace: 'market', contentFingerprint: 'one' };
  return { plugin, resolved: { sourceUri: root, sha: 'same', isGit: false, plugins: [plugin] } };
}

async function isolated(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-opencode-home-'));
  const old = process.env.OPEN_PLUGIN_OPENCODE_ROOT;
  process.env.OPEN_PLUGIN_OPENCODE_ROOT = join(root, '.config', 'opencode');
  try { await run(root); }
  finally { if (old === undefined) delete process.env.OPEN_PLUGIN_OPENCODE_ROOT; else process.env.OPEN_PLUGIN_OPENCODE_ROOT = old; rmSync(root, { recursive: true, force: true }); }
}

async function fails(fn: () => Promise<unknown>): Promise<Error> { try { await fn(); } catch (error) { return error as Error; } throw new Error('expected failure'); }

describe('OpenCode standalone lifecycle', () => {
  test('stores the full package privately, scans only automatic skills, and projects explicit commands', async () => isolated(async root => {
    const item = fixture();
    await opencodeWriter.add(item.plugin, item.resolved);
    const base = join(root, '.config/opencode');
    const packageName = 'plgnz-m17-6dx61x72x6bx65x74-p11-64x65x6dx6f';
    const privateRoot = join(base, '.plgnz/packages', packageName);
    expect(readFileSync(join(privateRoot, 'resources/value.txt'), 'utf8')).toBe('kept\n');
    expect(existsSync(join(base, 'skills', packageName, 'skills/ordinary/SKILL.md'))).toBe(true);
    expect(readFileSync(join(base, 'skills', packageName, 'resources/persona.md'), 'utf8')).toBe('persona\n');
    expect(existsSync(join(base, 'skills', packageName, 'skills/manual/SKILL.md'))).toBe(false);
    expect(readFileSync(join(base, 'skills', packageName, 'resources/value.txt'), 'utf8')).toBe('kept\n');
    const manual = readFileSync(join(base, 'commands', 'demo', 'manual.md'), 'utf8');
    expect(manual).toContain('manual body $ARGUMENTS');
    expect(manual).toContain(`Base directory for this command: ${privateRoot}/skills/manual`);
    const sourceCommand = readFileSync(join(base, 'commands', 'demo', 'run.md'), 'utf8');
    expect(sourceCommand).toContain('run $1\n');
    expect(sourceCommand).toContain('/demo/helper');
    expect(sourceCommand).toContain(`Base directory for this command: ${privateRoot}/.claude/commands`);
    const nestedCommand = readFileSync(join(base, 'commands', 'demo', 'nested/tool.md'), 'utf8');
    expect(nestedCommand).toContain(`Base directory for this command: ${privateRoot}/.claude/commands/nested`);
    expect(readFileSync(join(privateRoot, '.claude/commands/references/nested.txt'), 'utf8')).toBe('nested\n');
    const installed = opencode.listInstalled(); expect(installed).toHaveLength(1);
    expect(installed[0]?.contentRoots).toEqual({ package: privateRoot, skills: join(base, 'skills', packageName), commands: join(base, 'commands', 'demo') });
    expect(await opencodeWriter.add(item.plugin, item.resolved)).toBe('unchanged');
    await opencodeWriter.remove('demo@market');
    expect(existsSync(privateRoot)).toBe(false);
  }));

  test('retains the active three-path installation when staging fails', async () => isolated(async root => {
    const item = fixture(); await opencodeWriter.add(item.plugin, item.resolved);
    writeFiles(item.plugin.dir, { 'skills/run/SKILL.md': '---\nname: run\ndescription: run\ndisable-model-invocation: true\n---\nchanged\n' });
    item.plugin.contentFingerprint = 'two';
    expect((await fails(() => opencodeWriter.add(item.plugin, item.resolved))).message).toContain('command collision');
    expect(readFileSync(join(root, '.config/opencode/skills/plgnz-m17-6dx61x72x6bx65x74-p11-64x65x6dx6f/skills/ordinary/SKILL.md'), 'utf8')).toContain('ordinary');
  }));

  test('refuses source symlinks before touching the store', async () => isolated(async root => {
    const item = fixture({ 'skills/link/SKILL.md': '---\nname: link\ndescription: link\n---\nbody\n' });
    const { spawnSync } = await import('node:child_process'); spawnSync('ln', ['-s', 'value.txt', join(item.plugin.dir, 'resources/linked.txt')]);
    expect((await fails(() => opencodeWriter.add(item.plugin, item.resolved))).message).toContain('symlink');
    expect(existsSync(join(root, '.config/opencode'))).toBe(false);
  }));

  test('refuses unsupported root components before touching the store', async () => isolated(async root => {
    for (const [path, expected] of [['mcp.json', 'root mcp.json'], ['hooks/check.sh', 'root hooks'], ['.claude/agents/reviewer.md', 'root .claude/agents']] as const) {
      const item = fixture({ [path]: '{}\n' });
      expect((await fails(() => opencodeWriter.add(item.plugin, item.resolved))).message).toContain(expected);
      expect(existsSync(join(root, '.config/opencode'))).toBe(false);
    }
  }));

  test('refuses lost skill invocation policies while retaining ordinary and manual projections', async () => isolated(async root => {
    const ordinary = fixture({ 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\nuser-invocable: false\n---\nbody\n' });
    expect((await fails(() => opencodeWriter.add(ordinary.plugin, ordinary.resolved))).message).toContain('user-invocable: false');
    expect(existsSync(join(root, '.config/opencode'))).toBe(false);
    const invalidManual = fixture({ 'skills/manual/SKILL.md': '---\nname: manual\ndescription: manual\ndisable-model-invocation: "true"\n---\nbody\n' });
    expect((await fails(() => opencodeWriter.add(invalidManual.plugin, invalidManual.resolved))).message).toContain('must be boolean');
    const conflictingManual = fixture({ 'skills/manual/SKILL.md': '---\nname: manual\ndescription: manual\ndisable-model-invocation: true\ndisable_model_invocation: false\n---\nbody\n' });
    expect((await fails(() => opencodeWriter.add(conflictingManual.plugin, conflictingManual.resolved))).message).toContain('conflicting OpenCode policy aliases');
    const valid = fixture(); await opencodeWriter.add(valid.plugin, valid.resolved);
    expect(existsSync(join(root, '.config/opencode/skills/plgnz-m17-6dx61x72x6bx65x74-p11-64x65x6dx6f/skills/ordinary/SKILL.md'))).toBe(true);
    expect(existsSync(join(root, '.config/opencode/commands/demo/manual.md'))).toBe(true);
  }));

  test('rejects unsupported source command dialects before replacing an active copy', async () => isolated(async root => {
    const item = fixture(); await opencodeWriter.add(item.plugin, item.resolved);
    for (const [path, text, expected] of [
      ['.claude/commands/run.toml', 'description = "run"\nprompt = "body"\n', 'TOML'],
      ['.claude/commands/permission.md', '---\ndescription: Permission\nallowed-tools: Bash\n---\nbody\n', 'metadata'],
      ['.claude/commands/hidden.md', '---\ndescription: Hidden\nuser-invocable: false\n---\nbody\n', 'user-invocable'],
      ['.claude/commands/preprocess.md', '---\ndescription: Preprocess\n---\n!`pwd`\n', 'preprocessing'],
    ] as const) {
      writeFiles(item.plugin.dir, { [path]: text }); item.plugin.contentFingerprint = `${path}`;
      expect((await fails(() => opencodeWriter.add(item.plugin, item.resolved))).message).toContain(expected);
      rmSync(join(item.plugin.dir, path), { force: true });
    }
    expect(readFileSync(join(root, '.config/opencode/commands/demo/run.md'), 'utf8')).toContain('run $1');
  }));

  test('uses injective package identities for distinct marketplace/plugin pairs', async () => isolated(async () => {
    const first = fixture(), second = fixture();
    first.plugin.marketplace = 'a'; first.plugin.name = 'bc';
    second.plugin.marketplace = 'ab'; second.plugin.name = 'c';
    await opencodeWriter.add(first.plugin, first.resolved);
    await opencodeWriter.add(second.plugin, second.resolved);
    expect(opencode.listInstalled().map(item => item.id).sort()).toEqual(['bc@a', 'c@ab']);
  }));

  test('rolls back an update after private and skill targets have moved', async () => isolated(async root => {
    const item = fixture(); await opencodeWriter.add(item.plugin, item.resolved);
    writeFiles(item.plugin.dir, { 'resources/value.txt': 'changed\n' }); item.plugin.contentFingerprint = 'changed';
    const commandRoot = join(root, '.config/opencode/commands'); chmodSync(commandRoot, 0o500);
    try { expect((await fails(() => opencodeWriter.add(item.plugin, item.resolved))).message).toContain('EACCES'); }
    finally { chmodSync(commandRoot, 0o700); }
    const packageName = 'plgnz-m17-6dx61x72x6bx65x74-p11-64x65x6dx6f';
    expect(readFileSync(join(root, '.config/opencode/.plgnz/packages', packageName, 'resources/value.txt'), 'utf8')).toBe('kept\n');
    expect(readFileSync(join(root, '.config/opencode/skills', packageName, 'resources/value.txt'), 'utf8')).toBe('kept\n');
  }));

  test('rolls back removal after private and skill targets have moved', async () => isolated(async root => {
    const item = fixture(); await opencodeWriter.add(item.plugin, item.resolved);
    const commandRoot = join(root, '.config/opencode/commands'); chmodSync(commandRoot, 0o500);
    try { expect((await fails(() => opencodeWriter.remove('demo@market'))).message).toContain('EACCES'); }
    finally { chmodSync(commandRoot, 0o700); }
    expect(opencode.listInstalled()).toHaveLength(1);
    expect(existsSync(join(root, '.config/opencode/commands/demo/run.md'))).toBe(true);
  }));

  test('refuses a leaf symlink in an owned target before remove', async () => isolated(async root => {
    const item = fixture(); await opencodeWriter.add(item.plugin, item.resolved);
    const { spawnSync } = await import('node:child_process');
    const privateRoot = join(root, '.config/opencode/.plgnz/packages/plgnz-m17-6dx61x72x6bx65x74-p11-64x65x6dx6f');
    spawnSync('ln', ['-s', 'value.txt', join(privateRoot, 'resources/linked.txt')]);
    expect((await fails(() => opencodeWriter.remove('demo@market'))).message).toContain('symlink');
    expect(existsSync(privateRoot)).toBe(true);
  }));
});
