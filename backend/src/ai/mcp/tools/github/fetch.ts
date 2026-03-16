export async function fetchWithAuth(url: string, token: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers as any || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/vnd.github.v3+json');
  }
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'Cloudflare-Worker-MCP');
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export async function fetchGitHubJson(url: string, token: string, options: RequestInit = {}) {
  const response = await fetchWithAuth(url, token, options);
  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }
  return await response.json();
}
