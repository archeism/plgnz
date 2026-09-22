import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { codexWriter } from '../src/hosts/codex-writer';
import { codex } from '../src/hosts/codex';
import { withHostEnvAsync, writeFiles } from './util';
import { resolveSource, type PluginSource, type ResolvedSource } from '../src/source';

function source(files: Record<string, string>): { plugin: PluginSource; resolved: ResolvedSource } {
  const dir = mkdtempSync(join(tmpdir(), 'plgnz-codex-lifecycle-'));
  writeFiles(dir, { 'plugin.json': '{"name":"demo-plugin","version":"1.2.0"}', ...files });
  const plugin: PluginSource = { dir, name: 'demo-plugin', marketplace: 'demo-market', contentFingerprint: fingerprint(files) };
  return { plugin, resolved: { sourceUri: dir, sha: 'ignored-for-codex-version', isGit: false, plugins: [plugin] } };
}

function fingerprint(files: Record<string, string>): string { return JSON.stringify(files); }

describe('codex lifecycle', () => {
  test('installs, leaves an exact re-add unchanged, and refreshes changed bytes in the same native version', async () => {
    await withHostEnvAsync('codex', async home => {
      const first = source({ 'resources/value.txt': 'one\n' });
      await codexWriter.add(first.plugin, first.resolved);
      const target = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0');
      expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('one\n');
      expect(readFileSync(join(target, '.plgnz-install.json'), 'utf8')).toContain(first.resolved.sourceUri);
      expect(readFileSync(join(target, '.codex-plugin/plugin.json'), 'utf8')).toContain('"skills":"./skills/"');
      await codexWriter.add(first.plugin, first.resolved);
      writeFiles(first.plugin.dir, { 'resources/value.txt': 'two\n' });
      first.plugin.contentFingerprint = fingerprint({ 'resources/value.txt': 'two\n' });
      await codexWriter.add(first.plugin, first.resolved);
      expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('two\n');
      expect(codex.listInstalled().find(plugin => plugin.name === 'demo-plugin')?.version).toBe('1.2.0');
    });
  });

  test('validates a native-only Claude marketplace source under its normalized Codex identity', async () => {
    await withHostEnvAsync('codex', async home => {
      const dir = mkdtempSync(join(tmpdir(), 'plgnz-codex-native-source-'));
      writeFiles(dir, {
        '.claude-plugin/marketplace.json': '{"name":"superpowers-dev","plugins":[{"source":"./"}]}',
        '.claude-plugin/plugin.json': '{"name":"superpowers","version":"6.4.1","description":"Native source"}',
      });
      const resolved = resolveSource(dir);
      const plugin = resolved.plugins[0]!;
      await codexWriter.add(plugin, resolved, { dryRun: true });
      expect(existsSync(join(home, '.codex/plugins/cache/superpowers-dev/superpowers/6.4.1'))).toBe(false);
    });
  });

  test('retains an owned active version on conversion failure and preserves unrelated user config', async () => {
    await withHostEnvAsync('codex', async home => {
      const good = source({ 'resources/value.txt': 'safe\n' });
      await codexWriter.add(good.plugin, good.resolved);
      writeFiles(good.plugin.dir, { 'commands/bad.md': '---\ndescription: bad\nallowed-tools: Bash\n---\nbody\n' });
      good.plugin.contentFingerprint = fingerprint({ 'resources/value.txt': 'safe\n', 'commands/bad.md': '---\ndescription: bad\nallowed-tools: Bash\n---\nbody\n' });
      let error: Error | undefined;
      try { await codexWriter.add(good.plugin, good.resolved); } catch (caught) { error = caught as Error; }
      expect(error?.message).toContain('permission semantics');
      const target = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0');
      expect(readFileSync(join(target, 'resources/value.txt'), 'utf8')).toBe('safe\n');
      expect(readFileSync(join(home, '.codex/config.toml'), 'utf8')).toContain('[mcp_servers.healthy-user]');
    });
  });

  test('never replaces a differing foreign slot and removes only marker-owned versions', async () => {
    await withHostEnvAsync('codex', async home => {
      const foreign = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0');
      writeFiles(foreign, { 'plugin.json': '{"name":"demo-plugin","version":"1.2.0"}', 'foreign.txt': 'keep' });
      const incoming = source({ 'resources/value.txt': 'incoming\n' });
      let error: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { error = caught as Error; }
      expect(error?.message).toContain('unowned');
      expect(readFileSync(join(foreign, 'foreign.txt'), 'utf8')).toBe('keep');

      const owned = source({ 'resources/value.txt': 'owned\n' });
      // Use an unoccupied native version for the owned remove path.
      writeFileSync(join(owned.plugin.dir, 'plugin.json'), '{"name":"demo-plugin","version":"1.3.0"}');
      await codexWriter.add(owned.plugin, owned.resolved);
      await codexWriter.remove('demo-plugin@demo-market');
      expect(existsSync(join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.3.0'))).toBe(false);
      expect(existsSync(foreign)).toBe(true);
    });
  });

  test('adopts a differing unmarked same-identity slot only when explicitly requested', async () => {
    await withHostEnvAsync('codex', async home => {
      const foreign = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0');
      writeFiles(foreign, { 'plugin.json': '{"name":"demo-plugin","version":"1.2.0"}', 'foreign.txt': 'old' });
      const incoming = source({ 'resources/value.txt': 'adopted\n' });
      let refusal: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved, { dryRun: true }); } catch (caught) { refusal = caught as Error; }
      expect(refusal?.message).toContain('--adopt-existing');
      expect(readFileSync(join(foreign, 'foreign.txt'), 'utf8')).toBe('old');
      await codexWriter.add(incoming.plugin, incoming.resolved, { adoptExisting: true });
      expect(existsSync(join(foreign, 'foreign.txt'))).toBe(false);
      expect(readFileSync(join(foreign, 'resources/value.txt'), 'utf8')).toBe('adopted\n');
      expect(JSON.parse(readFileSync(join(foreign, '.plgnz-install.json'), 'utf8')).pluginId).toBe('demo-plugin@demo-market');
    });
  });

  test('refreshes a marker-matching slot if its active bytes were changed outside plgnz', async () => {
    await withHostEnvAsync('codex', async home => {
      const incoming = source({ 'resources/value.txt': 'expected\n' });
      await codexWriter.add(incoming.plugin, incoming.resolved);
      const active = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0/resources/value.txt');
      writeFileSync(active, 'tampered\n');
      await codexWriter.add(incoming.plugin, incoming.resolved);
      expect(readFileSync(active, 'utf8')).toBe('expected\n');
    });
  });

  test('restores the old slot when enabling config fails after activation', async () => {
    await withHostEnvAsync('codex', async home => {
      const incoming = source({ 'resources/value.txt': 'old\n' });
      await codexWriter.add(incoming.plugin, incoming.resolved);
      writeFiles(incoming.plugin.dir, { 'resources/value.txt': 'new\n' });
      incoming.plugin.contentFingerprint = fingerprint({ 'resources/value.txt': 'new\n' });
      const config = join(home, '.codex/config.toml');
      rmSync(config, { force: true });
      mkdirSync(config);
      let error: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { error = caught as Error; }
      expect(error?.message).toContain('config is not a file');
      expect(readFileSync(join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0/resources/value.txt'), 'utf8')).toBe('old\n');
    });
  });

  test('fails before writes for unsafe versions and invalid dry-run conversion', async () => {
    await withHostEnvAsync('codex', async home => {
      const configBefore = readFileSync(join(home, '.codex/config.toml'), 'utf8');
      const unsafe = source({});
      writeFileSync(join(unsafe.plugin.dir, 'plugin.json'), '{"name":"demo-plugin","version":"../../escape"}');
      let unsafeError: Error | undefined;
      try { await codexWriter.add(unsafe.plugin, unsafe.resolved); } catch (caught) { unsafeError = caught as Error; }
      expect(unsafeError?.message).toContain('unsafe Codex plugin version');
      expect(existsSync(join(home, '.codex/plugins/cache/demo-market/escape'))).toBe(false);

      const invalid = source({ 'commands/bad.md': '---\nallowed-tools: Bash\n---\nbody\n' });
      let dryRunError: Error | undefined;
      try { await codexWriter.add(invalid.plugin, invalid.resolved, { dryRun: true }); } catch (caught) { dryRunError = caught as Error; }
      expect(dryRunError?.message).toContain('permission semantics');
      expect(readFileSync(join(home, '.codex/config.toml'), 'utf8')).toBe(configBefore);
    });
  });

  test('refuses an active foreign local version and preserves extra plugin table fields on remove', async () => {
    await withHostEnvAsync('codex', async home => {
      const foreign = join(home, '.codex/plugins/cache/demo-market/demo-plugin/local');
      writeFiles(foreign, { 'plugin.json': '{"name":"demo-plugin","version":"local"}' });
      const incoming = source({ 'resources/value.txt': 'new\n' });
      let error: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { error = caught as Error; }
      expect(error?.message).toContain('would remain active');

      const owned = source({ 'resources/value.txt': 'owned\n' });
      writeFileSync(join(owned.plugin.dir, 'plugin.json'), '{"name":"demo-plugin","version":"1.3.0"}');
      // The foreign local cache must not make removal destructive; remove a separately owned slot.
      mkdirSync(join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.3.0'), { recursive: true });
      writeFiles(join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.3.0'), {
        '.plgnz-install.json': JSON.stringify({ source: owned.resolved.sourceUri, pluginId: 'demo-plugin@demo-market', fingerprint: owned.plugin.contentFingerprint }),
      });
      writeFiles(home, { '.codex/config.toml': '[plugins."demo-plugin@demo-market"]\nenabled = true\nuser_option = "keep"\n' });
      await codexWriter.remove('demo-plugin@demo-market');
      const config = readFileSync(join(home, '.codex/config.toml'), 'utf8');
      expect(config).toContain('user_option = "keep"');
      expect(config).toContain('[plugins."demo-plugin@demo-market"]');
      expect(config).toContain('enabled = false');
      expect(existsSync(foreign)).toBe(true);
      const removed = codex.listInstalled().find(plugin => plugin.id === 'demo-plugin@demo-market');
      expect(removed?.enabled).toBe(false);
      expect(removed?.path).toBeUndefined();
    });
  });

  test('refuses symlinks in managed cache slots', async () => {
    await withHostEnvAsync('codex', async home => {
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      mkdirSync(slot, { recursive: true });
      const made = spawnSync('ln', ['-s', '/tmp', join(slot, 'escape')]);
      expect(made.status).toBe(0);
      const incoming = source({});
      let error: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { error = caught as Error; }
      expect(error?.message).toContain('contains symlink');
    });
  });

  test('refuses a symlinked marketplace path before staging into the managed cache', async () => {
    await withHostEnvAsync('codex', async home => {
      const marketplace = join(home, '.codex/plugins/cache/demo-market');
      rmSync(marketplace, { recursive: true, force: true });
      const outside = mkdtempSync(join(tmpdir(), 'plgnz-codex-outside-'));
      expect(spawnSync('ln', ['-s', outside, marketplace]).status).toBe(0);
      const incoming = source({ 'resources/value.txt': 'safe\n' });
      let error: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { error = caught as Error; }
      expect(error?.message).toContain('path component is a symlink');
      expect(readdirSync(outside)).toEqual([]);
    });
  });

  test('enables compact TOML without duplicating keys and preserves comments and other tables', async () => {
    await withHostEnvAsync('codex', async home => {
      writeFileSync(join(home, '.codex/config.toml'), '[plugins."demo-plugin@demo-market"]\nenabled=false # keep this comment\nuser_option="keep"\n\n[plugins."other@market"]\nenabled = false\n');
      const incoming = source({ 'resources/value.txt': 'safe\n' });
      await codexWriter.add(incoming.plugin, incoming.resolved);
      const config = readFileSync(join(home, '.codex/config.toml'), 'utf8');
      expect(config).toContain('enabled=true # keep this comment');
      expect(config).toContain('user_option="keep"');
      expect(config).toContain('[plugins."other@market"]\nenabled = false');
      expect((config.match(/enabled\s*=/gu) ?? [])).toHaveLength(2);
    });
  });

  test('reader uses native local and semver precedence instead of lexical directory order', async () => {
    await withHostEnvAsync('codex', async home => {
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      writeFiles(join(slot, '1.2.0-alpha'), { 'plugin.json': '{}' });
      writeFiles(join(slot, '1.2.0'), { 'plugin.json': '{}' });
      writeFiles(home, { '.codex/config.toml': '[plugins."demo-plugin@demo-market"]\nenabled = true\n' });
      expect(codex.listInstalled().find(plugin => plugin.id === 'demo-plugin@demo-market')?.version).toBe('1.2.0');
      writeFiles(join(slot, 'local'), { 'plugin.json': '{}' });
      expect(codex.listInstalled().find(plugin => plugin.id === 'demo-plugin@demo-market')?.version).toBe('local');
    });
  });

  test('keeps the new active slot when cleanup of an older owned version fails', async () => {
    await withHostEnvAsync('codex', async home => {
      const incoming = source({ 'resources/value.txt': 'old\n' });
      writeFileSync(join(incoming.plugin.dir, 'plugin.json'), '{"name":"demo-plugin","version":"1.1.0"}');
      await codexWriter.add(incoming.plugin, incoming.resolved);
      const oldResource = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.1.0/resources/value.txt');
      expect(spawnSync('chflags', ['uchg', oldResource]).status).toBe(0);
      try {
        writeFileSync(join(incoming.plugin.dir, 'plugin.json'), '{"name":"demo-plugin","version":"1.2.0"}');
        writeFileSync(join(incoming.plugin.dir, 'resources/value.txt'), 'new\n');
        incoming.plugin.contentFingerprint = 'new-fingerprint';
        let error: Error | undefined;
        try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { error = caught as Error; }
        expect(error === undefined).toBe(false);
        const active = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0');
        expect(readFileSync(join(active, 'resources/value.txt'), 'utf8')).toBe('new\n');
        expect(codex.listInstalled().find(plugin => plugin.id === 'demo-plugin@demo-market')?.version).toBe('1.2.0');
      } finally {
        spawnSync('chflags', ['nouchg', oldResource]);
      }
    });
  });

  test('refuses malformed ownership markers and conflicting native manifest identity', async () => {
    await withHostEnvAsync('codex', async home => {
      const incoming = source({ 'resources/value.txt': 'same\n' });
      const target = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.2.0');
      writeFiles(target, {
        'plugin.json': '{"name":"demo-plugin","version":"1.2.0"}',
        '.plgnz-install.json': '{bad json',
      });
      let markerError: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { markerError = caught as Error; }
      expect(markerError?.message).toContain('invalid plgnz ownership marker');
      expect(readFileSync(join(target, '.plgnz-install.json'), 'utf8')).toBe('{bad json');

      rmSync(target, { recursive: true, force: true });
      writeFiles(incoming.plugin.dir, { '.codex-plugin/plugin.json': '{"name":"demo-plugin","version":"9.9.9"}' });
      let overlayError: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { overlayError = caught as Error; }
      expect(overlayError?.message).toContain('version conflicts');
      expect(existsSync(target)).toBe(false);

      writeFiles(incoming.plugin.dir, { '.codex-plugin/plugin.json': '{"name":"demo-plugin","version":"1.2.0","skills":"./other"}' });
      let pointerError: Error | undefined;
      try { await codexWriter.add(incoming.plugin, incoming.resolved); } catch (caught) { pointerError = caught as Error; }
      expect(pointerError?.message).toContain('unsupported Codex native skills pointer');
      expect(existsSync(target)).toBe(false);
    });
  });
});
