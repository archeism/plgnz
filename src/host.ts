/**
 * The host contract (AGENTS.md: one module per host under `src/hosts/`,
 * implementing this interface; no host-specific branches outside its module).
 *
 * Split into `HostReader` and `HostWriter` so `doctor` is read-only *by
 * construction*: it takes `HostReader[]` and must never import a writer.
 * This phase ships readers only; `add`/`pin`/`update`/`remove` arrive later
 * and will implement `HostWriter` in the same per-host modules.
 */

/** One MCP server as configured somewhere we can read it. */
export interface McpServerEntry {
  /** Server name as written in the config (`mcpServers` key / `[mcp_servers.<name>]`). */
  name: string;
  transport: 'stdio' | 'http';
  /** Where the entry came from: host user-level config or an installed plugin. */
  origin: 'user' | 'plugin';
  /** `plugin@marketplace` (or bare plugin name) when origin is `plugin`. */
  pluginId?: string;
  /** Absolute path of the file the entry was read from. */
  file: string;
  /** Directory relative paths resolve against (plugin root, or the config's root). */
  baseDir: string;
  /** stdio: the executable token (spec §7.2.1: a single token, bare name or `./`-relative). */
  command?: string;
  /** stdio args. Never printed by doctor — args can carry credentials. */
  args?: string[];
  /** False when the host config explicitly disables the entry. */
  enabled?: boolean;
}

/** One installed plugin in a host's native store. */
export interface InstalledPlugin {
  /** Host-native id: `plugin@marketplace` where the host tracks marketplaces, else the plugin name. */
  id: string;
  name: string;
  marketplace?: string;
  /** Install directory, when it exists on disk. */
  path?: string;
  version?: string;
  /** Source sha the host itself recorded (claude-code `gitCommitSha`), if any. */
  sha?: string;
  enabled?: boolean;
}

export interface HostReader {
  readonly id: string;
  /**
   * True when the host is launched by a macOS GUI app and therefore has no
   * shell PATH — bare commands are suspect there (spec §7.2.1 makes PATH
   * participation client-defined; plugins MUST NOT depend on it).
   */
  readonly gui: boolean;
  /** Is this host present on this machine? */
  detect(): boolean;
  /** Store directories this host owns (for `targets`/reporting). */
  stores(): string[];
  /** Plugins installed in the host's native store. */
  listInstalled(): InstalledPlugin[];
  /** Every MCP server entry the host will consider: user-level config + each installed plugin. */
  mcpEntries(): McpServerEntry[];
}

export interface AddOptions {
  target?: string;
  dryRun?: boolean;
}

import type { PluginSource, ResolvedSource } from './source';

export interface HostWriter extends HostReader {
  add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void>;
  remove(id: string): Promise<void>;
}
