/**
 * Forwards pull-request webhooks to colby-maestro.
 *
 * This Worker holds the GitHub App registration and therefore receives every
 * webhook for the account. colby-maestro tracks the tasks those pull requests
 * are finishing, and needs the pull-request events - but only those, and only
 * the fields it acts on. The two rules that keep this cheap:
 *
 * - Pull-request events only. The full stream in colby-maestro's D1 would be a
 *   storage bill for rows nobody reads; it drops anything that maps to no task
 *   and stores the rest.
 * - A TRIMMED payload. A GitHub `pull_request` body is tens of kilobytes of
 *   repository, sender, and installation detail that the far side ignores.
 *
 * Fire-and-forget: the forward runs in `waitUntil` and a failure is logged, not
 * raised. GitHub is waiting on this response, and a downstream Worker being
 * unavailable must not turn into a failed delivery that GitHub retries.
 */

type MaestroEnv = {
  /** Service binding to colby-maestro. Absent in environments that do not have it. */
  MAESTRO?: { fetch(request: Request): Promise<Response> };
  /** Shared service credential, the standard one across this ecosystem. */
  WORKER_API_KEY?: string | { get(): Promise<string> };
  /** Fallback when no service binding exists - e.g. local `wrangler dev`. */
  MAESTRO_BASE_URL?: string;
};

type PullRequestPayload = {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    state?: string;
    draft?: boolean;
    merged?: boolean;
    html_url?: string;
    created_at?: string;
    closed_at?: string | null;
    merged_at?: string | null;
    user?: { login?: string };
    head?: { ref?: string };
    base?: { ref?: string };
  };
};

async function resolveKey(env: MaestroEnv): Promise<string> {
  const value = env.WORKER_API_KEY;
  if (typeof value === "string") return value;
  // A Secret Store binding is an OBJECT, and comparing or sending it as a
  // string yields "[object Object]" and a permanent 401.
  if (value && typeof value.get === "function") return value.get();
  return "";
}

/** The subset colby-maestro reads. Everything else is dropped here, not there. */
function trim(deliveryId: string, payload: PullRequestPayload) {
  const pr = payload.pull_request ?? {};
  return {
    event: "pull_request",
    action: payload.action ?? "",
    delivery_id: deliveryId,
    repository: { full_name: payload.repository?.full_name ?? "" },
    pull_request: {
      number: pr.number ?? 0,
      title: pr.title ?? "",
      // Truncated: a PR body can be a novel, and the far side reads it only to
      // find `task:<id>` markers.
      body: (pr.body ?? "").slice(0, 4000),
      state: pr.state ?? "open",
      draft: Boolean(pr.draft),
      merged: Boolean(pr.merged),
      html_url: pr.html_url ?? "",
      created_at: pr.created_at ?? "",
      closed_at: pr.closed_at ?? "",
      merged_at: pr.merged_at ?? "",
      user: { login: pr.user?.login ?? "" },
      head: { ref: pr.head?.ref ?? "" },
      base: { ref: pr.base?.ref ?? "" },
    },
  };
}

export async function forwardPullRequestToMaestro(
  env: MaestroEnv,
  deliveryId: string,
  payload: PullRequestPayload,
): Promise<void> {
  const body = JSON.stringify(trim(deliveryId, payload));
  const key = await resolveKey(env);
  const headers = {
    "content-type": "application/json",
    ...(key ? { authorization: `Bearer ${key}` } : {}),
  };

  try {
    const request = new Request("https://colby-maestro/api/github/events/pull-request", {
      method: "POST",
      headers,
      body,
    });

    const response = env.MAESTRO
      ? await env.MAESTRO.fetch(request)
      : env.MAESTRO_BASE_URL
        ? await fetch(`${env.MAESTRO_BASE_URL}/api/github/events/pull-request`, {
            method: "POST",
            headers,
            body,
          })
        : null;

    if (!response) {
      console.log("[maestro-fanout] no MAESTRO binding or base URL; skipped");
      return;
    }
    if (!response.ok) {
      console.error(`[maestro-fanout] ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return;
    }
    const result = (await response.json()) as { task_ids?: string[]; stored?: boolean };
    console.log(
      `[maestro-fanout] ${payload.repository?.full_name}#${payload.pull_request?.number} -> tasks=${(result.task_ids ?? []).join(",") || "none"} stored=${result.stored}`,
    );
  } catch (error) {
    // Logged, never thrown: GitHub is waiting on the webhook response, and a
    // downstream outage must not become a failed delivery it retries.
    console.error("[maestro-fanout] forward failed:", error);
  }
}
