import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_SKIP,
  _resetCommandConfigCache,
  readCommandConfig,
  workspaceRoot,
} from './workspace';

describe('workspace', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devfeedback-ws-'));
    _resetCommandConfigCache();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('workspaceRoot', () => {
    it('finds the pnpm workspace root from a package directory', () => {
      writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: ["packages/*"]\n');
      const pkg = join(root, 'packages', 'app');
      mkdirSync(pkg, { recursive: true });
      expect(workspaceRoot(pkg)).toBe(root);
    });

    it('finds an Nx workspace root', () => {
      writeFileSync(join(root, 'nx.json'), '{}');
      const pkg = join(root, 'apps', 'web');
      mkdirSync(pkg, { recursive: true });
      expect(workspaceRoot(pkg)).toBe(root);
    });

    it('falls back to the git root for a single-package repo', () => {
      mkdirSync(join(root, '.git'));
      const sub = join(root, 'src');
      mkdirSync(sub);
      expect(workspaceRoot(sub)).toBe(root);
    });
  });

  describe('readCommandConfig', () => {
    it('defaults to the long-running skip list and no overrides', () => {
      expect(readCommandConfig(root)).toEqual({ phases: {}, skip: DEFAULT_SKIP });
      expect(DEFAULT_SKIP).toEqual(['dev', 'start', 'serve', 'watch']);
    });

    it('reads phases and skip from the root package.json', () => {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devfeedback: { phases: { e2e: 'test' }, skip: ['storybook'] } }),
      );
      expect(readCommandConfig(root)).toEqual({
        phases: { e2e: 'test' },
        skip: ['storybook'],
      });
    });

    it('keeps the default skip list when only phases are configured', () => {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devfeedback: { phases: { e2e: 'test' } } }),
      );
      expect(readCommandConfig(root).skip).toEqual(DEFAULT_SKIP);
    });

    it('is read once per process and cached', () => {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devfeedback: { skip: ['a'] } }),
      );
      expect(readCommandConfig(root).skip).toEqual(['a']);
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devfeedback: { skip: ['b'] } }),
      );
      expect(readCommandConfig(root).skip).toEqual(['a']);
    });

    it('survives an unreadable package.json', () => {
      writeFileSync(join(root, 'package.json'), '{ not json');
      expect(readCommandConfig(root)).toEqual({ phases: {}, skip: DEFAULT_SKIP });
    });
  });
});
