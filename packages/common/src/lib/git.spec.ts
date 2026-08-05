import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getGitInfo, invalidateGitCache } from './git';

describe('getGitInfo', () => {
  let repo: string;

  beforeEach(() => {
    invalidateGitCache();
    repo = mkdtempSync(join(tmpdir(), 'devfeedback-git-'));
    execFileSync('git', ['init', '--initial-branch=main'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
    execFileSync('git', ['config', 'remote.origin.url', 'git@host:team/my-repo.git'], {
      cwd: repo,
    });
    writeFileSync(join(repo, 'a.txt'), 'a');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'first'], { cwd: repo });
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    invalidateGitCache();
    vi.restoreAllMocks();
  });

  it('reports branch, sha and repository name', () => {
    const info = getGitInfo(repo);
    expect(info.branch).toBe('main');
    expect(info.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(info.repository).toBe('git@host:team/my-repo.git');
    expect(info.repositoryName).toBe('my-repo');
  });

  it('serves repeated calls from cache rather than re-running git', () => {
    // this is the HMR hot path — an identical object reference means nothing re-ran
    const first = getGitInfo(repo);
    for (let i = 0; i < 20; i++) {
      expect(getGitInfo(repo)).toBe(first);
    }
  });

  it('picks up a new commit', () => {
    const before = getGitInfo(repo).commitSha;
    writeFileSync(join(repo, 'b.txt'), 'b');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-m', 'second'], { cwd: repo });

    expect(getGitInfo(repo).commitSha).not.toBe(before);
  });

  it('picks up a branch switch', () => {
    execFileSync('git', ['checkout', '-b', 'feature/x'], { cwd: repo });
    expect(getGitInfo(repo).branch).toBe('feature/x');
  });

  it('returns undefined fields outside a repository, without throwing', () => {
    const plain = mkdtempSync(join(tmpdir(), 'devfeedback-nogit-'));
    try {
      const info = getGitInfo(plain);
      expect(info.repository).toBeUndefined();
      expect(info.repositoryName).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
