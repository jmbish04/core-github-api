Contacting Cloudflare Docs Agent (Session: docs-1776928895164)...

Cloudflare Docs Agent:
Below is a complete, step‑by‑step guide for using the **`send_email`** binding in a Cloudflare Worker.  
Everything you need – from setting up Email Routing, configuring the binding in `wrangler`, to sending mail from the Worker (simple JSON API and full MIME messages) – is covered with ready‑to‑copy code snippets.

---

## 1️⃣ Prerequisites – Email Routing must be enabled

| What you need | Why |
|---------------|-----|
| **Email Routing** enabled for a domain you control | The Email Service binding can only send to *verified* destination addresses that belong to a domain with Email Routing turned on. |
| At least **one verified destination address** (e.g. `alerts@example.com`) | The binding will use this address as the “to” address (or you can allow‑list many). |
| A **Cloudflare account** with Workers access | Required to create the Worker and edit the `wrangler` config. |

> **How to enable** – In the Cloudflare dashboard go to **Compute & AI → Email Service → Get Started** and follow the wizard (adds SPF/DKIM DNS records, verifies the domain, creates a destination address).

---

## 2️⃣ Add the `send_email` binding in `wrangler`

You can define one or many bindings. Each binding can be **unrestricted** or **restricted** with the attributes shown below.

| Attribute | Effect |
|-----------|--------|
| `destination_address` | Hard‑codes the *only* address the Worker may send to. If you call `env.MY_MAIL.send({to: …})` you can pass `null`/`undefined` and Cloudflare will automatically use this address. |
| `allowed_destination_addresses` | An allow‑list – the Worker may send to any address in the array. |
| `allowed_sender_addresses` | An allow‑list for the **From** address (helps prevent spoofing). |
| `remote = true` | When developing locally (`wrangler dev`), the binding will forward calls to the real Email Service instead of a mock. Recommended for end‑to‑end testing. |

### 2.1 JSONC (`wrangler.jsonc`) example

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "email‑alert‑worker",
  "compatibility_date": "2024-01-01",

  // ----------- ONE UNRESTRICTED BINDING (any verified address) ------------
  "send_email": [
    {
      "name": "EMAIL"                     // ← reference in the Worker as env.EMAIL
    },

    // ----------- BINDING WITH A SINGLE DESTINATION ADDRESS ----------
    {
      "name": "ALERT_EMAIL",
      "destination_address": "alerts@example.com"
    },

    // ----------- BINDING WITH AN ALLOW‑LIST OF DESTINATIONS ----------
    {
      "name": "MULTI_ALERT",
      "allowed_destination_addresses": [
        "ops@example.com",
        "dev@example.com"
      ]
    },

    // ----------- BINDING THAT RESTRICTS THE SENDER ADDRESS ----------
    {
      "name": "RESTRICTED_EMAIL",
      "allowed_sender_addresses": [
        "noreply@example.com",
        "support@example.com"
      ],
      "remote": true                     // ☁️ remote binding for local dev
    }
  ]
}
```

### 2.2 TOML (`wrangler.toml`) equivalent

```toml
name = "email-alert-worker"
compatibility_date = "2024-01-01"

# Unrestricted
[[send_email]]
name = "EMAIL"

# Single destination (hard‑coded)
[[send_email]]
name = "ALERT_EMAIL"
destination_address = "alerts@example.com"

# Destination allow‑list
[[send_email]]
name = "MULTI_ALERT"
allowed_destination_addresses = ["ops@example.com", "dev@example.com"]

# Sender allow‑list + remote dev
[[send_email]]
name = "RESTRICTED_EMAIL"
allowed_sender_addresses = ["noreply@example.com", "support@example.com"]
remote = true
```

> **Tip:** Keep the binding name short and descriptive – it becomes the property on the `env` argument that you’ll use in your Worker (`env.EMAIL`, `env.ALERT_EMAIL`, …).

---

## 3️⃣ Sending mail from the Worker

There are two common ways to send mail:

| Method | When to use | How it looks |
|--------|-------------|--------------|
| **Simple JSON API** (`env.MY_BINDING.send({ to, from, subject, text, html })`) | Most cases – you just need a plain text / HTML email. | ✅ Minimal code |
| **Full MIME message** (`new EmailMessage(...)` or using a MIME library) | Need attachments, custom headers, or fine‑grained control over the raw RFC‑822 payload. | ⚙️ More flexibility |

Both return a promise that resolves to an object containing at least `messageId` and `status`.

### 3.1 Simple JSON API (JavaScript)

```js
export default {
  async fetch(request, env) {
    // env.EMAIL refers to the binding named "EMAIL" in wrangler
    const result = await env.EMAIL.send({
      // "to" can be omitted if the binding has `destination_address`
      to: "alerts@example.com",
      // "from" must be an address belonging to a domain that has Email Routing enabled
      from: "noreply@example.com",
      subject: "🔔 Worker monitor – all systems go",
      // You can send either plain text **or** HTML or both
      text: "Your worker ran successfully at " + new Date().toISOString(),
      html: `<p>Your worker ran successfully at <strong>${new Date().toISOString()}</strong></p>`
    });

    // result = { messageId: "...", status: "queued", ... }
    return new Response(`✅ Email sent – ID ${result.messageId}`, {status: 200});
  }
} satisfies ExportedHandler<Env>;
```

### 3.2 Simple JSON API (TypeScript)

```ts
export interface Env {
  EMAIL: EmailBinding;   // generated automatically from wrangler config
}

export default {
  async fetch(_: Request, env: Env) {
    const { messageId } = await env.EMAIL.send({
      to: "ops@example.com",
      from: "noreply@example.com",
      subject: "[Worker] Health check",
      text: "Everything is fine 🎉",
    });

    return new Response(`Mail queued – ${messageId}`);
  },
} satisfies ExportedHandler<Env>;
```

### 3.3 Full MIME message – using the built‑in `EmailMessage` class

If you need to **add custom headers, attachments, or control the exact raw payload**, build a MIME message yourself (any library that returns a raw RFC‑822 string works; `mimetext` is the official example) and then hand it to the binding.

```js
import { EmailMessage } from "@cloudflare/email";   // built‑in helper
import { MIMEText } from "mimetext";                // npm package (install via npm/yarn)

export default {
  async fetch(_, env) {
    // Create MIME content
    const mime = new MIMEText();
    mime.setHeader("Subject", "🚨 Alert – BGP hijack detected");
    mime.setHeader("From", "alerts@example.com");
    mime.setHeader("To", "security@example.com");
    mime.setContent(
      "text/plain",
      `A possible BGP hijack was observed:\n
       • Hijacker ASN: 12345
       • Affected prefixes: 203.0.113.0/24, 198.51.100.0/24`,
    );
    // Optionally add an HTML part
    mime.addAlternative(
      "text/html",
      `<p>A possible <b>BGP hijack</b> was observed:</p>
       <ul><li>Hijacker ASN: <code>12345</code></li>
           <li>Affected prefixes: <code>203.0.113.0/24, 198.51.100.0/24</code></li></ul>`
    );

    // Build the raw RFC‑822 string
    const rawMessage = mime.asRaw();

    // Wrap it in Cloudflare's EmailMessage helper (adds required headers)
    const email = new EmailMessage(
      "alerts@example.com",          // From (must be a verified sender on the domain)
      "security@example.com",        // To
      rawMessage                     // Raw RFC‑822 payload
    );

    // Send via the binding – notice we use the same binding name as in wrangler
    const result = await env.ALERT_EMAIL.send(email);
    return new Response(`📧 Sent – ${result.messageId}`);
  },
} satisfies ExportedHandler<Env>;
```

> **Why use `EmailMessage`?**  
> The class automatically injects Cloudflare‑specific headers (`X-Cloudflare-Email-Id`, `X-Cloudflare-From`, etc.) and ensures the payload meets the required format for the Email Service.

### 3.4 Using a sender‑allow‑list (security)

If you configured `allowed_sender_addresses` in `wrangler.toml`, any attempt to use a different `from` address will throw an error at runtime.

```toml
[[send_email]]
name = "RESTRICTED_EMAIL"
allowed_sender_addresses = ["noreply@example.com", "support@example.com"]
```

```js
// ✅ works – from address is allowed
await env.RESTRICTED_EMAIL.send({
  to: "team@example.com",
  from: "support@example.com",
  subject: "Support ticket #123",
  text: "Your ticket has been received."
});

// ❌ throws – from address not on the allow‑list
await env.RESTRICTED_EMAIL.send({
  to: "team@example.com",
  from: "hacker@evil.com",    // ← not permitted
  subject: "Phish",
  text: "…"
});
```

---

## 4️⃣ Developing locally with **remote bindings**

When you run `wrangler dev` you normally get a **mock** email binding that pretends the send succeeded (useful for unit tests). To test the real Email Service while still running locally, add:

```toml
[[send_email]]
name = "EMAIL"
remote = true          # <‑‑ sends to the real Email Service
```

Then start the dev server:

```bash
npx wrangler dev
# → Works exactly like production; you’ll see a real email in your inbox.
```

> **Important** – Remote bindings require the same domain verification and DNS (SPF/DKIM) that production uses, otherwise the email will be rejected.

---

## 5️⃣ Full‑featured example – “BGP hijack alert” worker

This snippet combines everything: a restricted sender, a destination allow‑list, MIME construction, and graceful error handling.

```ts
// src/index.ts
import { EmailMessage } from "@cloudflare/email";
import { MIMEText } from "mimetext";

export interface Env {
  // Binding defined in wrangler.toml as:
  // [[send_email]] name = "ALERTS" allowed_sender_addresses = ["alerts@example.com"]
  ALERTS: EmailBinding;
}

export default {
  async fetch(request: Request, env: Env) {
    // Simulated detection data (in real life you'd parse request JSON, etc.)
    const hijacker = "AS12345";
    const victims = ["AS111", "AS222"];
    const prefixes = ["203.0.113.0/24", "198.51.100.0/24"];

    // Build MIME payload
    const mime = new MIMEText();
    mime.setHeader("Subject", "🚨 BGP hijack alert");
    mime.setHeader("From", "alerts@example.com");
    mime.setHeader("To", "security@example.com");
    const txt = `BGP hijack detected:

Hijacker ASN: ${hijacker}
Expected origins: ${victims.join(", ")}
Affected prefixes: ${prefixes.join(", ")}
`;
    mime.setContent("text/plain", txt);

    const raw = mime.asRaw();
    const message = new EmailMessage(
      "alerts@example.com",          // From – must be in allowed_sender_addresses
      "security@example.com",        // To – must be in allowed_destination_addresses (if set)
      raw
    );

    try {
      const result = await env.ALERTS.send(message);
      return new Response(`✅ Alert sent – ID ${result.messageId}`, {status: 200});
    } catch (e: any) {
      // If the binding is mis‑configured or the email is rejected, we end up here
      return new Response(`❌ Failed to send alert: ${e.message}`, {status: 500});
    }
  },
} satisfies ExportedHandler<Env>;
```

Corresponding `wrangler.toml` snippet:

```toml
name = "bgp-hijack-alert"
compatibility_date = "2024-01-01"

[[send_email]]
name = "ALERTS"
allowed_sender_addresses = ["alerts@example.com"]
allowed_destination_addresses = ["security@example.com"]
remote = true            # optional – enables real sending while developing locally
```

Deploy with:

```bash
npx wrangler publish
```

Now every request to the Worker triggers an email alert.

---

## 6️⃣ What the `send()` response contains

```ts
type SendResult = {
  messageId: string;          // Unique Cloudflare‑generated ID – useful for logs / debugging
  status: "queued" | "sent";  // Usually “queued” – actual delivery happens asynchronously
  // Additional fields may appear (e.g., `error` if the request fails)
};
```

You can store `messageId` in a KV store or log it for later troubleshooting.

---

## 7️⃣ Common pitfalls & troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **`Error: No verified destination address`** | No Email Routing address verified for the domain, or the address you used isn’t in the allow‑list. | Verify the address in Cloudflare → **Email Service → Destination addresses**. Add it to the binding (`destination_address` or `allowed_destination_addresses`). |
| **`Error: From address not allowed`** | `allowed_sender_addresses` is set and you’re using a different `from`. | Use one of the allowed addresses, or remove/re‑configure the restriction. |
| **Emails never arrive (but API reports success)** | SPF/DKIM not published, or the From domain is not authorized. | Ensure DNS records (SPF, DKIM) that Cloudflare gave you are present and propagated. |
| **Local `wrangler dev` shows “mocked” send** | You omitted `remote = true` in the binding. | Add `remote = true` (or test with the live environment). |
| **`Message rejected: 550 5.1.1`** | Destination address not verified or not part of your domain’s routing rules. | Verify the recipient address; for external addresses you must use an allow‑list (`allowed_destination_addresses`). |

---

## 8️⃣ Quick cheat‑sheet

| File | Key snippet |
|------|-------------|
| **wrangler.toml** | ```toml\n[[send_email]]\nname = \"EMAIL\"\nallowed_sender_addresses = [\"noreply@example.com\"]\nallowed_destination_addresses = [\"ops@example.com\", \"dev@example.com\"]\nremote = true\n``` |
| **Worker (simple)** | ```js\nconst result = await env.EMAIL.send({to: \"ops@example.com\", from: \"noreply@example.com\", subject: \"Hello\", text: \"World\"});\n``` |
| **Worker (MIME)** | ```js\nimport { MIMEText } from \"mimetext\";\nimport { EmailMessage } from \"@cloudflare/email\";\nconst mime = new MIMEText();\nmime.setHeader(\"Subject\", \"Alert\");\nmime.setContent(\"text/plain\", \"Alert body\");\nconst raw = mime.asRaw();\nawait env.EMAIL.send(new EmailMessage(\"alerts@example.com\", \"ops@example.com\", raw));\n``` |
| **Local dev with real email** | `npx wrangler dev` (requires `remote = true` in the binding). |
| **Deploy** | `npx wrangler publish` |

---

### 🎉 You’re ready!

1. **Enable Email Routing** → verify domain & address.  
2. **Add a `send_email` binding** in `wrangler` (choose the restriction model you need).  
3. **Call `env.<BINDING>.send(...)`** from your Worker – either with a plain JSON payload or a full MIME message.  
4. **Test locally** (`wrangler dev` with `remote = true`) and then **publish**.

If you run into any specific error messages, drop the exact text and I can help debug further. Happy emailing!

Sources (Top 3):

✅ Response saved to clipboard.
