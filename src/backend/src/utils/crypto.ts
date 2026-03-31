export async function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const expectedSignature = `sha256=${Array.from(
    new Uint8Array(signatureBytes)
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  return signature === expectedSignature;
}
