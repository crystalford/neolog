# Neolog admin probe loop

Claude can't reach neolog.ai from the Claude Code web sandbox (egress
allowlist blocks it, and *.workers.dev too). But a GitHub Actions runner
can. This directory is the request/response mailbox between them.

- `request.json`  — Claude writes this: { "method": "GET|POST", "path": "/api/v2/...", "body": {...} }
- `response.json` — the workflow writes this back: { http_status, body, body_json }

Driven by .github/workflows/neolog-admin-probe.yml (triggers on push to
request.json). The runner authenticates to neolog.ai with the Cloudflare
Access service token stored in repo secrets.
