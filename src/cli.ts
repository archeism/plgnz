/**
 * CLI entrypoint. Verbs: add, doctor, pin, update, list, remove, targets
 * (AGENTS.md verbs list).
 */
import { runDoctor, formatFinding, type DoctorFinding } from './doctor';
import { hosts } from './hosts';
import { writers } from './hosts/writers';
import { resolveSource } from './source';
import { readState } from './state';
import { writeState } from './state-write';
import type { InstallRecord } from './state';
import { runPin } from './pin';
import { runUpdate } from './update';

const USAGE = `plgnz — install, diagnose and update agent plugins and MCP configs

usage: plgnz <verb> [options]

verbs:
  add <source> [--target <host>…]   install a plugin into each host's native store
  doctor [--json]                   dead commands, shadowed entries, stale installs (read-only)
  pin [--target <host>] [--all]     rewrite bare commands to absolute paths for GUI hosts
                                    (default targets: the GUI hosts; --all for every host)
  update [name] [--dry-run]         idempotent re-add from state.json; re-materializes
                                    copy-based hosts and re-applies recorded pins
  list                              list installed plugins per host
  remove <plugin>                   remove an installed plugin
  targets                           list detected agent hosts
`;

/** Flags shared by `pin` and `update`. */
interface VerbFlags {
  positionals: string[];
  targets: string[];
  all: boolean;
  dryRun: boolean;
}

function parseFlags(args: string[]): VerbFlags {
  const flags: VerbFlags = { positionals: [], targets: [], all: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target' || arg === '-t') {
      const value = args[i + 1];
      if (value !== undefined) {
        flags.targets.push(value);
        i++;
      }
    } else if (arg === '--all') {
      flags.all = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg !== undefined) {
      flags.positionals.push(arg);
    }
  }
  return flags;
}

/** Findings print the same way doctor's do: `<host>  <mark>  <message>`. */
function printFindings(findings: readonly DoctorFinding[], json: boolean): void {
  if (json) console.log(JSON.stringify(findings, null, 2));
  else for (const f of findings) console.log(formatFinding(f));
}

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

export async function main(argv: string[]): Promise<number> {
  const args = argv.filter((a) => a !== '--json');
  const json = argv.length !== args.length;
  const verb = args[0];

  if (verb === undefined || verb === 'help' || verb === '--help' || verb === '-h') {
    console.log(USAGE);
    return verb === undefined ? 2 : 0;
  }
  if (verb === 'doctor') {
    if (args.length > 1) fail(`plgnz doctor: unexpected argument: ${args[1]}`, 2);
    const { findings, exitCode } = runDoctor();
    if (json) console.log(JSON.stringify(findings, null, 2));
    else for (const f of findings) console.log(formatFinding(f));
    return exitCode;
  }
  
  if (verb === 'targets') {
    const present = hosts.filter(h => h.detect());
    if (json) {
      console.log(JSON.stringify(present.map(h => h.id), null, 2));
    } else {
      for (const h of present) console.log(h.id);
    }
    return 0;
  }
  if (verb === 'list') {
    const all: any[] = [];
    for (const h of hosts) {
      if (!h.detect()) continue;
      const installed = h.listInstalled();
      if (json) {
        all.push({ host: h.id, plugins: installed });
      } else {
        for (const p of installed) {
          console.log(`${h.id}\t${p.id}\t${p.version || p.sha || 'unknown'}`);
        }
      }
    }
    if (json) console.log(JSON.stringify(all, null, 2));
    return 0;
  }
  if (verb === 'remove') {
    const target = args[1];
    if (!target) fail(`plgnz remove: missing plugin id`, 2);
    let state = readState();
    for (const w of writers) {
      if (!w.detect()) continue;
      await w.remove(target);
    }
    state = state.filter(r => r.id !== target);
    writeState(state);
    return 0;
  }
  if (verb === 'add') {
    const flags = parseFlags(args.slice(1));
    if (flags.positionals.length > 1) fail(`plgnz add: unexpected argument: ${flags.positionals[1]}`, 2);
    const sourceArg = flags.positionals[0];
    if (sourceArg === undefined) fail(`plgnz add: missing source`, 2);

    try {
      const resolved = resolveSource(sourceArg);
      let state = readState();
      for (const w of writers) {
        if (!w.detect()) continue;
        if (flags.targets.length > 0 && !flags.targets.includes(w.id)) continue;
        for (const plugin of resolved.plugins) {
          await w.add(plugin, resolved, { dryRun: flags.dryRun });
          if (!flags.dryRun) {
            const installed = w.listInstalled(); const match = installed.find(p => p.name === plugin.name && (!plugin.marketplace || p.marketplace === plugin.marketplace)); const id = match ? match.id : (plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name);
            const idx = state.findIndex(r => r.host === w.id && r.id === id);
            const previous = idx !== -1 ? state[idx] : undefined;
            const rec: InstallRecord = {
              host: w.id,
              id,
              source: resolved.sourceUri,
              sourceSha: resolved.sha,
              installedAt: new Date().toISOString()
            };
            // Pins carry over a re-add: the fresh copy is bare again, so the
            // record keeps saying which servers this install wants pinned and
            // `update` re-applies them.
            if (previous?.pins !== undefined) rec.pins = previous.pins;
            if (idx !== -1) state[idx] = rec;
            else state.push(rec);
          }
        }
      }
      if (!flags.dryRun) writeState(state);
    } catch (e: any) {
      fail(e.message, 1);
    }
    return 0;
  }
  if (verb === 'pin') {
    const flags = parseFlags(args.slice(1));
    if (flags.positionals.length > 0) fail(`plgnz pin: unexpected argument: ${flags.positionals[0]}`, 2);
    const known = new Set(writers.map((w) => w.id));
    for (const target of flags.targets) {
      if (!known.has(target)) {
        fail(`plgnz pin: unknown target '${target}' (known: ${[...known].join(', ')})`, 2);
      }
    }
    const result = await runPin({ targets: flags.targets, all: flags.all, dryRun: flags.dryRun });
    printFindings(result.findings, json);
    return result.exitCode;
  }
  if (verb === 'update') {
    const flags = parseFlags(args.slice(1));
    if (flags.positionals.length > 1) fail(`plgnz update: unexpected argument: ${flags.positionals[1]}`, 2);
    const result = await runUpdate(flags.positionals[0], { dryRun: flags.dryRun });
    printFindings(result.findings, json);
    return result.exitCode;
  }

  fail(`plgnz: unknown verb '${verb}'\n\n${USAGE}`, 2);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('cli.ts')) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
