import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'


const app = new OpenAPIHono<{ Bindings: Env }>()

// Route: GET /auth/github/login
app.openapi(
  createRoute({
    method: 'get',
    path: '/github/login',
    summary: 'Initiate GitHub OAuth Login',
    description: 'Redirects the user to GitHub to authorize the application.',
    responses: {
      302: {
        description: 'Redirect to GitHub',
      },
    },
  }),
  async (c) => {
    const clientId = await c.env.GITHUB_CLIENT_ID.get();
    if (!clientId) {
      return c.text('GITHUB_CLIENT_ID not configured', 500)
    }

    const redirectUri = `${new URL(c.req.url).origin}/auth/github/callback`
    const returnTo = c.req.query('return_to') || '/';
    
    // Store returnTo in state (simple JSON encoding)
    const stateObj = {
        csrf: crypto.randomUUID(),
        returnTo
    };
    const state = btoa(JSON.stringify(stateObj));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user,repo',
      state,
    })

    return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
  }
)

// Route: GET /auth/github/callback
app.openapi(
  createRoute({
    method: 'get',
    path: '/github/callback',
    summary: 'GitHub OAuth Callback',
    description: 'Handles the callback from GitHub, exchanges code for token, verifies user, and redirects to frontend.',
    request: {
      query: z.object({
        code: z.string(),
        state: z.string().optional(),
        return_to: z.string().optional()
      }),
    },
    responses: {
      302: {
        description: 'Redirect to Frontend with token or error',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  }),
  async (c) => {
    const { code } = c.req.valid('query')
    
    // Fetch secrets asynchronously
    const clientId = await c.env.GITHUB_CLIENT_ID.get();
    const clientSecret = await c.env.GITHUB_CLIENT_SECRET.get();
    const allowedOwner = c.env.GITHUB_OWNER;

    if (!clientId || !clientSecret) {
      console.error('Missing OAuth configuration (Client ID or Secret)')
      return c.text("Missing GitHub OAuth configuration", 500);
    }

    if (!allowedOwner) {
      console.error('Missing GITHUB_OWNER configuration')
      return c.text('Service misconfigured', 500)
    }

    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Cloudflare-Worker-Auth',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })

    const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string }

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub Token Exchange Error:', tokenData)
      return c.redirect('/login?error=github_token_exchange_failed')
    }

    // 2. Fetch User Profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Cloudflare-Worker-Auth',
      },
    })

    if (!userResponse.ok) {
      console.error('GitHub User Fetch Error:', await userResponse.text())
      return c.redirect('/login?error=github_user_fetch_failed')
    }

    const userData = (await userResponse.json()) as { login: string }

    // 3. Authorization Check
    if (userData.login.toLowerCase() !== allowedOwner.toLowerCase()) {
      console.warn(`Unauthorized login attempt by: ${userData.login}`)
      return c.redirect('/login?error=unauthorized_user')
    }

    // 4. Success - Redirect to Frontend with Worker API Key
    const workerApiKey = await c.env.WORKER_API_KEY.get()
    if (!workerApiKey) {
        console.error('WORKER_API_KEY not configured in Secrets Store');
        return c.text('WORKER_API_KEY not configured', 500)
    }
    
    // Decode state to get returnTo
    let returnTo = '/';
    try {
        const stateObj = JSON.parse(atob(c.req.query('state') || ''));
        if (stateObj.returnTo) returnTo = stateObj.returnTo;
    } catch (e) {
        console.warn('Failed to parse state for returnTo, defaulting to root');
    }

    return c.redirect(`/auth/callback?token=${workerApiKey}&return_to=${encodeURIComponent(returnTo)}`)
  }
)

export default app
