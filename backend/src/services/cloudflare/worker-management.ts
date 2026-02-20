import { type Binding, type GitConfig } from '@/types/cloudflare/deployment';

export class WorkerManagementService {
	private readonly baseUrl = 'https://api.cloudflare.com/client/v4';
	private readonly accountId: string;
	private readonly apiToken: string;

	constructor(accountId: string, apiToken: string) {
		this.accountId = accountId;
		this.apiToken = apiToken;
	}

	private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
		const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
		// All AI-related analytics or logs route through Cloudflare AI Gateway
		const finalUrl = path.includes('ai') ? `https://gateway.ai.cloudflare.com/v1/${this.accountId}/default/${path}` : url;

		const response = await fetch(finalUrl, {
			...options,
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
				...options.headers,
			},
		});

		const data = await response.json() as any;
		if (!response.ok) {
			throw new Error(`Cloudflare API Error: ${data.errors?.[0]?.message || response.statusText}`);
		}
		return data.result;
	}

	// --- 1. Git & CI/CD Integration ---

	/**
	 * Configures an existing worker for CI/CD with a GitHub repo.
	 */
	async setupGitIntegration(scriptName: string, config: GitConfig) {
		// Step A: Link GitHub Repository to Account
		const repoConnection = await this.request<{ repo_connection_uuid: string }>(
			`/accounts/${this.accountId}/builds/repo_connections`,
			{
				method: 'POST',
				body: JSON.stringify({
					provider_type: config.provider,
					repo_name: config.repoName,
					provider_account_name: config.repoOwner,
				}),
			}
		);

		// Step B: Create Build Trigger for the script
		return await this.request(
			`/accounts/${this.accountId}/builds/workers/${scriptName}/triggers`,
			{
				method: 'POST',
				body: JSON.stringify({
					trigger_name: `CI/CD for ${scriptName}`,
					repo_connection_uuid: repoConnection.repo_connection_uuid,
					build_command: config.buildCommand || 'npm run build',
					deploy_command: config.deployCommand,
					branch_includes: [config.productionBranch],
					root_directory: '/',
				}),
			}
		);
	}

	/**
	 * Manually trigger a build for a script
	 */
	async triggerBuild(scriptName: string, branch: string = 'main') {
		return await this.request(
			`/accounts/${this.accountId}/builds/workers/${scriptName}/builds`,
			{
				method: 'POST',
				body: JSON.stringify({ branch }),
			}
		);
	}

	/**
	 * Fetch build logs for a specific build run
	 */
	async getBuildLogs(buildUuid: string) {
		return await this.request<{ lines: [number, string][] }>(
			`/accounts/${this.accountId}/builds/builds/${buildUuid}/logs`
		);
	}

	// --- 2. Resource Provisioning ---

	async provisionD1(name: string) {
		return await this.request<{ uuid: string }>(`/accounts/${this.accountId}/d1/database`, {
			method: 'POST',
			body: JSON.stringify({ name }),
		});
	}

	async provisionKV(title: string) {
		return await this.request<{ id: string }>(`/accounts/${this.accountId}/workers/kv/namespaces`, {
			method: 'POST',
			body: JSON.stringify({ title }),
		});
	}

	async provisionR2(name: string) {
		return await this.request(`/accounts/${this.accountId}/r2/buckets`, {
			method: 'POST',
			body: JSON.stringify({ name }),
		});
	}

	// --- 3. Bindings Management ---

	/**
	 * Appends new bindings to a worker using the settings endpoint (avoids re-uploading script).
	 */
	async attachBindings(scriptName: string, newBindings: Binding[]) {
		// Get existing script settings (bindings, compatibility settings, etc.)
		const rawSettings = await this.request<any>(
			`/accounts/${this.accountId}/workers/scripts/${scriptName}/settings`
		);
		console.log('Current settings:', JSON.stringify(rawSettings, null, 2));

		const currentBindings = rawSettings.bindings || [];
		
		// Merge bindings: new bindings overtake old ones with the same name
		const mergedBindings = [...currentBindings];
		for (const newBinding of newBindings) {
			const index = mergedBindings.findIndex((b: any) => b.name === newBinding.name);
			if (index !== -1) {
				mergedBindings[index] = newBinding;
			} else {
				mergedBindings.push(newBinding);
			}
		}

		// Update settings with merged bindings
		// Use PATCH to update specific settings without overwriting everything, 
		// but the endpoint is weird. The docs say PUT /settings replaces settings.
		// However, we only want to update 'bindings'.
		// Re-sending other settings is safer to avoid clearing them.
		
		const newSettings = {
			...rawSettings,
			bindings: mergedBindings
		};

		return await this.request(
			`/accounts/${this.accountId}/workers/scripts/${scriptName}/settings`,
			{
				method: 'PUT',
				body: JSON.stringify(newSettings),
			}
		);
	}
}
