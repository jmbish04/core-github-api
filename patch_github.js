const fs = require('fs');

const file = 'backend/src/ai/mcp/tools/github/github.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const token = await getToken(env);\n  const url = getRepoApiUrl(owner, repo);\n\n  const data = await withGitHubJsonHelper(env, "FetchRepoInfo", url, token, "Failed to fetch repo info: ");',
  'const url = getRepoApiUrl(owner, repo);\n\n  const data = await withGitHubJsonHelper(env, "FetchRepoInfo", url, "Failed to fetch repo info: ");'
);

code = code.replace(
  'const token = await getToken(env);\n  // Use provided ref or fetch default branch\n  const branch = await resolveBranch(env, owner, repo, ref);\n  const url = `${getRepoApiUrl(owner, repo, `/contents/${path}`)}?ref=${branch}`;\n\n  const data = await withGitHubJsonHelper<{ content: string; encoding: string }>(env, "FetchFile", url, token, `Failed to fetch file: ${path} - `);',
  '// Use provided ref or fetch default branch\n  const branch = await resolveBranch(env, owner, repo, ref);\n  const url = `${getRepoApiUrl(owner, repo, `/contents/${path}`)}?ref=${branch}`;\n\n  const data = await withGitHubJsonHelper<{ content: string; encoding: string }>(env, "FetchFile", url, `Failed to fetch file: ${path} - `);'
);

code = code.replace(
  'const token = await getToken(env);\n  const branch = await resolveBranch(env, owner, repo, ref);\n  const url = `${getRepoApiUrl(owner, repo, `/contents/${path}`)}?ref=${branch}`;\n\n  return withGitHubJsonHelper(env, "RepoStructure", url, token, "Failed to fetch repo structure: ");',
  'const branch = await resolveBranch(env, owner, repo, ref);\n  const url = `${getRepoApiUrl(owner, repo, `/contents/${path}`)}?ref=${branch}`;\n\n  return withGitHubJsonHelper(env, "RepoStructure", url, "Failed to fetch repo structure: ");'
);

code = code.replace(
  'const token = await getToken(env);\n  const url = `https://api.github.com/search/code?q=${encodeURIComponent(\n    query\n  )}+repo:${owner}/${repo}`;\n\n  return withGitHubJsonHelper(env, "SearchCode", url, token, `Failed to search code for query "${query}": `);',
  'const url = `https://api.github.com/search/code?q=${encodeURIComponent(\n    query\n  )}+repo:${owner}/${repo}`;\n\n  return withGitHubJsonHelper(env, "SearchCode", url, `Failed to search code for query "${query}": `);'
);

code = code.replace(
  'const token = await getToken(env);\n  const fetchComments = async (url: string) => withGitHubJsonHelper<any[]>(env, "PRComments", url, token, "Failed to fetch comments: ");',
  'const fetchComments = async (url: string) => withGitHubJsonHelper<any[]>(env, "PRComments", url, "Failed to fetch comments: ");'
);

code = code.replace(
  'const token = await getToken(env);\n  const url = getRepoApiUrl(owner, repo, `/git/ref/${ref}`);\n\n  const data = await withGitHubJsonHelper(env, "GetRef", url, token, `Failed to get ref ${ref}: `);',
  'const url = getRepoApiUrl(owner, repo, `/git/ref/${ref}`);\n\n  const data = await withGitHubJsonHelper(env, "GetRef", url, `Failed to get ref ${ref}: `);'
);

code = code.replace(
  'const token = await getToken(env);\n  const url = getRepoApiUrl(owner, repo, `/git/refs`);\n  await withGitHubJsonHelper(env, "CreateBranch", url, token, `Failed to create branch ${newBranchName}: `, { method: "POST", body: { ref: `refs/heads/${newBranchName}`, sha: baseSha } });',
  'const url = getRepoApiUrl(owner, repo, `/git/refs`);\n  await withGitHubJsonHelper(env, "CreateBranch", url, `Failed to create branch ${newBranchName}: `, { method: "POST", body: { ref: `refs/heads/${newBranchName}`, sha: baseSha } });'
);

code = code.replace(
  'const token = await getToken(env);\n  const url = getRepoApiUrl(owner, repo, `/contents/${path}`);\n\n  // Base64 encode content\n  const encodedContent = encode(content);\n\n  const body: any = {\n    message,\n    content: encodedContent,\n    branch,\n  };\n\n  if (sha) {\n    body.sha = sha;\n  }\n\n  await withGitHubJsonHelper(env, "WriteFile", url, token, `Failed to write file ${path}: `, { method: "PUT", body });',
  'const url = getRepoApiUrl(owner, repo, `/contents/${path}`);\n\n  // Base64 encode content\n  const encodedContent = encode(content);\n\n  const body: any = {\n    message,\n    content: encodedContent,\n    branch,\n  };\n\n  if (sha) {\n    body.sha = sha;\n  }\n\n  await withGitHubJsonHelper(env, "WriteFile", url, `Failed to write file ${path}: `, { method: "PUT", body });'
);

code = code.replace(
  'const token = await getToken(env);\n  const url = getRepoApiUrl(owner, repo, `/pulls`);\n\n  const data = await withGitHubJsonHelper(env, "CreatePR", url, token, "Failed to create PR: ", { method: "POST", body: { title, body, head, base } });',
  'const url = getRepoApiUrl(owner, repo, `/pulls`);\n\n  const data = await withGitHubJsonHelper(env, "CreatePR", url, "Failed to create PR: ", { method: "POST", body: { title, body, head, base } });'
);

code = code.replace(
  'async function withGitHubJsonHelper<T = any>(\n  env: Env,\n  action: string,\n  url: string,\n  token: string,\n  errorMessagePrefix: string,\n  options?: { method?: string; body?: any; headers?: Record<string, string> }\n): Promise<T> {\n  try {\n    return await fetchGitHubJson<T>(url, token, options);\n  } catch (error: any) {',
  'async function withGitHubJsonHelper<T = any>(\n  env: Env,\n  action: string,\n  url: string,\n  errorMessagePrefix: string,\n  options?: { method?: string; body?: any; headers?: Record<string, string> }\n): Promise<T> {\n  try {\n    const token = await getToken(env);\n    return await fetchGitHubJson<T>(url, token, options);\n  } catch (error: any) {'
);

fs.writeFileSync(file, code);
