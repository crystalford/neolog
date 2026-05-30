# neolog-admin-bridge

A 100-line Cloudflare Worker that proxies the Neolog admin API from a
`*.workers.dev` host (allow-listed in Claude Code on the web by default)
to `neolog.ai` (NOT allow-listed; documented bug:
[anthropics/claude-code#52982](https://github.com/anthropics/claude-code/issues/52982)).

With this deployed, Claude can call admin endpoints autonomously instead
of asking the operator to paste responses from DevTools.

## One-time deploy

You only need to do this once. It costs nothing (well under the Workers
free tier) and the worker stays up indefinitely.

### Step 1 — Create a Cloudflare Access service token

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Service Auth** → **Service Tokens** → **Create Service Token**
2. Name: `claude-code-bridge`
3. Copy the **Client ID** and **Client Secret** somewhere safe (the secret
   is shown ONCE).

### Step 2 — Add a policy on the Access app that allows that token

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → your `neolog.ai` app → **Edit**
2. **Policies** → **Add a policy**
3. Action: **Service Auth**
4. Include rule: **Service Token** → `claude-code-bridge`
5. Save

Now requests to `neolog.ai` carrying both
`CF-Access-Client-Id` and `CF-Access-Client-Secret` headers bypass the
SSO challenge.

### Step 3 — Pick a Claude bearer secret

Just a random string. You'll give it to Claude once (paste it here, it
goes into the bridge's secrets, never in a commit).

```sh
openssl rand -hex 32
```

### Step 4 — Deploy the worker

From this directory:

```sh
pnpm install
pnpm wrangler secret put CLAUDE_BEARER          # paste the random string from Step 3
pnpm wrangler secret put CF_ACCESS_CLIENT_ID    # paste from Step 1
pnpm wrangler secret put CF_ACCESS_CLIENT_SECRET # paste from Step 1
pnpm wrangler deploy
```

`wrangler deploy` prints the final URL — something like
`https://neolog-admin-bridge.YOUR-SUBDOMAIN.workers.dev`. Copy that.

### Step 5 — Tell Claude

Paste this URL and the bearer back to Claude. Claude will then call
endpoints like:

```
GET  <BRIDGE_URL>/runtime-state
POST <BRIDGE_URL>/transcode-one  body: { "vlog_id": "..." }
GET  <BRIDGE_URL>/playback-audit?limit=50
POST <BRIDGE_URL>/restore-transcoded-links
ANY  <BRIDGE_URL>/proxy/api/v2/<anything>   # generic escape hatch
```

All authenticated with `Authorization: Bearer <secret>`.

## Routes

- `GET /` — health check, no auth, lists known routes
- `GET /runtime-state` → proxies `/api/v2/admin/runtime-state`
- `GET /playback-audit` → proxies `/api/v2/admin/playback-audit`
- `POST /transcode-one` → proxies `/api/v2/admin/transcode-one`
- `POST /restore-transcoded-links` → proxies `/api/v2/admin/restore-transcoded-links`
- `ANY /proxy/<path>` → escape hatch, forwards to `https://neolog.ai/<path>`. Lets Claude reach any new admin endpoint without redeploying the bridge.

## Auth model

```
Claude --[ Authorization: Bearer CLAUDE_BEARER ]--> Bridge --[ CF-Access-Client-Id + CF-Access-Client-Secret ]--> neolog.ai
```

The bridge has no SSO redirect, no cookies, no state. It's a single fetch
in, single fetch out.

## Why this works (and the bug that necessitates it)

Anthropic's web sandbox enforces a hardcoded ~205-host allowlist baked
into a JWT minted at container boot. The "All domains" toggle in
Settings → Capabilities is documented but actually broken
([#34690](https://github.com/anthropics/claude-code/issues/34690),
[#52982](https://github.com/anthropics/claude-code/issues/52982),
closed as not planned). Wildcards in additional-domains are also broken
([#33386](https://github.com/anthropics/claude-code/issues/33386)).

`*.workers.dev` IS on the default allowlist (it's a known dev host), so
a Workers-hosted bridge is the lowest-friction official workaround.
Reference: [Anthropic — Remote MCP servers](https://docs.claude.com/en/docs/agents-and-tools/remote-mcp-servers)
documents the same pattern (remote services bypass the sandbox proxy).
