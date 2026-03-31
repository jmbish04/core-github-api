# Implement Research Judge Workflow

## Objective

Update the asynchronous GitHub Action `research-judge.yml` to execute flawlessly with the correct environment dependencies and Cloudflare AI Gateway routing. Ensure the receiving Cloudflare Worker is prepared to parse, store, and act on the returned JSON payload via a designated Hono webhook.

## Steps

1. Replaced the disparate `agent.py` logic with the complete, unified `research_judge.py` script directly within `.github/workflows/research-judge.yml`.
2. Fixed the pipeline dependencies ensuring `pydantic`, `litellm`, `openai`, and `PyGithub` are accurately provisioned by `pip`.
3. Adjusted the Python `BASE_URL` to route correctly through the Cloudflare AI Gateway (`/workers-ai/v1`) to securely access OpenAI-compatible models.
4. Use the provided Coding Agent Prompt to execute the Hono backend updates on `core-github-api`, specifically generating `POST /api/webhooks/research-judge`.
