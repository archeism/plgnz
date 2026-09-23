/**
 * Path resolution for open-plugin.
 *
 * Every filesystem path the tool touches goes through this module so tests can
 * redirect the whole world into a temp directory via `OPEN_PLUGIN_HOME`
 * (AGENTS.md: tests never touch the real home).
 *
 * Resolution order for each host root: a host-specific override env var wins,
 * then `OPEN_PLUGIN_HOME` (a stand-in for `$HOME`), then the real `$HOME`.
 */
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

/** The home stand-in: `OPEN_PLUGIN_HOME` when set, else the real `$HOME`. */
export function homeRoot(): string {
  const override = process.env['OPEN_PLUGIN_HOME'];
  if (override && override.length > 0) return override;
  return process.env['HOME'] ?? '.';
}

/** `~/.claude` — claude-code config root (`installed_plugins.json` lives under `plugins/`). */
export function claudeCodeRoot(): string {
  return process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'] ?? join(homeRoot(), '.claude');
}

/** `~/.codex` — codex home: `config.toml` + `plugins/cache/`. */
export function codexHome(): string {
  return process.env['OPEN_PLUGIN_CODEX_HOME'] ?? join(homeRoot(), '.codex');
}

/** `~/.kimi-code` — kimi root: `config.toml` + `plugins/managed/`. */
export function kimiRoot(): string {
  return process.env['OPEN_PLUGIN_KIMI_ROOT'] ?? join(homeRoot(), '.kimi-code');
}

/** `~/.cursor` — cursor root: `mcp.json` + `plugins/local/`. */
export function cursorRoot(): string {
  return process.env['OPEN_PLUGIN_CURSOR_ROOT'] ?? join(homeRoot(), '.cursor');
}

/** `~/.omp` — omp home: its own plugin store under `plugins/` (AGENTS.md hosts list). */
export function ompRoot(): string {
  return process.env['OPEN_PLUGIN_OMP_ROOT'] ?? join(homeRoot(), '.omp');
}

/** Hermes's native plugin home. Portable packages live under `plugins/`. */
export function hermesRoot(): string {
  return process.env['OPEN_PLUGIN_HERMES_ROOT'] ?? join(homeRoot(), '.hermes');
}

/** Requested config path; writer verifies native HERMES_HOME/config.yaml resolves to it. */
export function hermesConfigPath(): string {
  return process.env['OPEN_PLUGIN_HERMES_CONFIG_PATH'] ?? join(hermesRoot(), 'config.yaml');
}

/** Official ZCode CLI config and plugin root (`~/.zcode/cli`). */
export function zcodeCliRoot(): string {
  return join(zcodeStorageRoot(), 'cli');
}

/** Official ZCode keeps config under HOME while allowing its plugin store to move. */
export function zcodeCliConfigRoot(): string {
  return join(homeRoot(), '.zcode', 'cli');
}

export function zcodeStorageRoot(): string {
  return process.env['ZCODE_STORAGE_DIR'] ?? dirname(zcodeCliConfigRoot());
}

/**
 * open-plugin's own install ledger, written by `add`.
 * When `OPEN_PLUGIN_HOME` is set the ledger is `<home>/state.json`; in real use
 * it lives under `~/.open-plugin/state.json` so we never drop a file in `$HOME`.
 */
export function stateFile(): string {
  const override = process.env['OPEN_PLUGIN_HOME'];
  if (override && override.length > 0) return join(override, 'state.json');
  return join(process.env['HOME'] ?? '.', '.open-plugin', 'state.json');
}

/**
 * open-plugin's git-source clone cache, written when `add` resolves a git URL
 * (src/source.ts). Same rule as `stateFile()`: `<home>/cache` under
 * `OPEN_PLUGIN_HOME`, `~/.open-plugin/cache` in real use — never a generic
 * `cache/` directory dropped straight into `$HOME`.
 */
export function cacheRoot(): string {
  const override = process.env['OPEN_PLUGIN_HOME'];
  if (override && override.length > 0) return join(override, 'cache');
  return join(process.env['HOME'] ?? '.', '.open-plugin', 'cache');
}

/** Test/debug helper: does a path exist? */
export function pathExists(p: string): boolean {
  return existsSync(p);
}
