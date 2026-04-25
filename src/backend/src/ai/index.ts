/**
 * AI Subsystem Entry Point
 *
 * This module serves as the central export hub for all AI-related services,
 * including providers, utilities, and health diagnostic tools.
 *
 * @module AI
 */
// Centralized AI Services Export

// Providers (Namespaced to avoid function name collisions)
export * as Gemini from "@/ai/providers/vendors/gemini";
export * as OpenAI from "@/ai/providers/vendors/openai";
export * as WorkerAI from "@/ai/providers/vendors/worker-ai";

// Utilities
export * from "@/ai/utils/sanitizer";
export * from "@/ai/utils/diagnostician";
export * from "@/ai/providers/ai-gateway";

// Services
export { checkHealth as checkAIHealth } from "@/ai/health";
export * from "@/ai/providers";
