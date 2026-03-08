
import Cloudflare from 'cloudflare';

/**
 * Cloudflare API Token Verification Utilities
 *
 * Capabilities:
 * - Verify USER token
 * - Verify ACCOUNT token
 * - Auto-detect token type
 * - Enforce expected token type
 */

export type CloudflareTokenType = "user" | "account" | "unknown" | "none";

export interface CloudflareTokenVerifyResult {
    success: boolean;
    status?: "active" | "disabled" | "revoked";
    token_id?: string;
    errors?: Array<{
        code: number;
        message: string;
    }>;
    raw?: unknown;
}

export interface CloudflareTokenTestResult {
    token_name: string;
    passed: boolean;
    reason:
    | "TOKEN_VALID_AND_TYPE_MATCHES"
    | "TOKEN_VALID_BUT_WRONG_TYPE"
    | "TOKEN_INVALID"
    | "TOKEN_MISSING";
    detectedType: CloudflareTokenType;
    details?: {
        user?: CloudflareTokenVerifyResult;
        account?: CloudflareTokenVerifyResult;
    };
}

/**
 * Verify a USER API token using the official SDK
 */
export async function verifyUserToken(
    token: string,
    token_name: string
): Promise<CloudflareTokenVerifyResult> {
    const client = new Cloudflare({ apiToken: token });

    try {
        const response = await client.user.tokens.verify();
        
        return {
            success: true,
            status: response.status as any,
            token_id: response.id,
            raw: { success: true, result: response }
        };
    } catch (error: any) {
        // Cloudflare SDK throws on non-200 responses
        const errors = error.errors || [{ code: error.status || 500, message: error.message || "User token verification failed" }];
        return {
            success: false,
            errors,
            raw: error
        };
    }
}

/**
 * Verify an ACCOUNT-scoped API token using the official SDK
 */
export async function verifyAccountToken(
    token: string,
    accountId: string,
    token_name: string
): Promise<CloudflareTokenVerifyResult> {
    const client = new Cloudflare({ apiToken: token });

    try {
        const response = await client.accounts.tokens.verify({ account_id: accountId });
        
        return {
            success: true,
            status: response.status as any,
            token_id: response.id,
            raw: { success: true, result: response }
        };
    } catch (error: any) {
        const errors = error.errors || [{ code: error.status || 500, message: error.message || "Account token verification failed" }];
        return {
            success: false,
            errors,
            raw: error
        };
    }
}

/**
 * Detect token type by testing both USER and ACCOUNT endpoints.
 */
export async function detectTokenType(
    token: string,
    accountId: string,
    token_name: string
): Promise<{
    detectedType: CloudflareTokenType;
    userResult?: CloudflareTokenVerifyResult;
    accountResult?: CloudflareTokenVerifyResult;
}> {
    // Priority: Check ACCOUNT token first
    const accountResult = await verifyAccountToken(token, accountId, token_name);
    
    if (accountResult.success) {
        return {
            detectedType: "account",
            accountResult
        };
    }

    // Fallback: Check USER token if Account level fails
    const userResult = await verifyUserToken(token, token_name);
    
    if (userResult.success) {
        return {
            detectedType: "user",
            accountResult,
            userResult
        };
    }

    return {
        detectedType: "unknown",
        accountResult,
        userResult
    };
}

/**
 * SINGLE ENTRY POINT
 *
 * Test a token against an expected type.
 */
export async function testToken(
    token: string | null | undefined,
    expectedType: Exclude<CloudflareTokenType, "unknown" | "none">,
    accountId: string,
    token_name: string
): Promise<CloudflareTokenTestResult> {
    if (!token || token.trim() === "") {
        return {
            token_name,
            passed: false,
            reason: "TOKEN_MISSING",
            detectedType: "none"
        };
    }

    const { detectedType, userResult, accountResult } =
        await detectTokenType(token, accountId, token_name);

    if (detectedType === "unknown") {
        return {
            token_name,
            passed: false,
            reason: "TOKEN_INVALID",
            detectedType,
            details: {
                user: userResult,
                account: accountResult
            }
        };
    }

    if (detectedType !== expectedType) {
        return {
            token_name,
            passed: false,
            reason: "TOKEN_VALID_BUT_WRONG_TYPE",
            detectedType,
            details: {
                user: userResult,
                account: accountResult
            }
        };
    }

    return {
        token_name,
        passed: true,
        reason: "TOKEN_VALID_AND_TYPE_MATCHES",
        detectedType,
        details: {
            user: userResult,
            account: accountResult
        }
    };
}

/**
 * Test if a token is valid (either User OR Account)
 */
export async function testAnyValidToken(
    token: string | null | undefined,
    accountId: string,
    token_name: string
): Promise<CloudflareTokenTestResult> {
    if (!token || token.trim() === "") {
        return {
            token_name,
            passed: false,
            reason: "TOKEN_MISSING",
            detectedType: "none"
        };
    }

    const { detectedType, userResult, accountResult } =
        await detectTokenType(token, accountId, token_name);

    if (detectedType === "unknown") {
        return {
            token_name,
            passed: false,
            reason: "TOKEN_INVALID",
            detectedType,
            details: {
                user: userResult,
                account: accountResult
            }
        };
    }

    return {
        token_name,
        passed: true,
        reason: "TOKEN_VALID_AND_TYPE_MATCHES",
        detectedType,
        details: {
            user: userResult,
            account: accountResult
        }
    };
}

/**
 * Global alias for token testing using the Cloudflare SDK.
 */
export const verifyCloudflareTokens = testAnyValidToken;
