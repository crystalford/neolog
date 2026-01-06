#!/usr/bin/env node

/*
Legacy MCP server implementation (corrupted during a prior edit).
Kept for reference but fully commented out.

DO NOT EDIT INSIDE THIS COMMENT BLOCK.

--- BEGIN LEGACY (commented out) ---

/**
 * Neolog MCP server (stdio).
 *
 * Exposes Neolog "agent" routes as MCP tools.
 *
 * Configure:
 * - NEOLOG_BASE_URL (default http://localhost:3000)
 * - NEOLOG_API_KEY (required)  -> Neolog automation API key
 * /

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
          properties: {
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
      },

      {
        name: "neolog_vault_add",
        description: "Capture content into the Neolog vault (assets).",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["prompt", "image", "code", "text", "link", "quote", "fragment"],
            },
            content: { type: "string" },
            title: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            publicationId: { type: "string" },
            source_platform: { type: "string" },
            source_url: { type: "string" },
            meta: { type: "object" },
          },
          required: ["type", "content"],
        },
      },
      {
        name: "neolog_vault_search",
        description: "Search the Neolog vault (assets) by keyword.",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string" },
            publicationId: { type: "string" },
            type: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            limit: { type: "number" },
          },
          required: ["q"],
        },
      },
      {
        name: "neolog_terms_list",
        description: "List canonical terms (lexicon) for a publication.",
        inputSchema: {
          type: "object",
          properties: {
            publicationId: { type: "string" },
            limit: { type: "number" },
          },
        },
      },
      {
        name: "neolog_term_get",
        description: "Get a canonical term by id or slug.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            publicationId: { type: "string" },
          },
        },
      },
      {
        name: "neolog_terms_check",
        description: "Check whether a list of terms exist in the lexicon (returns missing).",
        inputSchema: {
          type: "object",
          properties: {
            publicationId: { type: "string" },
            terms: { type: "array", items: { type: "string" } },
          },
          required: ["terms"],
        },
      },
      {
        name: "neolog_term_propose_version",
        description: "Propose a new definition/version for an existing term.",
        inputSchema: {
          type: "object",
          properties: {
            termId: { type: "string" },
            definition_md: { type: "string" },
            change_summary: { type: "string" },
          },
          required: ["termId", "definition_md"],
        },
      },
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

  if (name === "neolog_vault_add") {
    const result = await callAgent("/api/vault/add", {
      method: "POST",
      body: {
        type: args.type,
        content: args.content,
        title: args.title,
        tags: args.tags,
        publicationId: args.publicationId,
        source_platform: args.source_platform,
        source_url: args.source_url,
        meta: args.meta,
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_vault_search") {
    const tags = Array.isArray(args.tags) ? args.tags.filter(Boolean).join(",") : undefined;
    const result = await callAgent("/api/vault/search", {
      method: "GET",
      query: {
        q: args.q,
        publicationId: args.publicationId,
        type: args.type,
        tags,
        limit: args.limit,
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_terms_list") {
    const result = await callAgent("/api/lexicon/terms", {
      method: "GET",
      query: { publicationId: args.publicationId, limit: args.limit },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_term_get") {
    const result = await callAgent("/api/lexicon/terms", {
      method: "GET",
      query: { id: args.id, slug: args.slug, publicationId: args.publicationId },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_terms_check") {
    const result = await callAgent("/api/lexicon/terms/check", {
      method: "POST",
      body: { publicationId: args.publicationId, terms: args.terms },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "neolog_term_propose_version") {
    const result = await callAgent("/api/lexicon/terms/propose-version", {
      method: "POST",
      body: {
        termId: args.termId,
        definition_md: args.definition_md,
        change_summary: args.change_summary,
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

--- END LEGACY (commented out) ---
*/

/**
 * Clean Neolog MCP server (stdio).
 *
 * Exposes Neolog API routes as MCP tools.
 *
 * Configure:
 * - NEOLOG_BASE_URL (default http://localhost:3000)
 * - NEOLOG_API_KEY (recommended; required for authenticated routes)
 */

import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport as McpStdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema as McpCallToolRequestSchema,
  ListToolsRequestSchema as McpListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.NEOLOG_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.NEOLOG_API_KEY;

if (!API_KEY) {
  console.error(
    "Warning: Missing NEOLOG_API_KEY. The MCP server will start, but most tools will fail with 401/403 until you set it.",
  );
}

async function callNeolog(path, { method = "GET", query, body } = {}) {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    if (!API_KEY && (res.status === 401 || res.status === 403)) {
      throw new Error(
        `HTTP ${res.status}: Unauthorized. Set NEOLOG_API_KEY in your MCP client config to enable authenticated tool calls.`,
      );
    }
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const TOOL_DEFS = [
  {
    name: "neolog_get_user",
    description: "Get a user profile and recent posts by username.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
      required: ["username"],
    },
  },
  {
    name: "neolog_get_post",
    description: "Get a published post by username + slug.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" }, slug: { type: "string" } },
      required: ["username", "slug"],
    },
  },
  {
    name: "neolog_search",
    description: "Keyword search published posts.",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" }, username: { type: "string" }, limit: { type: "number" } },
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
    inputSchema: {
      type: "object",
      properties: {
        postId: { type: "string" },
        title: { type: "string" },
        excerpt: { type: "string" },
        content: { type: "string" },
        content_html: { type: "string" },
        content_type: { type: "string", enum: ["markdown", "html", "rich", "pulse"] },
      },
      required: ["postId"],
    },
  },
  {
    name: "neolog_publish_draft",
    description: "Publish a draft post by id.",
    inputSchema: {
      type: "object",
      properties: { postId: { type: "string" } },
      required: ["postId"],
    },
  },
  {
    name: "neolog_embeddings_backfill",
    description: "Backfill or refresh embeddings for recent published posts.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" }, limit: { type: "number" }, maxUpserts: { type: "number" } },
    },
  },

  {
    name: "neolog_vault_add",
    description: "Capture content into the Neolog vault (assets).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["prompt", "image", "code", "text", "link", "quote", "fragment"] },
        content: { type: "string" },
        title: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        publicationId: { type: "string" },
        source_platform: { type: "string" },
        source_url: { type: "string" },
        meta: { type: "object" },
      },
      required: ["type", "content"],
    },
  },
  {
    name: "neolog_vault_search",
    description: "Search the Neolog vault (assets) by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        publicationId: { type: "string" },
        type: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
      },
      required: ["q"],
    },
  },

  {
    name: "neolog_terms_list",
    description: "List canonical terms (lexicon) for a publication.",
    inputSchema: {
      type: "object",
      properties: { publicationId: { type: "string" }, limit: { type: "number" } },
    },
  },
  {
    name: "neolog_term_get",
    description: "Get a canonical term by id or slug.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, slug: { type: "string" }, publicationId: { type: "string" } },
    },
  },
  {
    name: "neolog_terms_check",
    description: "Check whether a list of terms exist in the lexicon (returns missing).",
    inputSchema: {
      type: "object",
      properties: { publicationId: { type: "string" }, terms: { type: "array", items: { type: "string" } } },
      required: ["terms"],
    },
  },
  {
    name: "neolog_term_propose_version",
    description: "Propose a new definition/version for an existing term.",
    inputSchema: {
      type: "object",
      properties: { termId: { type: "string" }, definition_md: { type: "string" }, change_summary: { type: "string" } },
      required: ["termId", "definition_md"],
    },
  },

  {
    name: "neolog_series_create_stack",
    description:
      "Create a Series and (optionally) three draft posts inside it: Infographic (HTML), Essay (markdown), Research Dump (markdown).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        coverImageUrl: { type: "string" },
        researchDoc: { type: "string" },
        infographicHtml: { type: "string" },
        essay: { type: "string" },
        createDrafts: { type: "boolean" },
      },
      required: ["title"],
    },
  },
];

const server = new McpServer(
  { name: "neolog", version: "0.1.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(McpListToolsRequestSchema, async () => {
  return { tools: TOOL_DEFS };
});

server.setRequestHandler(McpCallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments || {};

  const respond = (result) => ({
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  });

  switch (name) {
    case "neolog_get_user":
      return respond(await callNeolog("/api/agent/user", { method: "GET", query: { username: args.username } }));
    case "neolog_get_post":
      return respond(await callNeolog("/api/agent/post", { method: "GET", query: { username: args.username, slug: args.slug } }));
    case "neolog_search":
      return respond(await callNeolog("/api/agent/search", { method: "GET", query: { q: args.q, username: args.username, limit: args.limit } }));
    case "neolog_vector_search":
      return respond(
        await callNeolog("/api/agent/vector-search", {
          method: "GET",
          query: { q: args.q, username: args.username, limit: args.limit, seed: args.seed, maxUpserts: args.maxUpserts },
        }),
      );
    case "neolog_ingest_draft":
      return respond(
        await callNeolog("/api/agent/ingest", {
          method: "POST",
          body: { title: args.title, url: args.url, text: args.text, excerpt: args.excerpt, status: args.status || "draft" },
        }),
      );
    case "neolog_update_draft":
      return respond(
        await callNeolog("/api/agent/draft/update", {
          method: "POST",
          body: {
            postId: args.postId,
            title: args.title,
            excerpt: args.excerpt,
            content: args.content,
            content_html: args.content_html,
            content_type: args.content_type,
          },
        }),
      );
    case "neolog_publish_draft":
      return respond(await callNeolog("/api/agent/draft/publish", { method: "POST", body: { postId: args.postId } }));
    case "neolog_embeddings_backfill":
      return respond(
        await callNeolog("/api/agent/embeddings/backfill", {
          method: "POST",
          query: { username: args.username, limit: args.limit, maxUpserts: args.maxUpserts },
        }),
      );

    case "neolog_vault_add":
      return respond(
        await callNeolog("/api/vault/add", {
          method: "POST",
          body: {
            type: args.type,
            content: args.content,
            title: args.title,
            tags: args.tags,
            publicationId: args.publicationId,
            source_platform: args.source_platform,
            source_url: args.source_url,
            meta: args.meta,
          },
        }),
      );
    case "neolog_vault_search": {
      const tags = Array.isArray(args.tags) ? args.tags.filter(Boolean).join(",") : undefined;
      return respond(
        await callNeolog("/api/vault/search", {
          method: "GET",
          query: { q: args.q, publicationId: args.publicationId, type: args.type, tags, limit: args.limit },
        }),
      );
    }

    case "neolog_terms_list":
      return respond(await callNeolog("/api/lexicon/terms", { method: "GET", query: { publicationId: args.publicationId, limit: args.limit } }));
    case "neolog_term_get":
      return respond(await callNeolog("/api/lexicon/terms", { method: "GET", query: { id: args.id, slug: args.slug, publicationId: args.publicationId } }));
    case "neolog_terms_check":
      return respond(await callNeolog("/api/lexicon/terms/check", { method: "POST", body: { publicationId: args.publicationId, terms: args.terms } }));
    case "neolog_term_propose_version":
      return respond(
        await callNeolog("/api/lexicon/terms/propose-version", {
          method: "POST",
          body: { termId: args.termId, definition_md: args.definition_md, change_summary: args.change_summary },
        }),
      );

    case "neolog_series_create_stack":
      return respond(
        await callNeolog("/api/series/create-stack", {
          method: "POST",
          body: {
            title: args.title,
            description: args.description,
            coverImageUrl: args.coverImageUrl,
            researchDoc: args.researchDoc,
            infographicHtml: args.infographicHtml,
            essay: args.essay,
            createDrafts: args.createDrafts,
          },
        }),
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new McpStdioServerTransport();
await server.connect(transport);
