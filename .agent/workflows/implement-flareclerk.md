# Implement Flareclerk Cost Estimation

1. **Context Analysis**: Integrating `flareclerk` CLI logic into our core-github-api Cloudflare Worker to act as a custom resource cost estimation module.
2. **Backend Flareclerk Service**:
   - Created `backend/src/services/cloudflare/flareclerk.ts`.
   - This service queries the Cloudflare GraphQL API (`workersInvocationsAdaptive`, `durableObjectsInvocationsAdaptiveGroups`, `containersMetricsAdaptiveGroups`, etc.).
   - Created a hardcoded `PRICING` map.
   - Exported metrics and usage calculation for D1, KV, Workers, and DOs.
3. **API Routes**:
   - Added `/costs/fleet` and `/costs/worker/:name` routes to `backend/src/routes/api/services/cloudflare.ts`.
4. **Frontend Global Costs View**:
   - Created `CloudflareCosts.tsx` under `frontend/src/views/control/global/`.
   - Updated `frontend/src/components/navigation/Sidebar.tsx` to add "Costs & Billing" in the main navigation.
   - Mapped the `/costs` route in `App.tsx`.
5. **Frontend Granular Costs Component**:
   - Created `CloudflareWorkerCosts.tsx` component in the `cloudflaresdk` folder.
   - Injected it into `CloudflareSdkDashboard.tsx` with a new `Costs` tab triggered by the lucide `DollarSign` icon.
6. **Pricing Scraper Workflow**:
   - Created `backend/src/workflows/pricing-scraper.ts`.
   - Uses `BrowserService` (Cloudflare Browser Rendering binding) to scrape the `https://developers.cloudflare.com/workers/platform/pricing/` page.
   - Evaluates the page content looking for expected cost strings. Files a GitHub Issue dynamically via Octokit in `jmbish04/core-github-api` if discrepancies are found.
