import { Env } from "../types";
import { TestDef } from "../schemas/dbSchemas";
import { Hono } from "hono";
import { buildRouter } from "../router";

export type TestFunction = (env: Env) => Promise<{
    pass: boolean;
    error?: string;
    raw?: any;
}>;

const app = buildRouter()

export const TEST_DEFINITIONS: Omit<TestDef, 'created_at' | 'id'>[] = [
    {
        name: "API Healthcheck",
        description: "Checks if the main '/' endpoint is healthy.",
        category: "API",
        severity: "critical",
        is_active: 1,
        error_map: JSON.stringify({
            "not_ok": {
                meaning: "The root endpoint did not return a 200 OK response.",
                fix: "Check the worker logs for errors. Ensure the Hono router is correctly configured."
            }
        })
    },
    {
        name: "OpenAPI Spec Check",
        description: "Ensures the OpenAPI JSON and YAML specs are available.",
        category: "API",
        severity: "high",
        is_active: 1,
        error_map: JSON.stringify({
            "json_unavailable": {
                meaning: "The /openapi.json endpoint is not available or returned an error.",
                fix: "Verify the `buildOpenAPIDocument` function is working correctly and the route is registered in `index.ts`."
            },
            "yaml_unavailable": {
                meaning: "The /openapi.yaml endpoint is not available or returned an error.",
                fix: "Verify the `buildOpenAPIDocument` function is working and the YAML conversion is correct."
            }
        })
    },
    {
        name: "WebSocket Room Handshake",
        description: "Checks if the WebSocket Durable Object can be reached.",
        category: "Realtime",
        severity: "critical",
        is_active: 1,
        error_map: JSON.stringify({
            "do_unreachable": {
                meaning: "The WebSocket room Durable Object did not respond to the upgrade request.",
                fix: "Check the Durable Object configuration in `wrangler.jsonc` and the `RoomDO` implementation."
            }
        })
    }
];

export const TEST_FUNCTIONS: Record<string, TestFunction> = {
    "API Healthcheck": async (env: Env) => {
        const res = await app.fetch(new Request("http://localhost/"), env, { waitUntil: async () => {} });
        if (res.status === 200) {
            return { pass: true };
        }
        return { pass: false, error: "not_ok", raw: { status: res.status } };
    },
    "OpenAPI Spec Check": async (env: Env) => {
        const jsonRes = await app.fetch(new Request("http://localhost/openapi.json"), env, { waitUntil: async () => {} });
        const yamlRes = await app.fetch(new Request("http://localhost/openapi.yaml"), env, { waitUntil: async () => {} });

        if (jsonRes.status !== 200) {
            return { pass: false, error: "json_unavailable", raw: { status: jsonRes.status } };
        }
        if (yamlRes.status !== 200) {
            return { pass: false, error: "yaml_unavailable", raw: { status: yamlRes.status } };
        }
        return { pass: true };
    },
    "WebSocket Room Handshake": async (env: Env) => {
        // This is a simplified check. A full check would require a WebSocket client.
        const id = env.ROOM_DO.idFromName("test-room");
        const stub = env.ROOM_DO.get(id);
        const res = await stub.fetch(new Request("http://localhost/ws", { headers: { Upgrade: "websocket" } }));

        if (res.status === 101) {
            return { pass: true };
        }
        return { pass: false, error: "do_unreachable", raw: { status: res.status } };
    },
};
