
import Cloudflare from "cloudflare";

export interface TokenStatus {
    valid: boolean;
    id?: string;
    status?: "active" | "disabled" | "expired" | "unknown";
    message?: string;
    canUseWorkerAI?: boolean;
    tokenType?: "account" | "user" | "unknown";
}

export async function verifyToken(token: string, accountId?: string): Promise<TokenStatus> {
    try {
        // 1. Dual-Mode Verification (User First -> Account Fallback)
        let basicInfo: any = {};
        let tokenType: "account" | "user" | "unknown" = "unknown";

        const cf = new Cloudflare({ apiToken: token });

                // [REST] const accountVerifyRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`, {
                // [REST]     headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
                // [REST] });
                // [REST] if (accountVerifyRes.ok) {
                // [REST]     const json = await accountVerifyRes.json() as any;
                // [REST]     if (json.success) {
                // [REST]         basicInfo = json.result;
                // [REST]         verificationMethod = "account";
                // [REST]     }
                // [REST] }     
                
                
                // [REST] const userVerifyRes = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
                // [REST]     headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
                // [REST] });
                // [REST] if (userVerifyRes.ok) {
                // [REST]     const json = await userVerifyRes.json() as any;
                // [REST]     if (json.success) {
                // [REST]         basicInfo = json.result;
                // [REST]         verificationMethod = "user";
                // [REST]     }
                // [REST] }                

        // A. Try User Token Verification 
        try {
            const userVerifyRes = await cf.user.tokens.verify();
            if (userVerifyRes && userVerifyRes.id) {
                basicInfo = userVerifyRes;
                tokenType = "user";
            }
        } catch (e) {
            console.error("User token verification failed", JSON.stringify(e));
        }

        // B. Try Account Token Verification if User failed
        if (!basicInfo.id && accountId) {
            try {
                const accountVerifyRes = await cf.accounts.tokens.verify({ account_id: accountId });
                if (accountVerifyRes && accountVerifyRes.id) {
                    basicInfo = accountVerifyRes;
                    tokenType = "account";
                }
            } catch (e) {
                // Ignore network errors, proceed to fallback
                console.error("Account token verification failed", JSON.stringify(e));
            }
        }

        // C. Result Handling
        if (!basicInfo.id) {
            // "if both user token verify and account token verify fail .. 1) the token is of type UNKNOWN token type and 2) the token is invalid"
            return {
                valid: false,
                tokenType: "unknown",
                message: "Both user token verify and account token verify failed. Token type is UNKNOWN and the token is invalid."
            };
        }

        const tokenId = basicInfo.id;
        const status = basicInfo.status || 'active';

        if (status !== "active" && status !== 'unknown') {
            return { valid: true, id: tokenId, status, tokenType, message: "Token is not active" };
        }

        // 2. Check Worker AI Capability
        // We try a lightweight operation: Listing basic info or assuming true if we can't test
        let canUseWorkerAI = false;

        if (accountId) {
            try {
                // Try listing models (read-only check)
                // [REST] const modelsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=1`, {
                // [REST]     headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
                // [REST] });
                // [REST] if (modelsRes.ok) {
                // [REST]     canUseWorkerAI = true;

                const modelsList = await cf.ai.models.list({ account_id: accountId });
                // If it doesn't throw, we have access
                if (modelsList && modelsList.result) {
                    canUseWorkerAI = true;
                }
            } catch (e) {
                console.error("AI capability check failed", JSON.stringify(e));
                // If listing fails, maybe it only has run permission?
                // We can't easily test run without cost/side-effects.
                // For now, if verify endpoint failed AND models endpoint failed, we assume invalid.
                if (basicInfo.status === 'unknown') {
                    console.error("Verification and AI capability check failed", JSON.stringify(e));
                    return { valid: false, tokenType, message: "Verification and AI capability check failed" };
                }
            }
        } else {
            // Without account ID, we can't verify capabilities.
            // If basic verification failed, we have to assume invalid.
            if (basicInfo.status === 'unknown') {
                return { valid: false, tokenType, message: "Cannot verify token without Account ID or `user/tokens/verify` permission" };
            }
            canUseWorkerAI = true; // Assume yes if active and we can't test otherwise
        }

        return {
            valid: true,
            id: tokenId,
            status,
            tokenType,
            canUseWorkerAI
        };

    } catch (error) {
        return { valid: false, tokenType: "unknown", message: String(error) };
    }
}

export async function findBestAiToken(env: Record<string, string | undefined>, accountId?: string): Promise<string | null> {
    // Candidates: Keys ending in _TOKEN, prioritizing those with 'AI' in name
    const candidates = Object.keys(env).filter(k => k.endsWith('_TOKEN'));

    // Priority sort: AI_GATEWAY ?? -> AI -> ...
    const sorted = candidates.sort((a, b) => {
        const aScore = (a.includes('AI_GATEWAY') ? 3 : 0) + (a.includes('AI') ? 2 : 0);
        const bScore = (b.includes('AI_GATEWAY') ? 3 : 0) + (b.includes('AI') ? 2 : 0);
        return bScore - aScore;
    });

    for (const key of sorted) {
        const token = env[key];
        if (!token) continue;

        const result = await verifyToken(token, accountId);
        if (result.valid && result.status === 'active' && result.canUseWorkerAI) {
            console.log(`[Token Discovery] Found working AI token: ${key}`);
            return token;
        }
    }

    return null;
}
