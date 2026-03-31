/**
 * @file frontend/src/hooks/useSentinel.ts
 * @description Data-fetching hooks for the Sentinel Learning Engine.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Cookies from "js-cookie";

const getBaseUrl = () => {
  if (import.meta.env.VITE_PUBLIC_API_URL) {
    return import.meta.env.VITE_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:8787";
};

async function sentinelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = Cookies.get("colby_api_key");
  const res = await fetch(`${getBaseUrl()}/api/sentinel${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-api-key": token } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Sentinel API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ─── Insights ────────────────────────────────────────────────────────────────

export function useSentinelInsights(params?: {
  repo?: string;
  status?: string;
  category?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.repo) searchParams.set("repo", params.repo);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const qs = searchParams.toString();
  return useQuery({
    queryKey: ["sentinel", "insights", params],
    queryFn: () =>
      sentinelFetch<{ insights: any[]; total: number }>(
        `/insights${qs ? `?${qs}` : ""}`
      ),
    refetchInterval: 30000,
  });
}

// ─── Global Stats ────────────────────────────────────────────────────────────

export function useSentinelStats() {
  return useQuery({
    queryKey: ["sentinel", "stats"],
    queryFn: () =>
      sentinelFetch<{
        totalInsights: number;
        byStatus: Record<string, number>;
        byCategory: Record<string, number>;
        bySeverity: Record<string, number>;
        immunized: number;
        pending: number;
      }>("/stats/global"),
    refetchInterval: 60000,
  });
}

// ─── Health ──────────────────────────────────────────────────────────────────

export function useSentinelHealth() {
  return useQuery({
    queryKey: ["sentinel", "health"],
    queryFn: () =>
      sentinelFetch<{
        status: string;
        sessions: { total: number; lastRunAt: string | null };
        insights: { total: number };
        aiGateway: { reachable: boolean; latencyMs: number | null };
      }>("/health/learning"),
    refetchInterval: 120000,
  });
}

// ─── Available Tasks ─────────────────────────────────────────────────────────

export function useSentinelTasks() {
  return useQuery({
    queryKey: ["sentinel", "tasks"],
    queryFn: () =>
      sentinelFetch<{ tasks: any[] }>("/tasks/available"),
    refetchInterval: 30000,
  });
}

// ─── Orchestrate UI ──────────────────────────────────────────────────────────

export function useOrchestrateUI() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      prompt: string;
      repoOwner: string;
      repoName: string;
      pageId: string;
      routeType?: "global" | "repo";
    }) =>
      sentinelFetch<{ workflowId: string; status: string }>(
        "/orchestrate-ui",
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sentinel"] });
    },
  });
}
