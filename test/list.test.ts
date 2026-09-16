import { test, expect, describe } from 'bun:test';
import { withHostEnvAsync, initGitRepo } from './util';
import { main } from '../src/cli';

describe('list', () => {
  test('lists installed plugins', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      // Temporarily override console.log to catch the output
      const origLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => logs.push(args.join(' '));
      
      const code = await main(['list']);
      
      console.log = origLog;
      expect(code).toBe(0);
      expect(logs.some(l => l.includes('claude-code'))).toBe(true);
    });
  });
  
  test('json output', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const origLog = console.log;
      let output = '';
      console.log = (msg: string) => output = msg;
      
      const code = await main(['list', '--json']);
      
      console.log = origLog;
      expect(code).toBe(0);
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.some((entry: any) => entry.host === 'claude-code')).toBe(true);
    });
  });
});
