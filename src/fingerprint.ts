/** Stable raw-byte tree fingerprint shared by source capture and read-only verification. */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

declare const Bun: {
  CryptoHasher: new (algorithm: 'sha256') => {
    update(input: string | Uint8Array): void;
    digest(encoding: 'hex'): string;
  };
};

export function fingerprintTree(root: string): string {
  if (lstatSync(root).isSymbolicLink()) throw new Error('cannot fingerprint symlink: .');
  const hash = new Bun.CryptoHasher('sha256');
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      const relative = prefix === '' ? entry : `${prefix}/${entry}`;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`cannot fingerprint symlink: ${relative}`);
      if (stat.isDirectory()) {
        hash.update(`d\0${relative}\0`);
        walk(path, relative);
      } else if (stat.isFile()) {
        hash.update(`f\0${relative}\0`);
        const content = new Bun.CryptoHasher('sha256');
        content.update(readBytes(path));
        hash.update(content.digest('hex'));
        hash.update('\0');
      } else {
        throw new Error(`cannot fingerprint non-file resource: ${relative}`);
      }
    }
  };
  walk(root, '');
  return hash.digest('hex');
}

function readBytes(path: string): Uint8Array {
  const read = readFileSync as unknown as (file: string) => Uint8Array;
  return read(path);
}
