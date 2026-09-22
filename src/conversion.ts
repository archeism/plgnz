/**
 * Codex projection for plugin content that Claude-style plugins express as
 * commands. This is deliberately a file-to-file transform: lifecycle code can
 * stage its destination before it asks a host writer to activate anything.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import { readPluginManifest } from './source';

declare const Bun: {
  YAML: { parse(input: string): unknown };
};

interface Command {
  name: string;
  description: string;
  argumentHint?: string;
  userInvocable?: boolean;
  allowImplicit: boolean;
  body: string;
  source: string;
}

const COMMAND_FIELDS = new Set(['description', 'argument-hint', 'argument_hint', 'disable-model-invocation', 'disable_model_invocation', 'user-invocable', 'user_invocable']);
const UNSUPPORTED_FIELDS = new Set(['allowed-tools', 'allowed_tools', 'permissionMode', 'permission_mode', 'hooks', 'model', 'context']);
const UNSUPPORTED_CLAUDE_COMPONENTS = new Set(['agents', 'hooks', 'mcpServers', 'outputStyles', 'lspServers']);

/**
 * Copy a package into a caller-owned temporary destination and add Codex skill
 * projections for its prompt commands. The source is checked before copying so
 * neither symlinks nor paths outside the source can enter the output.
 */
export function projectPluginForCodex(sourceDir: string, destinationDir: string): void {
  const source = resolve(sourceDir);
  const destination = resolve(destinationDir);
  if (!existsSync(source) || !statSync(source).isDirectory()) throw new Error(`plugin source is not a directory: ${source}`);
  if (destination === source || destination.startsWith(`${source}/`)) throw new Error('destination must not be inside the plugin source');
  assertSafeTree(source);

  mkdirSync(destination, { recursive: true });
  if (readdirSync(destination).length !== 0) throw new Error(`Codex projection destination must be empty: ${destination}`);
  const stage = mkdtempSync(join(destination, '.plgnz-codex-stage-'));
  try {
    cpSync(source, stage, { recursive: true });
    const commands = discoverCommands(source);
    validateClaudeNativeSemantics(source, commands);
    const namespace = readPackageName(source);
    for (const command of commands) { if (command.userInvocable === false) throw new Error(`user-invocable: false is unsupported by Codex: ${command.source}`); writeCommandSkill(stage, command, namespace, new Set(commands.map(item => item.name))); }
    translateNativeSkillPolicies(stage);
    publishStage(stage, destination);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function validateClaudeNativeSemantics(source: string, commands: Command[]): void {
  const file = join(source, '.claude-plugin', 'plugin.json');
  if (!existsSync(file)) return;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`Claude native plugin manifest must be an object: ${file}`);
  for (const field of UNSUPPORTED_CLAUDE_COMPONENTS) {
    if (parsed[field] !== undefined) throw new Error(`Claude native ${field} semantics are unsupported for Codex conversion: ${file}`);
  }
  if (parsed['skills'] !== undefined && parsed['skills'] !== './skills' && parsed['skills'] !== './skills/') {
    throw new Error(`Claude native skills pointer is unsupported for Codex conversion: ${file}`);
  }
  if (parsed['skills'] !== undefined && (!existsSync(join(source, 'skills')) || !statSync(join(source, 'skills')).isDirectory())) {
    throw new Error(`Claude native skills pointer cannot be preserved for Codex conversion: ${file}`);
  }
  if (parsed['commands'] === undefined) return;
  const listed = Array.isArray(parsed['commands']) ? parsed['commands'] : [parsed['commands']];
  if (!listed.every(value => typeof value === 'string')) throw new Error(`Claude native commands pointer is invalid for Codex conversion: ${file}`);
  const preserved = new Set(commands.map(command => `./${command.source.slice(source.length + 1)}`));
  const requested = new Set(listed as string[]);
  if (requested.size !== preserved.size || [...requested].some(path => !preserved.has(path))) {
    throw new Error(`Claude native commands pointer is unsupported for Codex conversion: ${file}`);
  }
}

function assertSafeTree(root: string): void {
  // `statSync` follows links, so use find's physical link test before cpSync.
  // This avoids copying a resource that later resolves outside the package.
  const links = spawnSync('find', [root, '-type', 'l', '-print'], { encoding: 'utf8' });
  if (links.status !== 0) throw new Error(`could not inspect plugin resources: ${root}`);
  if (links.stdout.trim() !== '') throw new Error(`symlink is not supported in plugin resources: ${links.stdout.trim()}`);
}

function discoverCommands(source: string): Command[] {
  const claude = join(source, '.claude', 'commands');
  if (existsSync(claude)) return readCommandDirectory(claude, 'markdown');
  const root = join(source, 'commands');
  if (!existsSync(root)) return [];
  const markdown = readCommandDirectory(root, 'markdown');
  return markdown.length > 0 ? markdown : readCommandDirectory(root, 'toml');
}

function readPackageName(source: string): string {
  const manifest = readPluginManifest(source);
  if (manifest === undefined) {
    throw new Error('Plugin manifest is required for command namespace mapping');
  }
  return manifest.name;
}

function readCommandDirectory(directory: string, kind: 'markdown' | 'toml'): Command[] {
  if (!statSync(directory).isDirectory()) throw new Error(`command path is not a directory: ${directory}`);
  return readdirSync(directory).sort().flatMap(file => {
    if (!file.endsWith(kind === 'markdown' ? '.md' : '.toml')) return [];
    const path = join(directory, file);
    if (!statSync(path).isFile()) throw new Error(`command must be a regular file: ${path}`);
    return [kind === 'markdown' ? parseMarkdownCommand(path) : parseTomlCommand(path)];
  });
}

function parseMarkdownCommand(path: string): Command {
  const raw = readFileSync(path, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (match === null) throw new Error(`command frontmatter is required: ${path}`);
  const metadata = parseYaml(match[1] ?? '', path);
  validateMetadata(metadata, path);
  normalizeMetadata(metadata, path);
  const description = metadata['description'];
  if (typeof description !== 'string' || description.trim() === '') throw new Error(`command description is required: ${path}`);
  return commandFrom(path, description, metadata['argument-hint'], metadata['user-invocable'], metadata['disable-model-invocation'], match[2] ?? '');
}

function parseTomlCommand(path: string): Command {
  const parsed: unknown = parseToml(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`invalid command TOML: ${path}`);
  validateMetadata(parsed, path);
  normalizeMetadata(parsed, path);
  const description = parsed['description'];
  const prompt = parsed['prompt'];
  if (typeof description !== 'string' || description.trim() === '' || typeof prompt !== 'string') throw new Error(`command TOML needs description and prompt: ${path}`);
  return commandFrom(path, description, parsed['argument-hint'], parsed['user-invocable'], parsed['disable-model-invocation'], prompt);
}

function normalizeMetadata(metadata: Record<string, unknown>, path: string): void {
  for (const [hyphen, underscore] of [['argument-hint', 'argument_hint'], ['user-invocable', 'user_invocable'], ['disable-model-invocation', 'disable_model_invocation']] as const) {
    if (metadata[hyphen] !== undefined && metadata[underscore] !== undefined) throw new Error(`conflicting command metadata spellings: ${path} (${hyphen}, ${underscore})`);
    if (metadata[hyphen] === undefined && metadata[underscore] !== undefined) metadata[hyphen] = metadata[underscore];
  }
}

function commandFrom(path: string, description: string, argumentHint: unknown, userInvocable: unknown, disableModelInvocation: unknown, body: string): Command {
  const name = basename(path).replace(/\.(md|toml)$/u, '');
  if (!validSegment(name)) throw new Error(`unsafe command name: ${name}`);
  if (argumentHint !== undefined && typeof argumentHint !== 'string') throw new Error(`argument hint must be text: ${path}`);
  if (userInvocable !== undefined && typeof userInvocable !== 'boolean') throw new Error(`user-invocable must be boolean: ${path}`);
  if (disableModelInvocation !== undefined && typeof disableModelInvocation !== 'boolean') throw new Error(`disable-model-invocation must be boolean: ${path}`);
  if (/!`[\s\S]*?`/u.test(body)) throw new Error(`shell preprocessing is unsupported: ${path}`);
  return { name, description, ...(typeof argumentHint === 'string' ? { argumentHint } : {}), ...(typeof userInvocable === 'boolean' ? { userInvocable } : {}), allowImplicit: disableModelInvocation === false, body, source: path };
}

/** Pi projector: reuse the shared command parser, but emit Pi's native skill form. */
export function projectPluginForPi(sourceDir: string, destinationDir: string, namespace: string): void {
  const source = resolve(sourceDir); const destination = resolve(destinationDir);
  if (!existsSync(source) || !statSync(source).isDirectory()) throw new Error(`plugin source is not a directory: ${source}`);
  if (destination === source || destination.startsWith(`${source}/`)) throw new Error('destination must not be inside the plugin source');
  assertSafeTree(source); mkdirSync(destination, { recursive: true });
  if (readdirSync(destination).length !== 0) throw new Error(`Pi projection destination must be empty: ${destination}`);
  cpSync(source, destination, { recursive: true });
  const commands = discoverCommands(source); const names = new Set(commands.map(command => command.name));
  for (const command of commands) writePiCommandSkill(destination, command, namespace, names);
}

function writePiCommandSkill(stage: string, command: Command, namespace: string, names: Set<string>): void {
  if (command.userInvocable === false) throw new Error(`user-invocable: false has no proven Pi skill equivalent: ${command.source}`);
  const skillDir = join(stage, 'skills', command.name);
  if (existsSync(skillDir)) throw new Error(`collision: command ${command.name} would replace an existing skill`);
  const body = command.body
    .replace(/\$ARGUMENTS\b/gu, 'the text after this /skill invocation')
    .replace(/(^|[^A-Za-z0-9_-])\/([a-z0-9][a-z0-9-]*)(?=\s|$|[.,:;!?])/giu, (whole, prefix: string, name: string) => names.has(name) ? `${prefix}/skill:${namespace}-${name}` : whole);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${namespace}-${command.name}\ndescription: ${yamlString(command.description)}\ndisable-model-invocation: true\n---\n\nUse the text after this /skill invocation as command arguments; no text means empty arguments. Relative paths remain relative to this skill directory.\n\n${body}`);
}

function validateMetadata(metadata: Record<string, unknown>, path: string): void {
  for (const [key, value] of Object.entries(metadata)) {
    if (UNSUPPORTED_FIELDS.has(key)) throw new Error(`permission semantics are unsupported for Codex conversion: ${path} (${key})`);
    if (!COMMAND_FIELDS.has(key) && key !== 'prompt') throw new Error(`unknown command metadata: ${path} (${key})`);
    if (key !== 'description' && key !== 'argument-hint' && key !== 'argument_hint' && key !== 'prompt' && typeof value !== 'boolean') {
      throw new Error(`command policy metadata must be boolean: ${path} (${key})`);
    }
  }
}

function writeCommandSkill(stage: string, command: Command, namespace: string, commandNames: Set<string>): void {
  const skillDir = join(stage, 'skills', command.name);
  if (existsSync(skillDir)) throw new Error(`collision: command ${command.name} would replace an existing skill`);
  const body = command.body.replace(/\$ARGUMENTS\b/gu, 'the invocation tail').replace(/(^|[^A-Za-z0-9_-])\/([a-z0-9][a-z0-9-]*)(?=\s|$|[.,:;!?])/giu, (whole, prefix: string, name: string) => commandNames.has(name) ? `${prefix}$${namespace}:${name}` : whole);
  const hint = command.argumentHint === undefined ? '' : `argument-hint: ${yamlString(command.argumentHint)}\n`;
  const userInvocable = command.userInvocable === undefined ? '' : `user-invocable: ${command.userInvocable}\n`;
  const preface = "Use the user's text after the skill invocation as command arguments; no text means empty arguments. Load referenced skills from sibling directories (../<skill>/SKILL.md). Plugin personas live at ../../agents/<persona>.md and shared references at ../../references/, relative to this file.\n\nFor persona work, read the persona file and use the current harness's available delegation facility with those instructions. Persona names are not assumed to be registered tools or agent types. If delegation is unavailable, perform the passes sequentially and report that limitation.\n\n";
  mkdirSync(join(skillDir, 'agents'), { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${command.name}\ndescription: ${yamlString(command.description)}\n${hint}${userInvocable}disable-model-invocation: ${!command.allowImplicit}\n---\n\n${preface}${body}`);
  writePolicy(join(skillDir, 'agents', 'openai.yaml'), command.allowImplicit);
}

function translateNativeSkillPolicies(stage: string): void {
  const skills = join(stage, 'skills');
  if (!existsSync(skills)) return;
  for (const entry of readdirSync(skills)) {
    const skill = join(skills, entry);
    if (!statSync(skill).isDirectory()) continue;
    const file = join(skill, 'SKILL.md');
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const metadata = match === null ? {} : parseYaml(match[1] ?? '', file);
    const manual = metadata['disable-model-invocation'] === true;
    const automatic = metadata['disable-model-invocation'] === false;
    const sidecar = join(skill, 'agents', 'openai.yaml');
    if (existsSync(sidecar)) {
      const policy = readImplicitPolicy(sidecar);
      if (policy !== undefined && ((manual && policy !== false) || (automatic && policy !== true))) {
        throw new Error(`conflicting invocation policy for native skill ${entry}`);
      } else if (policy === undefined && manual) writePolicy(sidecar, false);
    } else if (manual) {
      mkdirSync(dirname(sidecar), { recursive: true });
      writePolicy(sidecar, false);
    }
  }
}

function readImplicitPolicy(path: string): boolean | undefined {
  const parsed: unknown = Bun.YAML.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`invalid Codex sidecar: ${path}`);
  const policy = parsed['policy'];
  if (policy === undefined) return undefined;
  if (!isRecord(policy)) throw new Error(`invalid Codex invocation policy: ${path}`);
  if (policy['allow_implicit_invocation'] === undefined) throw new Error(`missing Codex invocation policy: ${path}`);
  if (typeof policy['allow_implicit_invocation'] !== 'boolean') throw new Error(`invalid Codex invocation policy: ${path}`);
  return policy['allow_implicit_invocation'];
}

function writePolicy(path: string, allowImplicit: boolean): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8').replace(/\s*$/u, '') : '';
  const suffix = `policy:\n  allow_implicit_invocation: ${allowImplicit}\n`;
  writeFileSync(path, existing === '' ? suffix : `${existing}\n${suffix}`);
}

function publishStage(stage: string, destination: string): void {
  for (const entry of readdirSync(stage)) cpSync(join(stage, entry), join(destination, entry), { recursive: true });
  rmSync(stage, { recursive: true, force: true });
}

function parseYaml(text: string, path: string): Record<string, unknown> {
  try {
    const parsed: unknown = Bun.YAML.parse(text);
    if (!isRecord(parsed)) throw new Error('frontmatter must be a mapping');
    return parsed;
  } catch (error) {
    throw new Error(`invalid YAML frontmatter: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function validSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
