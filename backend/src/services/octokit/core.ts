/**
 * @file src/octokit/core.ts
 * @description This file initializes the Octokit REST and GraphQL clients with retry and throttling plugins.
 * @owner AI-Builder
 */

// Types are safe to import top-level as they are erased at runtime
import type { Octokit } from '@octokit/rest'
import type { graphql } from '@octokit/graphql'

let MyOctokit: any;


type ThrottleOptions = {
  method: string;
  url: string;
};

type ThrottleLogger = {
  log: {
    warn: (message: string) => void;
    info: (message: string) => void;
  };
};

// MyOctokit will be initialized dynamically

let octokit: Octokit
let gql: typeof graphql

/**
 * Initializes the Octokit clients.
 * @param {Bindings} bindings - The Cloudflare Worker bindings.
 */
const initOctokit = async (bindings: Env) => {
  if (!octokit) {
    const { getGithubToken } = await import('@utils/secrets');
    const { Octokit: RealOctokit } = await import('@octokit/rest');
    const { retry } = await import('@octokit/plugin-retry');
    const { throttling } = await import('@octokit/plugin-throttling');
    
    MyOctokit = (RealOctokit as any).plugin(retry as any, throttling as any);

    const token = await getGithubToken(bindings);

    if (!token) {
        console.warn("GITHUB_TOKEN is missing or invalid");
    }

    octokit = new MyOctokit({
      auth: token || '', // Pass empty string if missing to allow unauthorized reqs if permitted, or fail downstream
      throttle: {
        onRateLimit: (
          retryAfter: number,
          options: ThrottleOptions,
          octokitClient: ThrottleLogger,
          retryCount: number
        ) => {
          octokitClient.log.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );

          if (retryCount < 1) {
            // only retries once
            octokitClient.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
          return false;
        },
        onSecondaryRateLimit: (
          retryAfter: number,
          options: ThrottleOptions,
          octokitClient: ThrottleLogger,
        ) => {
          // does not retry, only logs a warning
          octokitClient.log.warn(
            `SecondaryRateLimit detected for request ${options.method} ${options.url}`
          );
          octokitClient.log.info(`Secondary rate limit retry-after: ${retryAfter}`);
        },
      },
    }) as Octokit
  }
  
  if (!gql) {
     const { getGithubToken } = await import('@utils/secrets');
     const { graphql: realGraphql } = await import('@octokit/graphql');
     const token = await getGithubToken(bindings);
     
    gql = realGraphql.defaults({
      headers: {
        authorization: `token ${token || ''}`,
      },
    })
  }
}

/**
 * Returns the Octokit REST client.
 * @returns {Promise<Octokit>} The Octokit REST client.
 */
export const getOctokit = async (bindings: Env): Promise<Octokit> => {
  await initOctokit(bindings)
  return octokit
}

/**
 * Returns the Octokit GraphQL client.
 * @returns {Promise<graphql>} The Octokit GraphQL client.
 */
export const getGraphql = async (bindings: Env): Promise<typeof graphql> => {
  await initOctokit(bindings)
  return gql
}

/**
 * @extension_point
 * This is a good place to add other Octokit plugins or custom configurations.
 */
