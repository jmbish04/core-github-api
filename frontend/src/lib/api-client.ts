/**
 * @file frontend/src/lib/api-client.ts
 * @description Centralized Hono RPC client for end-to-end type safety.
 */

import { hc } from 'hono/client';
// This import requires the backend to export: type AppType = typeof sharedApi;
import type { AppType } from '@api/index';

import Cookies from 'js-cookie';

const getBaseUrl = () => {
    if (import.meta.env.VITE_PUBLIC_API_URL) {
        return import.meta.env.VITE_PUBLIC_API_URL;
    }
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }
    return 'http://localhost:8787';
};

const client = hc<AppType>(getBaseUrl(), {
    headers: () => {
        const token = Cookies.get('colby_api_key');
        const h: Record<string, string> = {};
        if (token) h['x-api-key'] = token;
        return h;
    }
});

export const api = client.api;

/**
 * Example Usage:
 * const res = await api.projects[':projectId'].hierarchy.$get();
 */