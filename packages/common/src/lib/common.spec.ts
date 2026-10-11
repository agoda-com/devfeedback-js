import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { sendBuildData } from './common';
import type { RspackBuildData, ViteBuildData } from './types';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

const build = (type: string) =>
  ({ type, timeTaken: 42 }) as unknown as RspackBuildData | ViteBuildData;

describe('sendBuildData', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(axios.post).mockReset().mockResolvedValue({});
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
  });

  it.each(['rspack', 'vite'])('prints the build time for a %s build', async (type) => {
    await sendBuildData(build(type));
    expect(axios.post).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('Your build time was 42.00ms.');
  });

  it.each(['rspackhmr', 'vitehmr'])(
    'sends %s without printing anything',
    async (type) => {
      await sendBuildData(build(type));
      expect(axios.post).toHaveBeenCalledOnce();
      expect(log).not.toHaveBeenCalled();
    },
  );
});
