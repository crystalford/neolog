#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const baseUrl = process.env.NEOLOG_BASE_URL || "http://127.0.0.1:3000";

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["scripts/mcp/server.mjs"],
    env: {
      ...process.env,
      NEOLOG_BASE_URL: baseUrl,
      // Intentionally omit NEOLOG_API_KEY for a safe/no-secrets smoketest.
    },
  });

  const client = new Client(
    { name: "neolog-mcp-smoketest", version: "0.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = (tools?.tools || []).map((t) => t.name).sort();

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        toolCount: toolNames.length,
        tools: toolNames,
      },
      null,
      2,
    ) + "\n",
  );

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
