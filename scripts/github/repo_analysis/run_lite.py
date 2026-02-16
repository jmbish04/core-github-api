import litellm
import os

# Build the AI Gateway URL for Workers AI
# Build the AI Gateway URL for Workers AI
# Note: We use the /workers-ai/v1 endpoint to enable OpenAI compatibility
account_id = os.getenv("CF_ACCOUNT_ID")
gateway_id = os.getenv("CF_GATEWAY_ID")
api_base = f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/workers-ai/v1"

raw_model_name = os.getenv("MODEL_NAME", "workers-ai/@cf/openai/gpt-oss-120b")

# TRICK: Cloudflare Workers AI models start with @cf/...
# LiteLLM needs 'openai/' prefix to use the OpenAI-compatible endpoint.
if "@cf" in raw_model_name:
    suffix = raw_model_name.split("@cf", 1)[1]
    litellm_model = f"openai/@cf{suffix}"
else:
    # Fallback if no @cf found, just assume it's openai/
    litellm_model = f"openai/{raw_model_name}"

print(f"Using LiteLLM Model: {litellm_model}")

response = litellm.completion(
    model=litellm_model,
    messages=[{"role": "user", "content": os.getenv("USER_PROMPT")}],
    api_base=api_base,
    api_key=os.getenv("CF_API_TOKEN")
)

print(response.choices[0].message.content)
