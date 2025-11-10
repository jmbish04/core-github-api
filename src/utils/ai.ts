import { Env } from "../types";

export async function analyzeTestFailure(env: Env, testName: string, errorMessage: string): Promise<{
    humanReadableDescription: string;
    fixSuggestion: string;
}> {
    if (!env.AI) {
        return {
            humanReadableDescription: "AI binding not available.",
            fixSuggestion: "Please configure the AI binding in wrangler.jsonc."
        };
    }

    try {
        const prompt = `A health check test named "${testName}" failed with the following error: "${errorMessage}". Please provide a human-readable description of the problem and a suggestion for how to fix it.`;

        const response: any = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
            prompt,
            stream: false,
        });

        const { response: aiResponse } = response;

        // Basic parsing of the AI response. This could be improved with a more structured output from the AI.
        const descriptionMatch = aiResponse.match(/description:(.*?)suggestion:/is);
        const suggestionMatch = aiResponse.match(/suggestion:(.*?)$/is);

        const humanReadableDescription = descriptionMatch ? descriptionMatch[1].trim() : "Could not determine the cause of the error.";
        const fixSuggestion = suggestionMatch ? suggestionMatch[1].trim() : "No fix suggestion available.";

        return { humanReadableDescription, fixSuggestion };
    } catch (error) {
        console.error("Error analyzing test failure with AI:", error);
        return {
            humanReadableDescription: "An error occurred while analyzing the test failure with AI.",
            fixSuggestion: "Please check the worker logs for more details."
        };
    }
}
