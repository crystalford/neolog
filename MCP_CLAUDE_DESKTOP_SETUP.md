# Claude Desktop MCP Setup (Windows)

This repo includes an MCP server script that exposes Neolog tools (including creating a full “research stack” as a Series + drafts).

## Prereqs
- Neolog running locally: `npm run dev` (default `http://localhost:3000`)
- A Neolog automation API key (starts with `neo_...`) for authenticated tool calls
  - In the app: go to `/settings` → create an API key.

## Claude Desktop config
Claude Desktop reads a JSON config file that defines MCP servers.

Typical location on Windows:
- `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`

If you don’t see it, search your profile for `claude_desktop_config.json`.

### Example config
Edit the file to include something like:

```json
{
  "mcpServers": {
    "neolog": {
      "command": "node",
      "args": ["C:/Users/suppo/Desktop/neolog/scripts/mcp/server.mjs"],
      "env": {
        "NEOLOG_BASE_URL": "http://127.0.0.1:3000",
        "NEOLOG_API_KEY": "neo_..."
      }
    }
  }
}
```

Notes:
- Replace the `args` path with your actual absolute path.
- Use `http://127.0.0.1:3000` (not `localhost`) to avoid occasional Windows name-resolution weirdness.

Restart Claude Desktop after editing the config.

If you omit `NEOLOG_API_KEY`, the MCP server will still start (so Claude can connect and list tools), but most tool calls will fail with `401/403` until you set the key.

## Optional: local smoketest (no Claude, no API key)
From the repo root, run:

`npm run mcp:smoketest`

Expected result:
- It prints a warning about the missing key
- Then it prints a JSON object with `toolCount` and a list of tool names (proving MCP stdio wiring is working)

## Optional: call the stack tool (will fail without a key)
From the repo root, run:

`npm run mcp:smoketest:call-stack`

Expected result:
- If Neolog isn’t running locally, you’ll get a connection/refused-style error with a hint to start `npm run dev`.
- If Neolog is running but you haven’t set `NEOLOG_API_KEY`, you’ll get a clear unauthorized error with a hint to set the key.
- If Neolog is running and you’ve set `NEOLOG_API_KEY`, it should create a real Series + drafts and print the JSON response.

## Quick test: create a stack in one call
In Claude, ask it to use the tool `neolog_series_create_stack` with arguments like:

```json
{
  "title": "Gemini Deep Research — Example Topic",
  "description": "Deep research dump + infographic + essay",
  "infographicHtml": "<!doctype html><html><body><h1>Infographic</h1></body></html>",
  "essay": "# Thesis\n\nMcLuhan-style notes…",
  "researchDoc": "# Sources\n\n- ...\n\n# Notes\n\n...",
  "createDrafts": true
}
```

Expected result:
- A new Series is created
- Up to 3 draft posts are created inside it (Infographic, Essay, Research Dump)

## If you get errors
- `HTTP 401: Unauthorized. Set NEOLOG_API_KEY...`: set `NEOLOG_API_KEY` in your Claude config env.
- `HTTP 401: {"error":"Invalid API key."}`: generate a new key in `/settings` and paste it into the config.
- `HTTP ... connect ECONNREFUSED`: Neolog isn’t running at `NEOLOG_BASE_URL`.
