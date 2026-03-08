import { GoogleGenAI } from "@google/genai";
async function run() {
  const customUrl = "https://gateway.ai.cloudflare.com/v1/acct/gw/google-ai-studio";
  const ai = new GoogleGenAI({ 
    apiKey: "dummy-key-123", 
    httpOptions: { baseUrl: customUrl } 
  });
  console.log("BASE URL IS:", ai.config.httpOptions?.baseUrl);

  // Does the api have `apiEndpoint` or `apiVersion`?
  console.log("apiVersion:", ai.config.httpOptions?.apiVersion || "not set directly", "baseUrl:", ai.config.httpOptions?.baseUrl);
}
run();
