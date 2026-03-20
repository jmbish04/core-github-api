/**
 * AI Health Failure Diagnostic Utility
 * 
 * Leverages structured LLM generation to analyze health check failures.
 * Determines root cause, severity, and generates actionable "Fix Prompts" 
 * for other AI agents to remediate the underlying issue.
 * 
 * @module AI/Utils/Diagnostician
 */
import { generateStructuredResponse } from "@/ai/providers";
import { z } from "zod";

/**
 * Results of an AI failure analysis.
 * @property rootCause - Explanation of the specific failure reason.
 * @property suggestedFix - Human-readable fix instructions.
 * @property severity - Criticality of the failure.
 * @property confidence - AI's confidence in the diagnosis (0.0 - 1.0).
 * @property fixPrompt - Targeted prompt for an agent to apply the fix.
 */
export interface HealthFailureAnalysis {
    rootCause: string;
    suggestedFix: string;
    severity: 'low' | 'medium' | 'critical';
    confidence: number;
    providedContext?: {
        stepName: string;
        errorMsg: string;
        details?: any;
    };
    fixPrompt: string;
}

/**
 * Analyzes a health check failure using structured AI generation.
 * 
 * @param env - Cloudflare Environment bindings.
 * @param stepName - The name of the health check step that failed.
 * @param errorMsg - The raw error message captured.
 * @param details - Optional metadata or payload context from the failure.
 * @param options - UI/Logic performance options.
 * @returns A detailed analysis or null if AI services are unavailable.
 * @agent-note This is used by the Health Domain to provide "Remediation Hints" to the user.
 */
export async function analyzeFailure(
    env: Env,
    stepName: string,
    errorMsg: string,
    details?: any,
    options?: { reasoningEffort?: "low" | "medium" | "high" }
): Promise<HealthFailureAnalysis | null> {
    if (!env.AI) return null;

    const contextPayload = details || {};
    const safeContextString = Object.keys(contextPayload).length > 0
        ? JSON.stringify(contextPayload).substring(0, 10000)
        : "None";

    const detailsStr = safeContextString;

    // Explicitly format the input so the model can echo it back accurately.
    const prompt = `
    You are a Site Reliability Engineer invoking a Health Diagnosis Agent.
    
    === INPUT DATA (MUST ECHO) ===
    Step Name: "${stepName}"
    Error Message: "${errorMsg}"
    ==============================

    === TECHNICAL DETAILS ===
    ${detailsStr}
    =========================
    
    Task:
    1. READ the "TECHNICAL DETAILS". Find the entry with status "FAILURE".
    2. DIAGNOSE the root cause based on that failure (e.g., "Authentication", "Timeout", "Model Refusal").
    3. PROVIDE a fix.
    4. ECHO the Input Data into the 'providedContext' field EXACTLY as shown above.
    5. GENERATE a "Fix Prompt" for a coding agent.
    
    Restrictions:
    - You must NOT return "Unknown" for Step Name or Error Message. Use the values provided in "INPUT DATA".
    - If details contain a specific error, cite it.
    `;

    const schema = z.object({
        providedContext: z.object({
            stepName: z.string(),
            errorMsg: z.string(),
            details: z.any().optional()
        }).describe("Context provided to the AI. You MUST echo back the input data here."),
        rootCause: z.string().describe("Technical explanation of why it failed"),
        suggestedFix: z.string().describe("Actionable command or configuration change to fix it"),
        severity: z.enum(["low", "medium", "critical"]).describe("Critical = System Down, Medium = Degradation, Low = Minor Warning"),
        confidence: z.number().min(0).max(1).describe("Confidence (0.0 - 1.0) in this diagnosis"),
        fixPrompt: z.string().describe("A detailed prompt for another AI agent to fix this specific issue")
    });


    try {
        const analysis = await generateStructuredResponse<HealthFailureAnalysis>(
            env,
            prompt,
            schema,
            undefined,
            { effort: options?.reasoningEffort || "high" }
        );
        
        if (!analysis) {
            throw new Error("Provider returned empty response or encountered a parsing error.");
        }
        
        return analysis;
    } catch (error: any) {
        console.error(`AI Analysis critical error for ${stepName}: `, error);
        
        return {
            rootCause: `Agent execution failed: ${error.message || "400 Bad Request"}`,
            suggestedFix: "Review raw logs, check AI Gateway token limits, and verify payload schemas.",
            severity: "critical",
            confidence: 0,
            providedContext: {
                stepName: stepName,
                errorMsg: error.message || "Unknown execution error",
                details: { errorName: error.name || "Error", rawError: error.message }
            },
            fixPrompt: "Please analyze the logs to determine why the Health Diagnostician failed."
        };
    }
}
