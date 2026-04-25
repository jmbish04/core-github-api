# Python in GitHub Actions Constraints

- **Inline Python Indentation:** When utilizing `cat << 'EOF' > file.py` inside a YAML step, the contents must have strict, non-broken indentation. Python will fail to execute if YAML spacing mixes tabs or trailing spaces.
- **AI Gateway URI Structuring:** When calling Cloudflare Workers AI models via the native `openai` python SDK, the `base_url` must target the `/workers-ai/v1` path wrapper on the gateway, not `/compat` or standard `/openai`.
- **Dependency Completeness:** Any inline Python script containing imports from PyPI must have those exact matching packages installed in an upstream step (e.g., `github` package translates to `pip install PyGithub`).
