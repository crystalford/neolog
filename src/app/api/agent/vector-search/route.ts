import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { requireAutomationKey } from "@/lib/apiKeyAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EMBEDDING_DIM = 1536;

type EmbeddingResponse = {
  data: Array<{
    embedding: number[];
  }>;
};

function wantsMarkdown(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format === "md" || format === "markdown") return true;

  const accept = req.headers.get("accept") || "";
  return accept.includes("text/markdown") || accept.includes("text/plain");
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function vectorLiteral(vec: number[]) {
  // pgvector accepts `[1,2,3]` format
  return `[${vec.join(",")}]`;
}

function pickTextForEmbedding(post: {
  title: string | null;
  excerpt: string | null;
  content: string | null;
  content_html: string | null;
}) {
  const parts: string[] = [];
  if (post.title) parts.push(post.title);
  if (post.excerpt) parts.push(post.excerpt);

  // Prefer plain text content when available; fallback to html.
  if (post.content) parts.push(post.content);
  else if (post.content_html) parts.push(post.content_html);

  return parts.join("\n\n").trim();
}

async function embedText(text: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding request failed (${res.status}): ${errText}`);
  }

  const json = (await res.json()) as EmbeddingResponse;
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Embedding response missing embedding array");
  }

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Unexpected embedding dim ${embedding.length} (expected ${EMBEDDING_DIM}). Check OPENAI_EMBEDDING_MODEL.`,
    );
  }

  return embedding;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAutomationKey(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const username = (url.searchParams.get("username") || "").trim();

    const limitParam = Number(url.searchParams.get("limit") || "10");
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(25, limitParam))
      : 10;

    if (!q) {
      return NextResponse.json({ error: "Missing q" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server missing Supabase admin configuration." },
        { status: 500 },
      );
    }

    let authorId: string | null = null;
    if (username) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        return NextResponse.json(
          { error: `User not found: ${username}` },
          { status: 404 },
        );
      }
      authorId = profile.id;
    }

    // Ensure we have embeddings for the latest posts (small capped batch).
    const seedLimitParam = Number(url.searchParams.get("seed") || "50");
    const seed = Number.isFinite(seedLimitParam)
      ? Math.max(0, Math.min(200, seedLimitParam))
      : 50;

    if (seed > 0) {
      let postsQuery = supabase
        .from("posts")
        .select("id,title,excerpt,content,content_html,updated_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(seed);

      if (authorId) postsQuery = postsQuery.eq("author_id", authorId);

      const { data: seedPosts, error: seedError } = await postsQuery;
      if (seedError) throw seedError;

      const postIds = (seedPosts || []).map((p) => p.id);
      if (postIds.length) {
        const { data: existingEmbeddings, error: embError } = await supabase
          .from("post_embeddings")
          .select("post_id,content_hash")
          .in("post_id", postIds);
        if (embError) throw embError;

        const hashByPostId = new Map<string, string>();
        for (const row of existingEmbeddings || []) {
          hashByPostId.set(row.post_id, row.content_hash);
        }

        const stale: Array<{ post_id: string; text: string; hash: string }> = [];
        for (const post of seedPosts || []) {
          const text = pickTextForEmbedding(post);
          if (!text) continue;

          const hash = sha256(text);
          const existingHash = hashByPostId.get(post.id);
          if (!existingHash || existingHash !== hash) {
            stale.push({ post_id: post.id, text, hash });
          }
        }

        const maxUpsertsParam = Number(url.searchParams.get("maxUpserts") || "10");
        const maxUpserts = Number.isFinite(maxUpsertsParam)
          ? Math.max(0, Math.min(25, maxUpsertsParam))
          : 10;

        for (const item of stale.slice(0, maxUpserts)) {
          const embedding = await embedText(item.text);
          const embeddingValue = vectorLiteral(embedding);

          const { error: upsertError } = await supabase
            .from("post_embeddings")
            .upsert(
              {
                post_id: item.post_id,
                embedding: embeddingValue,
                content_hash: item.hash,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "post_id" },
            );

          if (upsertError) throw upsertError;
        }
      }
    }

    // Embed the query.
    const queryEmbedding = await embedText(q);

    const { data: matches, error: matchError } = await supabase.rpc("match_posts", {
      query_embedding: vectorLiteral(queryEmbedding),
      match_count: limit,
      author_filter: authorId,
    });

    if (matchError) throw matchError;

    const postIds = (matches || []).map((m: any) => m.post_id);
    if (!postIds.length) {
      if (wantsMarkdown(req)) {
        return new NextResponse("No results.\n", {
          headers: { "content-type": "text/markdown; charset=utf-8" },
        });
      }
      return NextResponse.json({ query: q, results: [] });
    }

    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select(
        "id,title,slug,excerpt,published_at,updated_at,author:profiles(username)",
      )
      .in("id", postIds);

    if (postsError) throw postsError;

    const scoreById = new Map<string, number>();
    for (const m of matches || []) {
      scoreById.set(m.post_id, m.score);
    }

    const ordered = (posts || [])
      .map((p: any) => ({
        ...p,
        score: scoreById.get(p.id) ?? null,
      }))
      .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));

    if (wantsMarkdown(req)) {
      const lines: string[] = [];
      lines.push(`# Vector search`);
      lines.push("");
      lines.push(`Query: **${q.replaceAll("*", "\\*")}**`);
      if (username) lines.push(`User: **${username.replaceAll("*", "\\*")}**`);
      lines.push("");

      for (const r of ordered) {
        const u = r.author?.username || "unknown";
        const score = typeof r.score === "number" ? r.score.toFixed(4) : "-";
        lines.push(`- **${r.title || "(untitled)"}** (@${u}) — score: ${score}`);
      }

      lines.push("");
      return new NextResponse(lines.join("\n"), {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }

    return NextResponse.json({
      query: q,
      username: username || null,
      results: ordered,
    });
  } catch (e: any) {
    const message = e?.message || "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
