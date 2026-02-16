/**
 * @file src/octokit/core.ts
 * @description This file initializes the Octokit REST and GraphQL clients with retry and throttling plugins.
 * @owner AI-Builder
 */

import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'


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

const MyOctokit = (Octokit as any).plugin(retry as any, throttling as any)

let octokit: Octokit
let gql: typeof graphql

/**
 * Initializes the Octokit clients.
 * @param {Bindings} bindings - The Cloudflare Worker bindings.
 */
const initOctokit = async (bindings: Env) => {
  if (!octokit) {
    let token: string | null = null;
    // Handle both string (local dev/legacy) and SecretStore (production) types
    if (typeof bindings.GITHUB_TOKEN === 'string') {
        token = bindings.GITHUB_TOKEN;
    } else if (bindings.GITHUB_TOKEN && typeof (bindings.GITHUB_TOKEN as any).get === 'function') {
        token = await (bindings.GITHUB_TOKEN as any).get();
    }

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
  if (!gql && octokit) {
     // We can't easily extract the token back from octokit instance for graphql if we didn't save it.
     // But we just resolved it above if we were in the !octokit block.
     // If octokit was already initialized, we assume gql might be too, or we need the token again.
     // Simplified: Just re-resolve token if gql is missing.
      let token: string | null = null;
      if (typeof bindings.GITHUB_TOKEN === 'string') {
          token = bindings.GITHUB_TOKEN;
      } else if (bindings.GITHUB_TOKEN && typeof (bindings.GITHUB_TOKEN as any).get === 'function') {
          token = await (bindings.GITHUB_TOKEN as any).get();
      }

    gql = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
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
