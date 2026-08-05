import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, parse } from 'node:path';
import safelyTry from './safely-retry';

export interface GitInfo {
  repository: string | undefined;
  repositoryName: string | undefined;
  branch: string | undefined;
  commitSha: string | undefined;
}

const runGitCommand = (args: string[], cwd: string): string | undefined => {
  const { data: result } = safelyTry(() =>
    spawnSync('git', args, { cwd }).stdout.toString().trim(),
  );
  return result ? result : undefined;
};

/** Locate the real .git directory, following the `gitdir:` pointer used by worktrees. */
const findGitDir = (start: string): string | undefined => {
  let dir = start;
  const { root } = parse(start);
  for (;;) {
    const candidate = join(dir, '.git');
    if (existsSync(candidate)) {
      try {
        const stat = statSync(candidate);
        if (stat.isDirectory()) return candidate;
        const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(candidate, 'utf8'))?.[1];
        if (pointer) return isAbsolute(pointer) ? pointer : join(dir, pointer);
      } catch {
        return undefined;
      }
      return undefined;
    }
    if (dir === root) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

/**
 * A cheap value that changes whenever any of the git facts we report could have
 * changed: checkout, commit, fetch that rewrites packed-refs, or a remote edit.
 * Three `statSync` calls beat three `git` process spawns by two orders of magnitude,
 * which matters because this runs once per HMR event.
 */
const fingerprint = (gitDir: string): string => {
  const parts: string[] = [];
  const mtime = (p: string): string => {
    try {
      return String(statSync(p).mtimeMs);
    } catch {
      return '-';
    }
  };

  const headPath = join(gitDir, 'HEAD');
  parts.push(mtime(headPath));
  try {
    const head = readFileSync(headPath, 'utf8').trim();
    const ref = /^ref:\s*(.+)$/.exec(head)?.[1];
    parts.push(ref ? mtime(join(gitDir, ref)) : head);
  } catch {
    parts.push('-');
  }
  parts.push(mtime(join(gitDir, 'packed-refs')));
  parts.push(mtime(join(gitDir, 'config')));
  return parts.join('|');
};

let cache: { cwd: string; key: string; info: GitInfo } | undefined;

const readGitInfo = (cwd: string): GitInfo => {
  const repository = runGitCommand(['config', '--get', 'remote.origin.url'], cwd);
  let repositoryName = repository
    ? repository.substring(repository.lastIndexOf('/') + 1)
    : undefined;
  repositoryName = repositoryName?.endsWith('.git')
    ? repositoryName.substring(0, repositoryName.lastIndexOf('.'))
    : repositoryName;

  return {
    repository,
    repositoryName,
    branch: runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    commitSha: runGitCommand(['rev-parse', 'HEAD'], cwd),
  };
};

/**
 * Git facts for `cwd`, cached for the lifetime of the process and invalidated only
 * when the repository state actually changes. Never spawns `git` on a cache hit.
 */
export const getGitInfo = (cwd: string = process.cwd()): GitInfo => {
  const gitDir = findGitDir(cwd);
  const key = gitDir ? fingerprint(gitDir) : 'no-git';

  if (cache && cache.cwd === cwd && cache.key === key) return cache.info;

  const info = readGitInfo(cwd);
  cache = { cwd, key, info };
  return info;
};

/** test seam / explicit invalidation hook for consumers that watch .git themselves */
export const invalidateGitCache = (): void => {
  cache = undefined;
};
