function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  
  // Handle literal \n characters if present in env var
  // This is a common issue with secrets in Cloudflare
  let normalizedPem = pem;
  if (normalizedPem.includes("\\n")) {
      normalizedPem = normalizedPem.replace(/\\n/g, "\n");
  }
  
  const pemContents = normalizedPem
    .substring(
      normalizedPem.indexOf(pemHeader) + pemHeader.length,
      normalizedPem.lastIndexOf(pemFooter)
    )
    .replace(/\s/g, ""); // Remove all whitespace including newlines

  const binaryDerString = atob(pemContents);
  const binaryDer = str2ab(binaryDerString);

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

export async function generateJWT(appId: string, privateKey: string): Promise<string> {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued at time (60 seconds in the past)
    exp: now + 10 * 60, // JWT expiration time (10 minutes)
    iss: appId,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKey);
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    str2ab(data)
  );

  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signatureBuffer));

  return `${data}.${encodedSignature}`;
}

export async function getInstallationAccessToken(
  appId: string,
  privateKey: string,
  installationId: number
): Promise<string> {
  const jwt = await generateJWT(appId, privateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Cloudflare-Workers-GitHub-App",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to get installation access token: ${response.status}`, errorText);
    throw new Error(`Failed to get installation access token: ${response.status}`);
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}
