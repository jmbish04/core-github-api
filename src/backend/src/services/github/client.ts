import { Octokit } from '@octokit/rest';
import { App } from 'octokit';
import { getGithubToken, getGitHubAppId, getGitHubPrivateKey } from '@utils/secrets';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { WranglerInspectorService } from './wrangler-inspector';
const MyOctokit = Octokit.plugin(retry as any, throttling) as any;
const throttleOptions = {
    onRateLimit: (retryAfter: number, options: any, octokit: any) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
        if (options.request?.retryCount < 1) {
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
        }
        return false;
    },
    onSecondaryRateLimit: (retryAfter: number, options: any, octokit: any) => {
        octokit.log.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url}`);
        octokit.log.info(`Secondary rate limit retry-after: ${retryAfter}`);
    },
};

/**
 * Returns an Octokit client authenticated as the User (via Personal Access Token).
 * Actions performed will appear as the user (e.g. jmbish04).
 */
export async function getOctokitAsUser(env: Env): Promise<Octokit> {
    const token = await getGithubToken(env);
    if (!token) {
        throw new Error("Missing GITHUB_PERSONAL_ACCESS_TOKEN for user authentication.");
    }
    
    return new MyOctokit({
        auth: token,
        throttle: throttleOptions
    }) as any;
}

/**
 * Returns an Octokit client authenticated as the GitHub App (Bot).
 * If `installationId` is provided, it returns an installation octokit.
 * Otherwise, it returns the app octokit (which can only perform app-level operations).
 */
export async function getOctokitAsBot(env: Env, installationId?: number): Promise<Octokit> {
    const appId = await getGitHubAppId(env);
    const privateKey = await getGitHubPrivateKey(env);

    if (!appId || !privateKey) {
        throw new Error("Missing GITHUB_APP_ID or Private Key for bot authentication.");
    }

    const app = new App({
        appId,
        privateKey,
        Octokit: MyOctokit as any,
    });

    if (installationId) {
        return await app.getInstallationOctokit(installationId) as unknown as Octokit;
    }

    return app.octokit as unknown as Octokit;
}


