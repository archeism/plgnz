/**
 * doctor's import graph must be writer-free (AGENTS.md: "doctor is read-only
 * by construction — it must not import any writer").
 *
 * The guarantee is about loading, not calling: a module's writer is evaluated
 * with the module, so honoring the rule only at symbol granularity (doctor
 * imports `hosts`, the index imports the writers) still pulls writeFileSync
 * into doctor. This test therefore walks the *value-import graph* of
 * src/doctor.ts statically — following relative imports the way the runtime
 * does, skipping `import type`, which verbatimModuleSyntax erases — and fails
 * when any module in it is a writer module, exports a writer symbol, or
 * performs a filesystem mutation.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const srcDir = join(import.meta.dir, '..', 'src');

/** Module specifiers a file imports for value; `import type`/`export type` are erased. */
function valueImports(text: string): string[] {
  const specs: string[] = [];
  const re = /(?:^|\n)[ \t]*(?:import|export)[ \t]+(type[ \t]+)?[^;'"]*?from[ \t]*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === undefined) specs.push(m[2]!);
  }
  return specs;
}

/** Resolve a relative specifier the way the runtime does: exact, `.ts`, or `<dir>/index.ts`. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // node: and bare specifiers carry no project code
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Transitive value-import closure of `entry`, as a sorted list of files. */
function importGraph(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of valueImports(readFileSync(file, 'utf8'))) {
      const next = resolveSpecifier(file, spec);
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

/** Writer modules by name: the per-host `<host>-writer.ts`, `writers.ts`, and the shared write sides. */
const WRITER_MODULE = /(^|[-\/])(writer|writers|write)\.ts$/;

/** Exported symbols (`export const/function/class …`) that name a writer. */
const WRITER_SYMBOL = /Writer$/;

/** Filesystem mutations a read-only verb must not perform. */
const FS_MUTATION = /\b(writeFileSync|appendFileSync|rmSync|unlinkSync|rmdirSync|cpSync|mkdirSync|renameSync|chmodSync|truncateSync)\s*\(/;

/** Drop block and line comments so commented-out writes cannot mask a real one (or trip a false one). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?:^|\s)\/\/[^\n]*/g, '');
}

function exportedSymbols(text: string): string[] {
  const names: string[] = [];
  const re = /(?:^|\n)[ \t]*export[ \t]+(?:async[ \t]+)?(?:const|function|class|let|var)[ \t]+([A-Za-z0-9_$]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) names.push(m[1]!);
  return names;
}

describe('doctor import graph (read-only by construction)', () => {
  const modules = importGraph(join(srcDir, 'doctor.ts'));

  test('the walk reaches real modules inside src/', () => {
    expect(modules.length).toBeGreaterThan(1);
    for (const file of modules) expect(file.startsWith(srcDir)).toBe(true);
  });

  test('no module in the graph is a writer module', () => {
    const offenders = modules.filter((file) => WRITER_MODULE.test(basename(file)));
    expect(offenders).toEqual([]);
  });

  test('no module in the graph exports a writer symbol', () => {
    const offenders = modules.flatMap((file) =>
      exportedSymbols(readFileSync(file, 'utf8'))
        .filter((name) => WRITER_SYMBOL.test(name))
        .map((name) => `${file} exports ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  test('no module in the graph mutates the filesystem', () => {
    const offenders = modules.filter((file) => FS_MUTATION.test(stripComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
