import { describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { projectPluginForCodex } from '../src/conversion';
import { writeFiles } from './util';

const fixtureRoot = join(import.meta.dir, 'fixtures', 'addy-conversion');
const commandNames = ['build', 'code-simplify', 'constraints', 'plan', 'review', 'ship', 'spec', 'test', 'webperf'];
const originalSkillNames = ['api-and-interface-design', 'browser-testing-with-devtools', 'ci-cd-and-automation', 'code-review-and-quality', 'code-simplification', 'constraint-driven-development', 'context-engineering', 'debugging-and-error-recovery', 'deprecation-and-migration', 'documentation-and-adrs', 'doubt-driven-development', 'frontend-ui-engineering', 'git-workflow-and-versioning', 'idea-refine', 'incremental-implementation', 'interview-me', 'observability-and-instrumentation', 'performance-optimization', 'planning-and-task-breakdown', 'security-and-hardening', 'shipping-and-launch', 'source-driven-development', 'spec-driven-development', 'test-driven-development', 'using-agent-skills'];

function addyFixture(): { source: string; originalSkills: Record<string, string> } {
  const source = mkdtempSync(join(tmpdir(), 'plgnz-addy-source-'));
  cpSync(fixtureRoot, source, { recursive: true });
  const originals: Record<string, string> = {};
  for (const name of originalSkillNames) {
    const body = `---\nname: ${name}\ndescription: Original ${name}\n---\nOriginal body for ${name}.\n`;
    originals[`skills/${name}/SKILL.md`] = body;
  }
  const remainingCommands = Object.fromEntries(commandNames.filter(name => name !== 'plan').map(name => [`.claude/commands/${name}.md`, `---\ndescription: ${name} command\n---\nInvoke the addy:${name} skill.\n$ARGUMENTS\n`]));
  writeFiles(source, { ...originals, ...remainingCommands, 'resources/keep.md': 'plugin resource\n' });
  return { source, originalSkills: originals };
}

function destination(): string {
  return mkdtempSync(join(tmpdir(), 'plgnz-conversion-destination-'));
}

describe('projectPluginForCodex', () => {
  test('projects the pinned Addy command dialect into nine manual skills while preserving all 25 originals byte-for-byte', () => {
    const { source, originalSkills } = addyFixture();
    const dest = destination();
    projectPluginForCodex(source, dest);

    expect(readdirSync(join(dest, 'skills'))).toHaveLength(34);
    for (const [path, body] of Object.entries(originalSkills)) expect(readFileSync(join(dest, path), 'utf8')).toBe(body);
    for (const name of commandNames) expect(readFileSync(join(dest, 'skills', name, 'agents/openai.yaml'), 'utf8')).toContain('allow_implicit_invocation: false');
    const plan = readFileSync(join(dest, 'skills/plan/SKILL.md'), 'utf8');
    expect(plan).toContain('Break work into small verifiable tasks with acceptance criteria and dependency ordering');
    expect(plan).toContain('Invoke the addy:planning-and-task-breakdown skill.');
    expect(plan).toContain('tasks/plan.md');
    expect(plan).toContain('../<skill>/SKILL.md');
    expect(plan).toContain('../../agents/<persona>.md');
    expect(readFileSync(join(dest, 'skills/build/SKILL.md'), 'utf8')).toContain('disable-model-invocation: true');
    expect(readFileSync(join(source, '.claude/commands/plan.md'), 'utf8')).toContain('addy:planning-and-task-breakdown');
    expect(readFileSync(join(dest, 'resources/keep.md'), 'utf8')).toBe('plugin resource\n');
  });

  test('uses one complete command dialect and leaves prose and unknown external namespaces untouched', () => {
    const source = mkdtempSync(join(tmpdir(), 'plgnz-conversion-dialect-'));
    writeFiles(source, {
      'plugin.json': '{"name":"fixture"}',
      '.claude/commands/run.md': '---\ndescription: Run\ndisable-model-invocation: false\n---\nUse /run, check:fast and foreign:skill.\n',
      'commands/other.md': '---\ndescription: Must not select\n---\nbody\n',
      'commands/run.toml': 'description = "Must not select"\nprompt = "body"\n',
    });
    const dest = destination();
    projectPluginForCodex(source, dest);
    const skill = readFileSync(join(dest, 'skills/run/SKILL.md'), 'utf8');
    expect(skill).toContain('$fixture:run, check:fast and foreign:skill');
    expect(skill).toContain('disable-model-invocation: false');
    expect(readFileSync(join(dest, 'skills/run/agents/openai.yaml'), 'utf8')).toContain('allow_implicit_invocation: true');
    expect(existsSync(join(dest, 'skills/other'))).toBe(false);
  });

  test('refuses collisions, unsupported handlers, symlinks, and non-empty destinations', () => {
    const cases: Array<{ files: Record<string, string>; message: string; symlink?: boolean; occupied?: boolean }> = [
      { files: { 'plugin.json': '{"name":"fixture"}', '.claude/commands/run.md': '---\ndescription: Run\n---\nbody\n', 'skills/run/SKILL.md': '---\nname: run\ndescription: Other\n---\nother body\n' }, message: 'collision' },
      { files: { 'plugin.json': '{"name":"fixture"}', '.claude/commands/run.md': '---\ndescription: Run\nallowed-tools: Bash\n---\nbody\n' }, message: 'permission semantics' },
      { files: { 'plugin.json': '{"name":"fixture"}', '.claude/commands/run.md': '---\ndescription: Run\nuser-invocable: false\n---\nbody\n' }, message: 'user-invocable: false' },
      { files: { 'plugin.json': '{"name":"fixture"}', '.claude/commands/run.md': '---\ndescription: Run\n---\nbody\n' }, message: 'symlink', symlink: true },
      { files: { 'plugin.json': '{"name":"fixture"}', '.claude/commands/run.md': '---\ndescription: Run\n---\nbody\n' }, message: 'must be empty', occupied: true },
    ];
    for (const item of cases) {
      const source = mkdtempSync(join(tmpdir(), 'plgnz-conversion-refusal-'));
      writeFiles(source, item.files);
      if (item.symlink) spawnSync('ln', ['-s', '/etc/hosts', join(source, 'linked')]);
      const dest = destination();
      if (item.occupied) writeFiles(dest, { 'old.txt': 'stale' });
      expectThrow(() => projectPluginForCodex(source, dest), item.message);
    }
  });

  test('normalizes either policy spelling and rejects ambiguous command and malformed native sidecar policy', () => {
    const markdown = mkdtempSync(join(tmpdir(), 'plgnz-conversion-policy-markdown-'));
    writeFiles(markdown, { 'plugin.json': '{"name":"fixture"}', '.claude/commands/run.md': '---\ndescription: Run\ndisable_model_invocation: false\n---\nbody\n' });
    const markdownDest = destination();
    projectPluginForCodex(markdown, markdownDest);
    expect(readFileSync(join(markdownDest, 'skills/run/agents/openai.yaml'), 'utf8')).toContain('allow_implicit_invocation: true');

    const toml = mkdtempSync(join(tmpdir(), 'plgnz-conversion-policy-toml-'));
    writeFiles(toml, { 'plugin.json': '{"name":"fixture"}', 'commands/run.toml': 'description = "Run"\nprompt = "body"\nuser-invocable = false\n' });
    expectThrow(() => projectPluginForCodex(toml, destination()), 'user-invocable: false');

    const conflicting = mkdtempSync(join(tmpdir(), 'plgnz-conversion-policy-conflict-'));
    writeFiles(conflicting, { 'plugin.json': '{"name":"fixture"}', '.claude/commands/run.md': '---\ndescription: Run\ndisable-model-invocation: true\ndisable_model_invocation: false\n---\nbody\n' });
    expectThrow(() => projectPluginForCodex(conflicting, destination()), 'conflicting command metadata spellings');

    const malformed = mkdtempSync(join(tmpdir(), 'plgnz-conversion-sidecar-'));
    writeFiles(malformed, { 'plugin.json': '{"name":"fixture"}', 'skills/manual/SKILL.md': '---\nname: manual\ndescription: Manual\ndisable-model-invocation: true\n---\nbody\n', 'skills/manual/agents/openai.yaml': 'policy: []\n' });
    expectThrow(() => projectPluginForCodex(malformed, destination()), 'invalid Codex invocation policy');
  });

  test('supports the standard nested Agent Plugins manifest', () => {
    const source = mkdtempSync(join(tmpdir(), 'plgnz-conversion-dot-plugin-'));
    writeFiles(source, { '.plugin/plugin.json': '{"name":"fixture","version":"1.2.3","description":"Fixture"}' });
    const dest = destination();
    projectPluginForCodex(source, dest);
    expect(JSON.parse(readFileSync(join(dest, '.plugin/plugin.json'), 'utf8')).version).toBe('1.2.3');
  });

  test('projects a native-only Claude manifest without materializing a replacement manifest', () => {
    const source = mkdtempSync(join(tmpdir(), 'plgnz-conversion-native-'));
    const nativeManifest = '{"name":"superpowers","version":"6.4.1","description":"Native source","nativeOnly":true,"commands":["./.claude/commands/run.md"],"skills":"./skills/"}';
    writeFiles(source, {
      '.claude-plugin/plugin.json': nativeManifest,
      '.claude/commands/run.md': '---\ndescription: Run\n---\nUse /run.\n',
      'skills/native/SKILL.md': '---\nname: native\ndescription: Native skill\n---\nbody\n',
    });
    const dest = destination();
    projectPluginForCodex(source, dest);
    expect(readFileSync(join(dest, 'skills/run/SKILL.md'), 'utf8')).toContain('$superpowers:run');
    expect(readFileSync(join(dest, 'skills/native/SKILL.md'), 'utf8')).toContain('Native skill');
    expect(existsSync(join(dest, 'plugin.json'))).toBe(false);
    expect(existsSync(join(dest, '.plugin/plugin.json'))).toBe(false);
    expect(readFileSync(join(source, '.claude-plugin/plugin.json'), 'utf8')).toBe(nativeManifest);
    expect(readFileSync(join(dest, '.claude-plugin/plugin.json'), 'utf8')).toBe(nativeManifest);
  });

  test('rejects Claude-native behavior that Codex conversion cannot preserve', () => {
    for (const manifest of [
      { name: 'fixture', commands: ['./custom/run.md'] },
      { name: 'fixture', hooks: './hooks.json' },
    ]) {
      const source = mkdtempSync(join(tmpdir(), 'plgnz-conversion-native-refusal-'));
      writeFiles(source, {
        '.claude-plugin/plugin.json': JSON.stringify(manifest),
        'custom/run.md': '---\ndescription: Run\n---\nbody\n',
        'hooks.json': '{}',
      });
      expectThrow(() => projectPluginForCodex(source, destination()), 'unsupported for Codex conversion');
    }
  });
});

function expectThrow(fn: () => void, message: string): void {
  try {
    fn();
    throw new Error('expected function to throw');
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(message);
  }
}
