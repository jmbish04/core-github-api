import { dispatchToActionWorker } from './dispatcher';

export interface SyncTemplatesOptions {
  githubOwner: string;
  githubRepo: string;
  templateType: 'ci' | 'docs' | 'all';
  env: Env;
}

export async function dispatchSyncTemplates(options: SyncTemplatesOptions) {
  return await dispatchToActionWorker({
    taskType: 'sync_templates',
    githubOwner: options.githubOwner,
    githubRepo: options.githubRepo,
    requestPayload: {
      templateType: options.templateType,
    },
    env: options.env,
  });
}
