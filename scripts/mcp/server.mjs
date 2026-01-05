#!/usr/bin/env node

/**
 * Neolog MCP server (stdio).
 *
 * Exposes Neolog "agent" routes as MCP tools.
 *
 * Configure:
 * - NEOLOG_BASE_URL (default http://localhost:3000)
 * - NEOLOG_API_KEY (required)  -> Neolog automation API key
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.NEOLOG_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.NEOLOG_API_KEY;

if (!API_KEY) {
  console.error("Missing NEOLOG_API_KEY");
  process.exit(1);
}

async function callAgent(path, { method = "GET", query, body } = {}) {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
        inputSchema: {
          type: "object",
          properties: {
            postId: { type: "string" },
            title: { type: "string" },
            excerpt: { type: "string" },
            content: { type: "string" },
            content_html: { type: "string" },
            content_type: {
              type: "string",
              enum: ["markdown", "html", "rich", "pulse"],
            },
          },
          required: ["postId"],
        },
      },
      {
        name: "neolog_publish_draft",
        description: "Publish a draft post by id.",
        inputSchema: {
          type: "object",
          properties: {
            postId: { type: "string" },
          },
          required: ["postId"],
        },
      },
      {
        name: "neolog_embeddings_backfill",
        description: "Backfill or refresh embeddings for recent published posts.",
        inputSchema: {
          type: "object",
          properties: {
            username: { type: "string" },
            limit: { type: "number" },
            maxUpserts: { type: "number" },
          },
        },
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "x-api-key": API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "neolog", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "neolog_get_user",
        description: "Get a user profile and recent posts by username.",
        inputSchema: {
          type: "object",
          properties: {
            username: { type: "string" },
          },
          required: ["username"],
        },
      },
      {
        name: "neolog_get_post",
        description: "Get a published post by username + slug.",
        inputSchema: {
          type: "object",
          properties: {
            username: { type: "string" },
            slug: { type: "string" },
          },
          required: ["username", "slug"],
        },
      },
      {
        name: "neolog_search",
        description: "Keyword search published posts.",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string" },
            username: { type: "string" },
            limit: { type: "number" },
          },
          required: ["q"],
        },
      },
      {
        name: "neolog_vector_search",
        description: "Vector (semantic) search published posts.",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string" },
            username: { type: "string" },
            limit: { type: "number" },
            seed: { type: "number" },
            maxUpserts: { type: "number" },
          },
          required: ["q"],
        },
      },
      {
        name: "neolog_ingest_draft",
        description: "Ingest URL or text and create a draft post.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            text: { type: "string" },
            excerpt: { type: "string" },
            status: { type: "string", enum: ["draft", "published"] },
          },
        },
      },
      {
        name: "neolog_update_draft",
        description: "Update a draft post (title/excerpt/content).",
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments || {};

  if (name === "neolog_get_user") {
    const result = await callAgent("/api/agent/user", {
      method: "GET",
      query: { username: args.username },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_get_post") {
    const result = await callAgent("/api/agent/post", {
      method: "GET",
      query: { username: args.username, slug: args.slug },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_search") {
    const result = await callAgent("/api/agent/search", {
      method: "GET",
      query: { q: args.q, username: args.username, limit: args.limit },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_vector_search") {
    const result = await callAgent("/api/agent/vector-search", {
      method: "GET",
      query: {
        q: args.q,
        username: args.username,
        limit: args.limit,
        seed: args.seed,
        maxUpserts: args.maxUpserts,
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_ingest_draft") {
    const result = await callAgent("/api/agent/ingest", {
      method: "POST",
      body: {
        title: args.title,
        url: args.url,
        text: args.text,
        excerpt: args.excerpt,
        status: args.status || "draft",
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_update_draft") {
    const result = await callAgent("/api/agent/draft/update", {
      method: "POST",
      body: {
        postId: args.postId,
        title: args.title,
        excerpt: args.excerpt,
        content: args.content,
        content_html: args.content_html,
        content_type: args.content_type,
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_publish_draft") {
    const result = await callAgent("/api/agent/draft/publish", {
      method: "POST",
      body: { postId: args.postId },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_embeddings_backfill") {
    const result = await callAgent("/api/agent/embeddings/backfill", {
      method: "POST",
      query: {
        username: args.username,
        limit: args.limit,
        maxUpserts: args.maxUpserts,
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
