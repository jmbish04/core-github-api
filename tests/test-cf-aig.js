const fs = require('fs');
const devVars = fs.readFileSync('.dev.vars', 'utf-8');
const env = {};
devVars.split('\n').forEach(line => {
  if (line.includes('=')) {
    const ObjectPart = line.split('=');
    const k = ObjectPart.shift().trim();
    const v = ObjectPart.join('=').trim().replace(/(^"|"$)/g, ""); // basic trim
    if(k && v) env[k] = v;
  }
});

const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const aiGatewayToken = env.CLOUDFLARE_AI_GATEWAY_TOKEN || env.AI_GATEWAY_TOKEN; // check both
const gatewayName = 'core-github-api'; // from wrangler.jsonc vars

async function testWorkerAiCompat() {
  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/workers-ai`;
  console.log("URL:", url);
  try {
    const res = await fetch(`${url}/v1/chat/completions`, { // Workers AI compat
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiGatewayToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        messages: [{ role: 'user', content: 'Say hello' }]
      })
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch (e) {
    console.error("Error:", e.message);
  }
}

async function testUniversal() {
  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/compat/chat/completions`;
  console.log("Universal URL:", url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiGatewayToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        messages: [{ role: 'user', content: 'Say hello' }]
      })
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
  } catch (e) {
    console.error("Error:", e.message);
  }
}

testWorkerAiCompat().then(testUniversal);
