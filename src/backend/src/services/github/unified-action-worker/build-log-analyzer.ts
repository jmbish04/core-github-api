import { dispatchToActionWorker } from './dispatcher';

export interface BuildLogAnalyzerOptions {
  githubOwner: string;
  githubRepo: string;
  workerName?: string;
  env: Env;
}

export async function dispatchBuildLogAnalyzer(options: BuildLogAnalyzerOptions) {
  return await dispatchToActionWorker({
    taskType: 'build_log_analyzer',
    githubOwner: options.githubOwner,
    githubRepo: options.githubRepo,
    requestPayload: {
      workerName: options.workerName,
    },
    env: options.env,
  });
}
