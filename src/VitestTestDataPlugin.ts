import { getCommonMetadata, sendTestData } from './common';
import { v1 as uuidv1 } from 'uuid';
import type { Reporter, Vitest, Suite, Task } from 'vitest';
import type { VitestTestFile, VitestTestCase, VitestTestData } from './types';
import safelyTry from 'safely-try';

export default class VitestTestDataPlugin implements Reporter {
  private ctx!: Vitest;
  private readonly customIdentifier: string | undefined;

  constructor(customIdentifier: string | undefined = process.env.npm_lifecycle_event) {
    this.customIdentifier = customIdentifier;
  }

  async onInit(ctx: Vitest) {
    this.ctx = ctx;
  }

  private getVitestVersion() {
    const [version] = safelyTry(() => require('vitest/package.json').version as string);
    return version;
  }

  private iterateVitestTasks(
    filename: string,
    prefix: string,
    tasks: Task[],
  ): VitestTestCase[] {
    const testcases: VitestTestCase[] = [];

    for (const task of tasks) {
      if (task.type === 'test') {
        const errors = task.result?.errors ?? [];
        testcases.push({
          name: `${prefix}${task.name}`,
          status: task.result?.state ?? null,
          startTime: task.result?.startTime ?? 0,
          duration: task.result?.duration ?? 0,
          errorMessage: errors.length === 0 ? null : errors.map((e) => e.message),
          filename: filename,
        });
      } else {
        const suite = task as Suite;
        const newPrefix =
          prefix.length > 0 ? `${prefix}${suite.name} > ` : `${suite.name} > `;
        testcases.push(
          ...this.iterateVitestTasks(filename, newPrefix, suite.tasks ?? []),
        );
      }
    }

    return testcases;
  }

  async onFinished(files = this.ctx.state.getFiles()) {
    const config = this.ctx.config;

    const testfiles: VitestTestFile[] = [];
    let testcases: VitestTestCase[] = [];

    for (const file of files) {
      testfiles.push({
        name: file.name,
        collectDuration: file.collectDuration ?? null,
        setupDuration: file.setupDuration ?? null,
        prepareDuration: file.prepareDuration ?? null,
        environmentLoad: file.environmentLoad ?? null,
        status: file.result?.state ?? null,
        startTime: file.result?.startTime ?? 0,
        duration: file.result?.duration ?? 0,
      });

      testcases.push(...this.iterateVitestTasks(file.name, '', file.tasks));
    }

    const timeTaken = files.reduce((acc, file) => acc + (file.result?.duration ?? 0), 0);
    const testData: VitestTestData = {
      ...getCommonMetadata(timeTaken, this.customIdentifier),
      type: 'vitest',
      vitestVersion: this.getVitestVersion() ?? null,
      mode: config.mode,
      maxConcurrency: config.maxConcurrency,
      watchMode: config.watch,
      testEnvironment: config.environment,
      runId: uuidv1(),
      files: testfiles,
      testcases,
    };

    sendTestData(testData);
  }
}
