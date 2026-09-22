import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli';
import { claudeCode, hasCurrentClaudeCodeBinary } from '../src/hosts/claude-code';

function scratch(): string { return mkdtempSync(join(tmpdir(), 'plgnz-claude-detect-')); }
function native(root: string, output = '2.1.275 (Claude Code)\n', executable = true): string {
  const binary = join(root, 'claude'); writeFileSync(binary, `#!/bin/sh\nprintf '%b' ${JSON.stringify(output)}\n`); if (executable) chmodSync(binary, 0o755); return binary;
}
function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  return run().finally(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

test('an absent Claude root is present only with an explicit current executable', async () => {
  const root = scratch(), home = join(root, 'home'), source = join(root, 'source');
  try {
    const valid = native(root);
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"1.0.0"}');
    await withEnv({ OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_CLAUDE_CODE_ROOT: join(home, '.claude'), OPEN_PLUGIN_CLAUDE_CODE_BIN: valid }, async () => {
      expect(claudeCode.detect()).toBe(true);
      expect(await main(['add', source, '--target', 'claude-code'])).toBe(0);
      expect(claudeCode.listInstalled().some((plugin) => plugin.name === 'demo')).toBe(true);
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing, non-executable, legacy, and malformed explicit binaries do not make Claude present', async () => {
  const root = scratch(), home = join(root, 'home');
  try {
    const nonExecutable = native(root, '2.1.275 (Claude Code)\n', false);
    for (const binary of [join(root, 'missing'), nonExecutable]) {
      await withEnv({ OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_CLAUDE_CODE_ROOT: join(home, '.claude'), OPEN_PLUGIN_CLAUDE_CODE_BIN: binary }, async () => {
        expect(hasCurrentClaudeCodeBinary()).toBe(false); expect(claudeCode.detect()).toBe(false);
      });
    }
    for (const output of ['2.1.275\n', '2.1.275 (Other)\n']) {
      const binary = native(root, output);
      await withEnv({ OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_CLAUDE_CODE_ROOT: join(home, '.claude'), OPEN_PLUGIN_CLAUDE_CODE_BIN: binary }, async () => {
        expect(hasCurrentClaudeCodeBinary()).toBe(false); expect(claudeCode.detect()).toBe(false);
      });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
