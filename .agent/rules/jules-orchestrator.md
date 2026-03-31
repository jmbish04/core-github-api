# Jules Orchestration Standards
- NEVER use manual diff chunking; Jules SDK handles repository ingestion automatically.
- ALWAYS wrap Jules sessions in a Honi Agent to ensure durability across multi-minute GitHub tasks.
- A mandatory 10,000ms delay MUST be maintained between `session.info()` polls to avoid API rate limiting.
- ALL autonomous responses to the Jules agent must be routed through the Cloudflare AI Gateway.
