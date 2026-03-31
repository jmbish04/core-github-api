/**
 * @file src/backend/src/utils/cf-images.ts
 * Utilizes Cloudflare Images API to upload and host screenshots.
 */
import { getSecret } from '@/utils/secrets';

export class CFImages {
    /**
     * Uploads a base64 encoded image to Cloudflare Images.
     * @param env - The environment object containing credentials.
     * @param base64Data - The base64 string (including or excluding the data:image/png;base64, prefix).
     * @param filename - Optional filename.
     * @returns The public URL of the uploaded image.
     */
    static async uploadBase64(env: any, base64Data: string, filename: string = 'image.png'): Promise<string> {
        const accountId = await getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
        const apiToken = await getSecret(env, "CLOUDFLARE_IMAGES_STREAM_TOKEN");

        if (!accountId || !apiToken) {
            throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN for CF Images upload.");
        }

        // Strip prefix if exists
        const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });

        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to upload to CF Images: ${response.status} ${response.statusText} - ${errText}`);
        }

        const data = await response.json() as any;
        if (!data.success) {
             throw new Error(`CF Images API returned error: ${JSON.stringify(data.errors)}`);
        }

        // Return the first variant URL (usually 'public')
        return data.result.variants[0];
    }
}
