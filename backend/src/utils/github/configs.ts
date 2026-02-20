/**
 * @module GithubConfigs
 * @description Centralized configuration management for GitHub ecosystem constants and environment variables.
 * This module ensures consistent access to repository owners, template names, and branch standards
 * across the application.
 */

export interface GithubConfigs {
  /** The GitHub organization or username owning the repositories */
  owner: string;
  /** The name of the repository used as a template for new projects */
  templateRepo: string;
  /** The default branch name (usually 'main' or 'master') */
  defaultBranch: string;
}

/**
 * Retrieves the full GitHub configuration object for the current environment.
 * Falls back to hardcoded defaults if environment variables are missing.
 *
 * @param {Env} env - The Cloudflare Worker environment bindings
 * @returns {GithubConfigs} The standard GitHub configuration object
 *
 * @example
 * const config = getGithubConfigs(env);
 * console.log(config.owner); // "jmbish04"
 */
export const DEFAULT_GITHUB_OWNER = "jmbish04";
export const DEFAULT_TEMPLATE_REPO = "core-github-standardization";
export const DEFAULT_GITHUB_BRANCH = "main";

/**
 * Retrieves the full GitHub configuration object for the current environment.
 * Falls back to hardcoded defaults if environment variables are missing.
 *
 * @param {Env} env - The Cloudflare Worker environment bindings
 * @returns {GithubConfigs} The standard GitHub configuration object
 *
 * @example
 * const config = getGithubConfigs(env);
 * console.log(config.owner); // "jmbish04"
 */
export const getGithubConfigs = (env: Env): GithubConfigs => {
  return {
    owner: env.GITHUB_OWNER || DEFAULT_GITHUB_OWNER,
    templateRepo: env.TEMPLATES_REPO_NAME || DEFAULT_TEMPLATE_REPO,
    defaultBranch: DEFAULT_GITHUB_BRANCH,
  };
};

/**
 * Retrieves a specific GitHub configuration property.
 *
 * @template K - The key of the configuration property
 * @param {Env} env - The Cloudflare Worker environment bindings
 * @param {K} key - The specific configuration key to retrieve
 * @returns {GithubConfigs[K]} The value of the requested configuration property
 *
 * @example
 * const owner = getGithubConfig(env, 'owner');
 */
export const getGithubConfig = <K extends keyof GithubConfigs>(env: Env, key: K): GithubConfigs[K] => {
  return getGithubConfigs(env)[key];
};
