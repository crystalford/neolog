import { NextRequest, NextResponse } from "next/server";

import { requireAutomationKey } from "@/lib/apiKeyAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function wantsMarkdown(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format === "md" || format === "markdown") return true;

  const accept = req.headers.get("accept") || "";
  return accept.includes("text/markdown") || accept.includes("text/plain");
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchTextFromUrl(url: string) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      // Basic UA helps some sites.
      "user-agent": "neolog-ingest/1.0",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fetch failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    // Still try.
  }

  return await res.text();
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAutomationKey(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          title?: string;
          text?: string;
          url?: string;
          source?: string;
          excerpt?: string;
          status?: "draft" | "published";
        }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const url = body.url?.trim();
    const rawText = body.text?.trim();

    if (!url && !rawText) {
      return NextResponse.json(
        { error: "Provide either url or text" },
        { status: 400 },
      );
    }

    let contentText = rawText || "";
    if (!contentText && url) {
      const html = await fetchTextFromUrl(url);
      contentText = stripHtml(html);
    }

    contentText = contentText.trim();
    if (!contentText) {
      return NextResponse.json(
        { error: "No ingestable content found" },
        { status: 400 },
      );
    }

    const title =
      body.title?.trim() ||
      (url ? url.replace(/^https?:\/\//, "").slice(0, 80) : "Untitled");

    const excerpt = body.excerpt?.trim() || contentText.slice(0, 240);

    const slugBase = slugify(title) || "draft";
    const slug = `${slugBase}-${Date.now().toString(36)}`;

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server missing Supabase admin configuration." },
        { status: 500 },
      );
    }

    const contentForPost = url
      ? `Source: ${url}\n\n${contentText}`
      : contentText;

    // Create a draft post owned by the API key's user.
    const { data: created, error: insertError } = await supabase
      .from("posts")
      .insert({
        author_id: auth.userId,
        title,
        excerpt,
        content: contentForPost,
        content_type: "markdown",
        status: body.status || "draft",
        slug,
      })
      .select("id,slug,status")
      .single();

    if (insertError) throw insertError;

    if (wantsMarkdown(req)) {
      const lines: string[] = [];
      lines.push(`# Ingested draft`);
      lines.push("");
      lines.push(`- id: ${created.id}`);
      lines.push(`- slug: ${created.slug}`);
      lines.push(`- status: ${created.status}`);
      if (url) lines.push(`- source: ${url}`);
      lines.push("");

      return new NextResponse(lines.join("\n"), {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }

    return NextResponse.json({
      ok: true,
      post: created,
    });
  } catch (e: any) {
    const message = e?.message || "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
