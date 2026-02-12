
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

export interface HealthResult {
    id: string;
    run_id: string;
    category: 'github' | 'ai' | 'api' | 'webhooks';
    name: string;
    status: 'success' | 'failure' | 'pending' | 'skipped';
    message?: string;
    details?: any;
    duration_ms?: number;
    timestamp: string;
}

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
    results: Partial<HealthResult>[];
}
