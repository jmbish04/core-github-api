import { dispatchToActionWorker } from './dispatcher';

export interface DeepResearchOptions {
  githubOwner: string;
  githubRepo: string;
  query: string;
  depth: 'shallow' | 'deep';
  env: Env;
}

export async function dispatchDeepResearch(options: DeepResearchOptions) {
  return await dispatchToActionWorker({
    taskType: 'deep_research',
    githubOwner: options.githubOwner,
    githubRepo: options.githubRepo,
    requestPayload: {
      query: options.query,
      depth: options.depth,
    },
    env: options.env,
  });
}
