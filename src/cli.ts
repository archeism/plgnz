/**
 * CLI entrypoint. Verbs: add, doctor, pin, update, list, remove, targets.
 * This phase implements `doctor`; the rest are stubs that print
 * `not implemented` and exit 2 (AGENTS.md verbs list).
 */
import { runDoctor, formatFinding } from './doctor';

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

const STUBBED = new Set(['add', 'pin', 'update', 'list', 'remove', 'targets']);

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
  if (STUBBED.has(verb)) {
    fail(`open-plugin ${verb}: not implemented`, 2);
  }
  fail(`open-plugin: unknown verb '${verb}'\n\n${USAGE}`, 2);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('cli.ts')) {
  process.exitCode = main(process.argv.slice(2));
}
