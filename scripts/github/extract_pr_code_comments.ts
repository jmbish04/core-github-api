
import { Octokit } from '@octokit/rest';
// Environment variables provided by shell or runtime

// Configuration
const GITHUB_TOKEN = process.env.GH_TOKEN_CORE_GITHUB_WORKER;

if (!GITHUB_TOKEN) {
    console.error("Error: GH_TOKEN_CORE_GITHUB_WORKER environment variable is not set.");
    console.error("Please export it: export GH_TOKEN_CORE_GITHUB_WORKER='your_token_here'");
    process.exit(1);
}

const octokit = new Octokit({
    auth: GITHUB_TOKEN,
});

function parsePrUrl(url: string) {
    try {
        const u = new URL(url);
        const pathParts = u.pathname.split('/').filter(Boolean);

        // Expected: /owner/repo/pull/number
        if (pathParts.length < 4 || pathParts[2] !== 'pull') {
            throw new Error('Invalid GitHub PR URL');
        }

        return {
            owner: pathParts[0],
            repo: pathParts[1],
            pull_number: parseInt(pathParts[3], 10)
        };
    } catch (e: any) {
        throw new Error(`Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/number. ${e.message}`);
    }
}

const extractSuggestion = (body: string): string | undefined => {
    const pattern = /```suggestion\r?\n([\s\S]*?)\r?\n```/;
    const match = body.match(pattern);
    return match ? match[1] : undefined;
}

async function fetchAllReviewComments(owner: string, repo: string, pull_number: number) {
    const comments: any[] = [];

    // Octokit automatic pagination
    const iterator = octokit.paginate.iterator(octokit.rest.pulls.listReviewComments, {
        owner,
        repo,
        pull_number,
        per_page: 100,
    });

    for await (const { data } of iterator) {
        comments.push(...data);
    }

    return comments;
}

function transformToSchema(comment: any) {
    return {
        id: comment.id,
        path: comment.path,
        line: comment.line,
        start_line: comment.start_line,
        original_line: comment.original_line,
        body: comment.body || "",
        diff_hunk: comment.diff_hunk,
        suggestion: extractSuggestion(comment.body || ""),
        user: {
            login: comment.user?.login || "Unknown",
            avatar_url: comment.user?.avatar_url || ""
        },
        created_at: comment.created_at,
        html_url: comment.html_url
    };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: npx ts-node tests/extract_pr_code_comments.ts <PR_URL>");
        process.exit(1);
    }

    const prUrl = args[0];

    try {
        const { owner, repo, pull_number } = parsePrUrl(prUrl);
        // console.error(`Fetching comments for ${owner}/${repo} PR #${pull_number}...`);

        const rawComments = await fetchAllReviewComments(owner, repo, pull_number);
        const formattedComments = rawComments.map(transformToSchema);

        console.log(JSON.stringify(formattedComments, null, 2));

    } catch (e: any) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
}

main();
