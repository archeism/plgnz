import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kimiWriter } from '../src/hosts/kimi-writer';
import { type PluginSource, type ResolvedSource } from '../src/source';
import { writeFiles } from './util';
import { withKimiNative } from './kimi-fixture';

function fixture(): { root: string; home: string; plugin: PluginSource; resolved: ResolvedSource } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-kimi-lifecycle-'));
  const source = join(root, 'source');
  writeFiles(source, {
    'plugin.json': '{"name":"demo","version":"1.0.0","description":"Demo"}',
    'mcp.json': '{"mcpServers":{"fixture":{"type":"stdio","command":"fixture-mcp"}}}',
    'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\n\nBody\n',
  });
  const plugin: PluginSource = { dir: source, name: 'demo', contentFingerprint: 'one' };
  return { root, home: join(root, 'home'), plugin, resolved: { sourceUri: source, sha: 'same-source-revision', isGit: false, plugins: [plugin] } };
}

async function withKimi<T>(fn: (value: ReturnType<typeof fixture>) => Promise<T>): Promise<T> {
  const value = fixture(); const before = process.env.OPEN_PLUGIN_KIMI_ROOT;
  process.env.OPEN_PLUGIN_KIMI_ROOT = join(value.home, '.kimi-code');
  try { return await fn(value); } finally { if (before === undefined) delete process.env.OPEN_PLUGIN_KIMI_ROOT; else process.env.OPEN_PLUGIN_KIMI_ROOT = before; rmSync(value.root, { recursive: true, force: true }); }
}

describe('Kimi lifecycle preflight', () => {
  test('uses the isolated native loader for install, unchanged re-add, refresh, and rollback', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      await withKimiNative(home, async () => {
        writeFiles(plugin.dir, { '.kimi-plugin/plugin.json': '{"mcpServers":{"fixture":{"type":"stdio","command":"fixture-mcp"}}}' });
        await kimiWriter.add(plugin, resolved); const target = join(home, '.kimi-code', 'plugins', 'managed', 'demo'); expect(readFileSync(join(target, 'skills/ordinary/SKILL.md'), 'utf8')).toContain('Body');
        expect(JSON.parse(readFileSync(join(target, 'kimi.plugin.json'), 'utf8')).mcpServers.fixture.command).toBe('fixture-mcp');
        expect(await kimiWriter.add(plugin, resolved)).toBe('unchanged');
        writeFiles(plugin.dir, { 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\n\nChanged\n' }); plugin.contentFingerprint = 'two'; await kimiWriter.add(plugin, resolved); expect(readFileSync(join(target, 'skills/ordinary/SKILL.md'), 'utf8')).toContain('Changed');
        expect(readFileSync(join(target, '.plgnz-install.json'), 'utf8')).toContain('two');
        const registryBeforeFailure = readFileSync(join(home, '.kimi-code', 'plugins', 'installed.json'), 'utf8');
        writeFiles(plugin.dir, { 'skills/ordinary/SKILL.md': 'failed refresh' }); plugin.contentFingerprint = 'three'; process.env.KIMI_FAIL_ENABLE = '1'; let failure: Error | undefined; try { await kimiWriter.add(plugin, resolved); } catch (error) { failure = error as Error; } finally { delete process.env.KIMI_FAIL_ENABLE; }
        expect(failure?.message).toContain('forced enable failure'); expect(readFileSync(join(target, 'skills/ordinary/SKILL.md'), 'utf8')).toContain('Changed');
        expect(readFileSync(join(home, '.kimi-code', 'plugins', 'installed.json'), 'utf8')).toBe(registryBeforeFailure);
        expect(readdirSync(join(home, '.kimi-code', 'plugins')).some(name => name.startsWith('.plgnz-kimi-'))).toBe(false);
      });
    });
  });
  test('stages ordinary skills before a dry-run without touching the native store', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      const result = await kimiWriter.add(plugin, resolved, { dryRun: true });
      expect(result).toBeUndefined();
      const root = join(home, '.kimi-code');
      expect(existsSync(join(root, 'plugins', 'managed', 'demo'))).toBe(false);
      expect(existsSync(join(root, 'plugins', 'installed.json'))).toBe(false);
      expect(existsSync(join(root, 'plugins'))).toBe(false);
    });
  });

  test('rejects unsupported native-specific behavior before any active write', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      writeFiles(plugin.dir, { 'kimi.plugin.json': '{"name":"demo","hooks":{}}' });
      let failure: Error | undefined;
      try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { failure = error as Error; }
      expect(failure?.message).toContain('unsupported Kimi native manifest field: hooks');
      expect(existsSync(join(home, '.kimi-code', 'plugins', 'managed', 'demo'))).toBe(false);
    });
  });

  test('rejects a legacy 0.x Kimi binary before native activation', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      const legacy = join(home, 'legacy-kimi'); mkdirSync(home, { recursive: true }); writeFileSync(legacy, '#!/bin/sh\necho 0.16.0\n'); chmodSync(legacy, 0o755);
      const before = process.env.OPEN_PLUGIN_KIMI_BIN; process.env.OPEN_PLUGIN_KIMI_BIN = legacy;
      let failure: Error | undefined;
      try { await kimiWriter.add(plugin, resolved); } catch (error) { failure = error as Error; }
      finally { if (before === undefined) delete process.env.OPEN_PLUGIN_KIMI_BIN; else process.env.OPEN_PLUGIN_KIMI_BIN = before; }
      expect(failure?.message).toContain('legacy or unsupported binary');
      expect(existsSync(join(home, '.kimi-code', 'plugins', 'managed', 'demo'))).toBe(false);
      expect(existsSync(join(home, '.kimi-code', 'plugins', 'installed.json'))).toBe(false);
    });
  });

  test('refuses a TOML-only command set before activation instead of dropping it', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      writeFiles(plugin.dir, { 'commands/only.toml': 'description = "unsupported"\n' });
      let failure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { failure = error as Error; }
      expect(failure?.message).toContain('cannot preserve non-Markdown resource');
      expect(existsSync(join(home, '.kimi-code', 'plugins', 'managed', 'demo'))).toBe(false);
    });
  });

  test('refuses commands and user-only skill policies until native semantics are proved', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      writeFiles(plugin.dir, { 'commands/run.md': '---\ndescription: Run\n---\n$ARGUMENTS\n' });
      let commandFailure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { commandFailure = error as Error; }
      expect(commandFailure?.message).toContain("target 'kimi' is unverified for commandProjection");
      rmSync(join(plugin.dir, 'commands'), { recursive: true });
      writeFiles(plugin.dir, { 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\ndisable-model-invocation: true\n---\nBody\n' });
      let skillFailure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { skillFailure = error as Error; }
      expect(skillFailure?.message).toContain("target 'kimi' is unverified for userOnlySkills");
      writeFiles(plugin.dir, { 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n"disable-model-invocation": true\n---\nBody\n' });
      let quotedFailure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { quotedFailure = error as Error; }
      expect(quotedFailure?.message).toContain("target 'kimi' is unverified for userOnlySkills");
      writeFiles(plugin.dir, { 'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\nThe text disable-model-invocation: true is body text.\n' });
      expect(await kimiWriter.add(plugin, resolved, { dryRun: true })).toBeUndefined();
      expect(existsSync(join(home, '.kimi-code', 'plugins', 'managed', 'demo'))).toBe(false);
    });
  });

  test('uses the verified native remove endpoint for a recorded owned representation', async () => {
    await withKimi(async ({ home }) => {
      await withKimiNative(home, async () => {
      const root = join(home, '.kimi-code'); const target = join(root, 'plugins', 'managed', 'demo');
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, '.plgnz-install.json'), JSON.stringify({ source: 'fixture', pluginId: 'demo', fingerprint: 'one' }));
      writeFileSync(join(root, 'plugins', 'installed.json'), JSON.stringify({ version: 1, plugins: [{ id: 'demo', root: target, enabled: true }] }));
      await kimiWriter.remove('demo');
      expect(existsSync(target)).toBe(true);
      expect(JSON.parse(readFileSync(join(root, 'plugins', 'installed.json'), 'utf8')).plugins).toHaveLength(0);
      });
    });
  });

  test('rejects malformed registry and ownership marker before native activation', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      const root = join(home, '.kimi-code'); const registry = join(root, 'plugins', 'installed.json'); mkdirSync(join(root, 'plugins'), { recursive: true });
      writeFileSync(registry, JSON.stringify({ version: 0, plugins: [] }));
      let registryFailure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { registryFailure = error as Error; }
      expect(registryFailure?.message).toContain('unsupported Kimi installed registry');
      writeFileSync(registry, JSON.stringify({ version: 1, plugins: [] }));
      const target = join(root, 'plugins', 'managed', 'demo'); mkdirSync(target, { recursive: true }); writeFileSync(join(target, '.plgnz-install.json'), '{');
      let markerFailure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { markerFailure = error as Error; }
      expect(markerFailure?.message).toContain('invalid plgnz ownership marker');
    });
  });

  test('does not move an active target when registry snapshot acquisition fails', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      const root = join(home, '.kimi-code'); const target = join(root, 'plugins', 'managed', 'demo'); mkdirSync(target, { recursive: true });
      writeFileSync(join(target, 'preserve.txt'), 'active');
      writeFileSync(join(target, '.plgnz-install.json'), JSON.stringify({ source: resolved.sourceUri, pluginId: 'demo', fingerprint: 'old' }));
      writeFileSync(join(root, 'plugins', 'installed.json'), '{');
      let failure: Error | undefined; try { await kimiWriter.add(plugin, resolved); } catch (error) { failure = error as Error; }
      expect(failure?.message).toContain('invalid Kimi installed registry');
      expect(readFileSync(join(target, 'preserve.txt'), 'utf8')).toBe('active');
      expect(readdirSync(join(root, 'plugins')).some(name => name.startsWith('.plgnz-kimi-backup-'))).toBe(false);
    });
  });

  test('rejects managed cache and metadata symlinks before native activation', async () => {
    await withKimi(async ({ home, plugin, resolved }) => {
      const root = join(home, '.kimi-code'); const elsewhere = join(home, 'elsewhere'); mkdirSync(join(root, 'plugins'), { recursive: true }); mkdirSync(elsewhere);
      expect(spawnSync('ln', ['-s', elsewhere, join(root, 'plugins', 'managed')]).status).toBe(0);
      let cacheFailure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { cacheFailure = error as Error; }
      expect(cacheFailure?.message).toContain('managed path component is a symlink');
      rmSync(join(root, 'plugins', 'managed'));
      expect(spawnSync('ln', ['-s', join(home, 'elsewhere', 'registry'), join(root, 'plugins', 'installed.json')]).status).toBe(0);
      let metadataFailure: Error | undefined; try { await kimiWriter.add(plugin, resolved, { dryRun: true }); } catch (error) { metadataFailure = error as Error; }
      expect(metadataFailure?.message).toContain('managed metadata is a symlink');
    });
  });
});
