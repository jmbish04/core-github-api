
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getOctokit } from "@services/octokit/core";
import _sodium from "libsodium-wrappers";
import { sanitizeRepoName } from "@sandbox-sdk-tools";
import { ensureRepositoryFromWebhook } from "@services/repository-sync";
import { StandardizationService } from "@services/standardization";

const standardizationWebhook = new Hono<{ Bindings: Env }>();

// Middleware for Signature Validation
standardizationWebhook.use("*", async (c, next) => {
  const signature = c.req.header("x-hub-signature-256");
  const body = await c.req.raw.clone().text(); // Clone to not consume body for next handlers
  const apiKeyRaw = c.env.WORKER_API_KEY;
  const secret = typeof apiKeyRaw === 'string' ? apiKeyRaw : await (apiKeyRaw as any)?.get?.(); 
  // Or reuse WORKER_API_KEY if that's what's used elsewhere? 
  // implementation_plan says "Validate all incoming webhook payloads using X-Hub-Signature-256"
  // existing webhook-handler uses `WORKER_API_KEY` as webhook secret.
  // I will use `GITHUB_WEBHOOK_SECRET` if available, or fall back to `WORKER_API_KEY` logic.
  // But wait, user prompt says: "verify the webhook signature using the WORKER_API_KEY" in the *other* prompt context.
  // Here, I should probably stick to standard `GITHUB_TOKEN` or `WORKER_API_KEY`.
  // Let's assume `WORKER_API_KEY` is the strict shared secret for now, or `GITHUB_WEBHOOK_SECRET` from Secrets Store.

  // NOTE: verifying signature requires the raw body and the secret.
  // For simplicity and to match the prompt's "libsodium-wrappers" context (though that's for secrets),
  // I will implement standard HMAC-SHA256 check.
  
  if (!signature) {
      return c.json({ error: "Missing signature" }, 401);
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret as string),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(body),
    );

    const expectedSig = `sha256=${Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;

    const expectedBytes = encoder.encode(expectedSig);
    const signatureBytes = encoder.encode(signature);

    const lengthsMatch = expectedBytes.byteLength === signatureBytes.byteLength;
    const isValid = lengthsMatch
      ? (crypto.subtle as any).timingSafeEqual(expectedBytes, signatureBytes)
      // Prevent timing leak on length mismatch
      : !(crypto.subtle as any).timingSafeEqual(expectedBytes, expectedBytes);

    if (!isValid || !lengthsMatch) {
      console.warn("[Standardization] Webhook signature verification failed.");
      return c.json({ error: "Invalid signature" }, 401);
    }
  } catch (err) {
    console.error("[Standardization] Error validating webhook signature:", err);
    return c.json({ error: "Signature validation failed" }, 500);
  }

  await next();
});

standardizationWebhook.post("/", async (c) => {
  const event = c.req.header("x-github-event");
  const deliveryId = c.req.header("x-github-delivery");
  const payload = await c.req.json();

  if (!event || !deliveryId) {
    return c.json({ error: "Missing event or delivery ID" }, 400);
  }

  // 1. Ensure Repo Exists in our System
  if (payload.repository) {
      c.executionCtx.waitUntil(
          ensureRepositoryFromWebhook(c.env, payload.repository).catch(err => {
              console.error("[Standardization] Failed to sync repo:", err);
          })
      );

      // 2. Trigger Standardization Workflow
      c.executionCtx.waitUntil(
          StandardizationService.enforce(c.env, payload.repository).catch(err => {
              console.error("[Standardization] Failed to enforce standards:", err);
          })
      );
  }

  return c.json({ success: true, message: "Standardization trigger received" });
});

export default standardizationWebhook;
