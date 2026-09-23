#!/usr/bin/env bun
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [sourceArgument] = process.argv.slice(2);
const sourceRoot = resolve(sourceArgument ?? "/tmp/plgnz-zcode-official-ezY3iN/source");
const adapterModule = await import(
  pathToFileURL(join(sourceRoot, "apps/zcode-cli/packages/adapters/src/commands/index.ts")).href,
);
const expandModule = await import(
  pathToFileURL(join(sourceRoot, "apps/zcode-cli/packages/cli/src/custom-command-expand.ts")).href,
);

const root = mkdtempSync(join(tmpdir(), "zcode-command-audit-"));
try {
  mkdirSync(join(root, "plugin"), { recursive: true });
  writeFileSync(
    join(root, "plugin", "report.md"),
    "---\ndescription: Report\nargument-hint: [topic]\n---\nstatic body\n",
  );
  const adapter = adapterModule.createNodeCustomCommandAdapter({
    extraResolvedRoots: [{ path: root, scope: "project", source: "plugin", priority: 1, plugin: "demo" }],
  });
  const discovery = await adapter.discoverCommands({ workingDirectory: root });
  const expansion = expandModule.expandCliCustomCommandPrompt({
    args: "first \"second value\"",
    command: {
      content: "all=$ARGUMENTS one=$1 two=$2",
      metadata: { name: "plugin:report", scope: "plugin", source: "plugin" },
    },
  });
  console.log(JSON.stringify({ commands: discovery.commands, expansion }, null, 2));
} finally {
  rmSync(root, { force: true, recursive: true });
}
