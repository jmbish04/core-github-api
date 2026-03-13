import { dispatchToActionWorker } from './dispatcher';

export interface AwesomeStarsOptions {
  githubOwner: string;
  githubRepo: string;
  targetCategory?: string;
  env: Env;
}

export async function dispatchAwesomeStars(options: AwesomeStarsOptions) {
  return await dispatchToActionWorker({
    taskType: 'awesome_stars',
    githubOwner: options.githubOwner,
    githubRepo: options.githubRepo,
    requestPayload: {
      targetCategory: options.targetCategory,
    },
    env: options.env,
  });
}
