#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function formatUnknownError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function main() {
  const baseUrl = process.env.NEOLOG_BASE_URL || "http://127.0.0.1:3000";

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["scripts/mcp/server.mjs"],
    env: {
      ...process.env,
      NEOLOG_BASE_URL: baseUrl,
      // NEOLOG_API_KEY can be provided by the caller as an env var.
    },
  });

  const client = new Client(
    { name: "neolog-mcp-smoketest-call-stack", version: "0.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  const args = {
    title: "MCP Smoketest Stack",
    description: "Created via MCP smoketest script",
    infographicHtml: "<!doctype html><html><body><h1>Infographic</h1></body></html>",
    essay: "# Essay\n\nThis is a smoketest.",
    researchDoc: "# Research\n\n- Source A\n- Source B\n",
    createDrafts: true,
  };

  try {
    const result = await client.callTool({
      name: "neolog_series_create_stack",
      arguments: args,
    });

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          result,
        },
        null,
        2,
      ) + "\n",
    );
  } catch (err) {
    const message = formatUnknownError(err);

    const isAuth = message.includes("401") ||
      message.toLowerCase().includes("unauthorized") ||
      message.toLowerCase().includes("invalid api key") ||
      message.includes("403");

    const isConn = message.toLowerCase().includes("econnrefused") ||
      message.toLowerCase().includes("fetch failed") ||
      message.toLowerCase().includes("getaddrinfo") ||
      message.toLowerCase().includes("enotfound");

    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          error: message,
          hint: isConn
            ? "Neolog server likely isn't reachable at NEOLOG_BASE_URL. Start it (npm run dev) or set NEOLOG_BASE_URL to the right URL."
            : isAuth
              ? "Auth failed. Set NEOLOG_API_KEY (neo_...) in your environment or Claude Desktop config."
              : "Tool call failed. See error for details.",
        },
        null,
        2,
      ) + "\n",
    );

    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
