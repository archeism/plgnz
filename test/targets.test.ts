import { test, expect, describe } from 'bun:test';
import { withHostEnvAsync } from './util';
import { main } from '../src/cli';

describe('targets', () => {
  test('lists detected targets', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const origLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => logs.push(args.join(' '));
      
      const code = await main(['targets']);
      
      console.log = origLog;
      expect(code).toBe(0);
      expect(logs).toContain('claude-code');
    });
  });
  
  test('json output', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const origLog = console.log;
      let output = '';
      console.log = (msg: string) => output = msg;
      
      const code = await main(['targets', '--json']);
      
      console.log = origLog;
      expect(code).toBe(0);
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toContain('claude-code');
    });
  });
});
