
/**
 * Shared types for the Health System
 */

export interface HealthRun {
    id: string;
    status: 'unknown' | 'healthy' | 'unhealthy' | 'degraded';
    trigger: string;
    created_at: string;
    duration_ms?: number;
    metadata?: any;
}

export type HealthCategory = 'github' | 'ai' | 'api' | 'webhooks' | 'mcp' | 'agents' | 'browser' | 'git' | 'sandbox' | 'research';

export interface HealthResult {
    id: string;
    run_id: string;
    category: HealthCategory;
    name: string;
    status: 'success' | 'failure' | 'pending' | 'skipped';
    message?: string;
    details?: any;
    duration_ms?: number;
    ai_suggestion?: string | null;
    timestamp: string;
}

export interface HealthCheckResult {
    checkType: string;
    success: boolean;
    steps: HealthStepResult[];
    totalDurationMs: number;
    error?: string;
    status?: 'healthy' | 'degraded' | 'unhealthy';
}

export interface HealthStepResult {
    name: string;
    status: 'success' | 'failure' | 'warning' | 'SKIPPED';
    message: string;
    details?: any;
    durationMs: number;
    analysis?: import('../ai/utils/diagnostician').HealthFailureAnalysis;
}
