import { NextRequest, NextResponse } from "next/server";

import { requireAutomationKey } from "@/lib/apiKeyAuth";
import { resolveProviderKeyWithClient } from "@/lib/ai-provider";
import {
  embedTextWithOpenAI,
  pickTextForEmbedding,
  sha256,
  vectorLiteral,
} from "@/lib/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { logProviderUsage } from "@/lib/usage";
import { enforceUsageCaps } from "@/lib/usageCaps";

export const dynamic = "force-dynamic";

type Actor = {
  userId: string;
  openaiKey: string;
};

function wantsMarkdown(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format === "md" || format === "markdown") return true;

  const accept = req.headers.get("accept") || "";
  return accept.includes("text/markdown") || accept.includes("text/plain");
}

async function resolveActor(req: NextRequest, admin: any): Promise<Actor | null> {
  const auth = await requireAutomationKey(req);
  if (auth.ok) {
    const provider = await resolveProviderKeyWithClient(admin, auth.userId, "openai");
    if (!provider) return null;
    return { userId: auth.userId, openaiKey: provider.key };
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const provider = await resolveProviderKeyWithClient(admin, user.id, "openai");
  if (!provider) return null;
  return { userId: user.id, openaiKey: provider.key };
}

export async function GET(req: NextRequest) {
  try {
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

    const actor = await resolveActor(req, supabase);
    if (!actor) {
      return NextResponse.json(
        { error: "Semantic search requires login + OpenAI key (or Pro managed key)." },
        { status: 401 },
      );
    }

    try {
      await enforceUsageCaps({ supabase, userId: actor.userId, provider: "openai" });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Usage cap reached." },
        { status: 429 },
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
          const embedding = await embedTextWithOpenAI({
            apiKey: actor.openaiKey,
            text: item.text,
            onUsage: (u) => {
              void logProviderUsage({
                userId: actor.userId,
                provider: "openai",
                model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
                route: "/api/agent/vector-search",
                operation: "embeddings",
                usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
                metadata: { kind: "seed", post_id: item.post_id },
              });
            },
          });
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
    const queryEmbedding = await embedTextWithOpenAI({
      apiKey: actor.openaiKey,
      text: q,
      onUsage: (u) => {
        void logProviderUsage({
          userId: actor.userId,
          provider: "openai",
          model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
          route: "/api/agent/vector-search",
          operation: "embeddings",
          usage: { prompt_tokens: u.prompt_tokens, total_tokens: u.total_tokens },
          metadata: { kind: "query" },
        });
      },
    });

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
