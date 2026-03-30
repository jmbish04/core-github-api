import { FiGithub, FiDatabase, FiCloud, FiCheckCircle, FiTrello, FiZap, FiCode, FiCpu, FiMessageSquare, FiLayout, FiFile, FiSearch, FiList } from "react-icons/fi";
import type { Node, Edge } from '@xyflow/react';
import FunctionIcon from './FunctionIcon';
import type { TurboNodeData } from './TurboNode';

// --- Turbo Demo Data ---
export const turboNodes: Node<TurboNodeData>[] = [
    {
        id: '1',
        position: { x: 0, y: 0 },
        data: { icon: <FunctionIcon />, title: 'readFile', subtitle: 'api.ts' },
        type: 'turbo',
    },
    {
        id: '2',
        position: { x: 250, y: 0 },
        data: { icon: <FunctionIcon />, title: 'bundle', subtitle: 'apiContents' },
        type: 'turbo',
    },
    {
        id: '3',
        position: { x: 0, y: 250 },
        data: { icon: <FunctionIcon />, title: 'readFile', subtitle: 'sdk.ts' },
        type: 'turbo',
    },
    {
        id: '4',
        position: { x: 250, y: 250 },
        data: { icon: <FunctionIcon />, title: 'bundle', subtitle: 'sdkContents' },
        type: 'turbo',
    },
    {
        id: '5',
        position: { x: 500, y: 125 },
        data: { icon: <FunctionIcon />, title: 'concat', subtitle: 'api, sdk' },
        type: 'turbo',
    },
    {
        id: '6',
        position: { x: 750, y: 125 },
        data: { icon: <FiFile />, title: 'fullBundle' },
        type: 'turbo',
    },
];

export const turboEdges: Edge[] = [
    { id: 'e1-2', source: '1', target: '2' },
    { id: 'e3-4', source: '3', target: '4' },
    { id: 'e2-5', source: '2', target: '5' },
    { id: 'e4-5', source: '4', target: '5' },
    { id: 'e5-6', source: '5', target: '6' },
];

// --- Github Search Workflow Data ---
export const githubSearchNodes: Node<TurboNodeData>[] = [
    {
        id: 'start',
        position: { x: 0, y: 100 },
        data: { icon: <FiMessageSquare />, title: 'User Request', subtitle: 'Chat Interface' },
        type: 'turbo',
    },
    {
        id: 'orchestrator',
        position: { x: 250, y: 100 },
        data: { icon: <FiCpu />, title: 'Orchestrator', subtitle: 'Agent Routing' },
        type: 'turbo',
    },
    {
        id: 'planner',
        position: { x: 250, y: -50 },
        data: { icon: <FiList />, title: 'Planner Agent', subtitle: 'Gemini 2.0' },
        type: 'turbo',
    },
    {
        id: 'search-workflow',
        position: { x: 500, y: 100 },
        data: { icon: <FiSearch />, title: 'Search Workflow', subtitle: 'Cloudflare Workflow' },
        type: 'turbo',
    },
    {
        id: 'github-api',
        position: { x: 750, y: 100 },
        data: { icon: <FiGithub />, title: 'GitHub API', subtitle: 'External Service' },
        type: 'turbo',
    },
];

export const githubSearchEdges: Edge[] = [
    { id: 'e1', source: 'start', target: 'orchestrator' },
    { id: 'e2', source: 'orchestrator', target: 'planner' },
    { id: 'e3', source: 'planner', target: 'orchestrator' },
    { id: 'e4', source: 'orchestrator', target: 'search-workflow' },
    { id: 'e5', source: 'search-workflow', target: 'github-api' },
];

// --- PR Review Flow Data ---
export const prReviewNodes: Node<TurboNodeData>[] = [
    { id: 'trigger', position: { x: 0, y: 100 }, data: { icon: <FiGithub />, title: 'Trigger', subtitle: 'PR Comment' }, type: 'turbo' },
    { id: 'extractor', position: { x: 250, y: 100 }, data: { icon: <FiSearch />, title: 'Extractor', subtitle: 'Parse Comments' }, type: 'turbo' },
    { id: 'summarizer', position: { x: 500, y: 100 }, data: { icon: <FiCpu />, title: 'Summarizer', subtitle: 'AI Aggregation' }, type: 'turbo' },
    { id: 'poster', position: { x: 750, y: 100 }, data: { icon: <FiMessageSquare />, title: 'Poster', subtitle: 'Post Summary' }, type: 'turbo' },
];

export const prReviewEdges: Edge[] = [
    { id: 'e1', source: 'trigger', target: 'extractor' },
    { id: 'e2', source: 'extractor', target: 'summarizer' },
    { id: 'e3', source: 'summarizer', target: 'poster' },
];

// --- Issue Triage Flow Data ---
export const issueTriageNodes: Node<TurboNodeData>[] = [
    { id: 'trigger', position: { x: 0, y: 100 }, data: { icon: <FiGithub />, title: 'New Issue', subtitle: 'Webhook' }, type: 'turbo' },
    { id: 'classifier', position: { x: 250, y: 100 }, data: { icon: <FiCpu />, title: 'Classifier', subtitle: 'AI Analysis' }, type: 'turbo' },
    { id: 'labeler', position: { x: 500, y: 50 }, data: { icon: <FiList />, title: 'Labeler', subtitle: 'Apply Labels' }, type: 'turbo' },
    { id: 'responder', position: { x: 500, y: 150 }, data: { icon: <FiMessageSquare />, title: 'Responder', subtitle: 'Auto-Reply' }, type: 'turbo' },
];

export const issueTriageEdges: Edge[] = [
    { id: 'e1', source: 'trigger', target: 'classifier' },
    { id: 'e2', source: 'classifier', target: 'labeler' },
    { id: 'e3', source: 'classifier', target: 'responder' },
];

// --- Release Pipeline Data ---
export const releasePipelineNodes: Node<TurboNodeData>[] = [
    { id: 'push', position: { x: 0, y: 100 }, data: { icon: <FiGithub />, title: 'Push', subtitle: 'Main Branch' }, type: 'turbo' },
    { id: 'build', position: { x: 250, y: 100 }, data: { icon: <FunctionIcon />, title: 'Build', subtitle: 'Test & Lint' }, type: 'turbo' },
    { id: 'deploy', position: { x: 500, y: 100 }, data: { icon: <FiCloud />, title: 'Deploy', subtitle: 'Cloudflare Worker' }, type: 'turbo' },
    { id: 'release', position: { x: 750, y: 100 }, data: { icon: <FiList />, title: 'Release', subtitle: 'GitHub Release' }, type: 'turbo' },
];

export const releasePipelineEdges: Edge[] = [
    { id: 'e1', source: 'push', target: 'build' },
    { id: 'e2', source: 'build', target: 'deploy' },
    { id: 'e3', source: 'deploy', target: 'release' },
];

// ---// Extract Comments Flow
export const extractCommentsNodes: Node<TurboNodeData>[] = [
    {
        id: '1',
        position: { x: 0, y: 0 },
        data: {
            title: 'Triggers',
            icon: <FunctionIcon icon={FiZap} />,
            subtitle: 'API, RPC, Chat, Webhook',
            color: 'green',
            topIcon: <FiZap />
        },
        type: 'turbo',
    },
    {
        id: '2',
        position: { x: 250, y: 0 },
        data: {
            title: 'Extract Comments',
            icon: <FunctionIcon icon={FiCode} />,
            subtitle: 'Parse PR & Comments',
            color: 'purple',
            topIcon: <FiCpu />
        },
        type: 'turbo',
    },
    {
        id: '3',
        position: { x: 500, y: -100 },
        data: {
            title: 'Store Data',
            icon: <FunctionIcon icon={FiDatabase} />,
            subtitle: 'Save to KV',
            color: 'yellow',
            topIcon: <FiDatabase />
        },
        type: 'turbo',
    },
    {
        id: '4',
        position: { x: 500, y: 100 },
        data: {
            title: 'Notify PR',
            icon: <FunctionIcon icon={FiGithub} />,
            subtitle: 'Post Link Comment',
            color: 'red',
            topIcon: <FiMessageSquare />
        },
        type: 'turbo',
    },
    {
        id: '5',
        position: { x: 750, y: 0 },
        data: {
            title: 'Frontend Viewer',
            icon: <FunctionIcon icon={FiLayout} />,
            subtitle: 'View, Copy, Download',
            color: 'blue',
            topIcon: <FiLayout />
        },
        type: 'turbo',
    },
];

export const extractCommentsEdges: Edge[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true },
    { id: 'e2-3', source: '2', target: '3', animated: true },
    { id: 'e2-4', source: '2', target: '4', animated: true },
    { id: 'e3-5', source: '3', target: '5', animated: true }, // Logic: Storage feeds the viewer
    { id: 'e4-5', source: '4', target: '5', animated: true, label: 'Link' },
];

// --- Clear Conflicts Data (Placeholder) ---
export const clearConflictsNodes: Node<TurboNodeData>[] = [
    { id: 'manual', position: { x: 0, y: 100 }, data: { icon: <FiMessageSquare />, title: 'Conflict', subtitle: 'Detected' }, type: 'turbo' },
    { id: 'agent', position: { x: 250, y: 100 }, data: { icon: <FiCpu />, title: 'Resolver', subtitle: 'AI Analysis' }, type: 'turbo' },
    { id: 'pr', position: { x: 500, y: 100 }, data: { icon: <FiGithub />, title: 'Resolution', subtitle: 'New Commit' }, type: 'turbo' },
];

export const clearConflictsEdges: Edge[] = [
    { id: 'e1', source: 'manual', target: 'agent' },
    { id: 'e2', source: 'agent', target: 'pr' },
];

// --- Create Repo Data ---
export const createRepoNodes: Node<TurboNodeData>[] = [
    { id: 'req', position: { x: 0, y: 150 }, data: { icon: <FiMessageSquare />, title: 'Request', subtitle: 'User Input' }, type: 'turbo' },
    { id: 'scaffold', position: { x: 250, y: 150 }, data: { icon: <FunctionIcon />, title: 'Scaffold', subtitle: 'Generate Files' }, type: 'turbo' },

    // Branch 1: Shadcn
    { id: 'shadcn', position: { x: 500, y: 50 }, data: { icon: <FiFile />, title: 'Full Stack', subtitle: 'Shadcn + Worker' }, type: 'turbo' },
    // Branch 2: API Only
    { id: 'api', position: { x: 500, y: 150 }, data: { icon: <FiCpu />, title: 'API Only', subtitle: 'Worker Backend' }, type: 'turbo' },
    // Branch 3: Static
    { id: 'static', position: { x: 500, y: 250 }, data: { icon: <FiFile />, title: 'Static', subtitle: 'Docs/Health' }, type: 'turbo' },

    { id: 'push', position: { x: 750, y: 150 }, data: { icon: <FiGithub />, title: 'Push', subtitle: 'Create Repo' }, type: 'turbo' },
];

export const createRepoEdges: Edge[] = [
    { id: 'e1', source: 'req', target: 'scaffold' },
    { id: 'e2', source: 'scaffold', target: 'shadcn' },
    { id: 'e3', source: 'scaffold', target: 'api' },
    { id: 'e4', source: 'scaffold', target: 'static' },
    { id: 'e5', source: 'shadcn', target: 'push' },
    { id: 'e6', source: 'api', target: 'push' },
    { id: 'e7', source: 'static', target: 'push' },
];


// --- Jules Orchestrator Flow ---
export const julesOrchestratorNodes: Node<TurboNodeData>[] = [
    { id: 'webhook', position: { x: 0, y: 100 }, data: { icon: <FiGithub />, title: 'Webhook', subtitle: 'PR / Issue Event' }, type: 'turbo' },
    { id: 'standards', position: { x: 250, y: 100 }, data: { icon: <FiCheckCircle />, title: 'Standards', subtitle: 'Migration Pillars' }, type: 'turbo' },
    { id: 'jules-api', position: { x: 500, y: 50 }, data: { icon: <FiCpu />, title: 'Jules API', subtitle: 'Start Session' }, type: 'turbo' },
    { id: 'overseer', position: { x: 500, y: 200 }, data: { icon: <FiTrello />, title: 'Overseer DO', subtitle: 'Track & Poll' }, type: 'turbo' },
    { id: 'pr', position: { x: 750, y: 100 }, data: { icon: <FiGithub />, title: 'Pull Request', subtitle: 'Auto-Created PR' }, type: 'turbo' },
];

export const julesOrchestratorEdges: Edge[] = [
    { id: 'e1', source: 'webhook', target: 'standards', animated: true },
    { id: 'e2', source: 'standards', target: 'jules-api', animated: true },
    { id: 'e3', source: 'standards', target: 'overseer', animated: true },
    { id: 'e4', source: 'jules-api', target: 'overseer', animated: true },
    { id: 'e5', source: 'overseer', target: 'pr', animated: true },
];


export const workflows = {
    'turbo': { nodes: turboNodes, edges: turboEdges, title: 'Turbo Deployment', description: 'Example workflow showing a theoretical build process.' },
    'github-search': { nodes: githubSearchNodes, edges: githubSearchEdges, title: 'GitHub Search', description: 'Orchestrates search queries across GitHub repositories using AI planning and execution.' },
    'pr-review': { nodes: prReviewNodes, edges: prReviewEdges, title: 'PR Review Bot', description: 'Automatically extracts, summarizes, and provides feedback on Pull Requests.' },
    'issue-triage': { nodes: issueTriageNodes, edges: issueTriageEdges, title: 'Issue Triage', description: 'Classifies incoming issues and assigns labels or auto-responses.' },
    'release-pipeline': { nodes: releasePipelineNodes, edges: releasePipelineEdges, title: 'Release Pipeline', description: 'Automated build, deploy, and release cycle for Workers.' },
    'extract-comments': { nodes: extractCommentsNodes, edges: extractCommentsEdges, title: 'Extract Comments', description: 'Utilities for parsing and formatting code comments involved in specific PRs.' },
    'clear-conflicts': { nodes: clearConflictsNodes, edges: clearConflictsEdges, title: 'Clear Conflicts', description: 'AI-assisted merge conflict resolution (Coming Soon).' },
    'create-repo': { nodes: createRepoNodes, edges: createRepoEdges, title: 'Create Repository', description: 'Scaffolds new Cloudflare Worker repositories with defined stack presets.' },
    'jules-orchestrator': { nodes: julesOrchestratorNodes, edges: julesOrchestratorEdges, title: 'Jules Orchestrator', description: 'Dispatches implementation tasks to Google Jules with standards enforcement, session tracking, and automatic PR creation.' },
};

