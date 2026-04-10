import { inngest } from "../client";
import { createClient } from "@/lib/supabase/server";

export const scatterScheduler = inngest.createFunction(
  { id: "scatter-scheduler", name: "Social Scatter Scheduler" },
  { cron: "0 */6 * * *" }, // Every 6 hours
  async ({ step }) => {
    const supabase = createClient();

    // 1. Get all approved posts that need scheduling
    const { data: approvedPosts } = await step.run("fetch-approved-posts", async () => {
      const { data } = await supabase
        .from("social_queue")
        .select("*")
        .eq("status", "approved")
        .is("scheduled_at", null)
        .order("created_at", { ascending: true });
      return { data };
    });

    if (!approvedPosts || approvedPosts.length === 0) return { message: "No posts to schedule" };

    // 2. Get the latest scheduled post to find the end of the runway
    const { data: latestScheduled } = await step.run("get-runway-end", async () => {
      const { data } = await supabase
        .from("social_queue")
        .select("scheduled_at")
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data };
    });

    let lastTime = latestScheduled?.scheduled_at 
      ? new Date(latestScheduled.scheduled_at).getTime() 
      : Date.now();

    // 3. Assign random future slots (12-24 hours apart)
    const updates = approvedPosts.map((post: any) => {
      const interval = (12 + Math.random() * 12) * 60 * 60 * 1000; // 12-24 hours
      lastTime += interval;
      return {
        id: post.id,
        status: "scheduled",
        scheduled_at: new Date(lastTime).toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    await step.run("update-posts-schedule", async () => {
      for (const update of updates) {
        await supabase
          .from("social_queue")
          .update({ status: update.status, scheduled_at: update.scheduled_at, updated_at: update.updated_at })
          .eq("id", update.id);
      }
    });

    return { scheduledCount: updates.length };
  }
);

export const postDispatcher = inngest.createFunction(
  { id: "post-dispatcher", name: "Social Post Dispatcher" },
  { cron: "*/15 * * * *" }, // Every 15 minutes
  async ({ step }) => {
    const supabase = createClient();

    // 1. Find posts due for publishing
    const { data: duePosts } = await step.run("fetch-due-posts", async () => {
      const { data } = await supabase
        .from("social_queue")
        .select("*")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .limit(10);
      return { data };
    });

    if (!duePosts || duePosts.length === 0) return { message: "No posts due" };

    // 2. Dispatch each post via the internal API (or direct logic)
    const results = [];
    for (const post of duePosts) {
      const result = await step.run(`publish-post-${post.id}`, async () => {
        // We call our internal API to handle token refresh and publishing logic
        // In a real production setup, we might hit the API route directly 
        // to leverage the Edge Runtime logic we already wrote.
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/social/x/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: post.id })
        });
        return res.json();
      });
      results.push({ id: post.id, result });
    }

    return { results };
  }
);
