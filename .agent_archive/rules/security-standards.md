# Security & Auditing Standards

1.  **Defense in Depth**: Sensitive data (keys ending in `_KEY`, `_TOKEN`, `_SECRET`) MUST be masked using `sanitizeForAudit` located in `src/lib/masking.ts` _before_ being written to any persistent storage outside of KV (like D1 audit logs or application logs).
2.  **Masking Format**: Visible characters should be limited to the first 3 and last 4 (e.g., `sk-********4a2z`).
3.  **Audit Trail**: Every state change to the configuration via the API must result in an immutable entry in the `config_audit_logs` D1 table.
