const { execSync } = require('child_process');
const fs = require('fs');

async function test() {
  const accountId = execSync("sed -n 's/.*CLOUDFLARE_ACCOUNT_ID=\"\\(.*\\)\".*/\\1/p' .dev.vars").toString().trim();
  const gatewayToken = execSync("sed -n 's/.*AI_GATEWAY_TOKEN=\"\\(.*\\)\".*/\\1/p' .dev.vars").toString().trim();
  const geminiKey = execSync("sed -n 's/.*GEMINI_API_KEY=\"\\(.*\\)\".*/\\1/p' .dev.vars").toString().trim();
  
  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/core-github-api/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent`;
  
  console.log("Fetching: ", url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-aig-authorization': `Bearer ${gatewayToken}`,
      'x-goog-api-key': geminiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "ping" }] }]
    })
  });
  console.log("Status:", response.status);
  console.log("Body:", await response.text());
}
test();
