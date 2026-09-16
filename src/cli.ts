/**
 * CLI entrypoint. Verbs: add, doctor, pin, update, list, remove, targets.
 * This phase implements `doctor`; the rest are stubs that print
 * `not implemented` and exit 2 (AGENTS.md verbs list).
 */
import { runDoctor, formatFinding } from './doctor';
import { hosts, writers } from './hosts';
import { resolveSource } from './source';
import { readState, writeState } from './state';
import type { InstallRecord } from './state';

const USAGE = `open-plugin — install, diagnose and update agent plugins and MCP configs

usage: open-plugin <verb> [options]

verbs:
  add <source> [--target <host>…]   install a plugin into each host's native store
  doctor [--json]                   dead commands, shadowed entries, stale installs (read-only)
  pin                               rewrite bare commands to absolute paths for GUI hosts
  update                            idempotent re-add; re-materialize copy-based hosts
  list                              list installed plugins per host
  remove <plugin>                   remove an installed plugin
  targets                           list detected agent hosts
`;

const STUBBED = new Set(['pin', 'update']);

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

export function main(argv: string[]): number {
  const args = argv.filter((a) => a !== '--json');
  const json = argv.length !== args.length;
  const verb = args[0];

  if (verb === undefined || verb === 'help' || verb === '--help' || verb === '-h') {
    console.log(USAGE);
    return verb === undefined ? 2 : 0;
  }
  if (verb === 'doctor') {
    if (args.length > 1) fail(`open-plugin doctor: unexpected argument: ${args[1]}`, 2);
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
    if (!target) fail(`open-plugin remove: missing plugin id`, 2);
    let state = readState();
    let promises = [];
    for (const w of writers) {
      if (!w.detect()) continue;
      promises.push(w.remove(target));
    }
    Promise.all(promises).then(() => {
      // remove from state
      state = state.filter(r => r.id !== target);
      writeState(state);
    }).catch(e => fail(e.message, 1));
    return 0;
  }
  if (verb === 'add') {
    const sourceStr = args[1];
    if (!sourceStr) fail(`open-plugin add: missing source`, 2);
    const targetFlags = argv.filter((a, i) => argv[i-1] === '--target' || argv[i-1] === '-t');
    
    // We should parse CLI in a simple way for the phase
    const dryRun = argv.includes('--dry-run');
    
    // Run async inside sync function
    (async () => {
      try {
        const resolved = resolveSource(sourceStr);
        let state = readState();
        for (const w of writers) {
          if (!w.detect()) continue;
          if (targetFlags.length > 0 && !targetFlags.includes(w.id)) continue;
          for (const plugin of resolved.plugins) {
            await w.add(plugin, resolved, { dryRun });
            if (!dryRun) {
              const id = plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name;
              const idx = state.findIndex(r => r.host === w.id && r.id === id);
              const rec: InstallRecord = {
                host: w.id,
                id,
                source: resolved.sourceUri,
                sourceSha: resolved.sha,
                installedAt: new Date().toISOString()
              };
              if (idx !== -1) state[idx] = rec;
              else state.push(rec);
            }
          }
        }
        if (!dryRun) writeState(state);
      } catch(e: any) {
        fail(e.message, 1);
      }
    })();
    return 0;
  }
  
  if (STUBBED.has(verb)) {
    fail(`open-plugin ${verb}: not implemented`, 2);
  }
  fail(`open-plugin: unknown verb '${verb}'\n\n${USAGE}`, 2);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('cli.ts')) {
  process.exitCode = main(process.argv.slice(2));
}
