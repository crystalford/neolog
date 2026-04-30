# Neolog — Pages & What They Display

## /dashboard (Home)
- Stats bar: total uploads, posts ready, entities count
- Hero: last key_win from most recent processed upload
- Recent sessions list (last 5): title, recorded_at, mood, energy
- Posts ready to publish count

## /dashboard/videos
- Drag-and-drop upload zone (multipart to R2, progress bar per file)
- Video library grid: thumbnail, filename, status badge, duration
- Status badges: uploaded / transcribing / analyzing / processed / error
- On hover: Reanalyze button
- Thumbnail: browser-captured via canvas on load (auto-saves if missing)
- Click → /dashboard/timeline/[id]

## /dashboard/timeline
- Paginated list of all processed uploads
- Per card: thumbnail, title, duration, recorded_at date
- mood + energy_level badges
- Idea count badge (content_ideas.length + strong_opinions.length)
- IDEAS SURFACED section: content_ideas[].topic (top 4)
- KEY QUOTES section: key_quotes (top 3)
- STRONG OPINIONS (top 3)
- Mobile: 1-column layout, reduced padding
- Search bar (client-side filter by title/transcript)

## /dashboard/timeline/[id] (Video Detail)
- Summary paragraph (analysis.summary)
- Topic tags: recurring_themes + topics + categories[] merged, rendered as pills
- Signals row: mood badge + energy_level badge
- KEY MOMENTS: key_quotes[] (top 4, rendered as blockquotes)
- IDEAS: ideas[].text + type label (top 6)
- ACTIONS: action_items[].task + urgency badge (top 8)
- REFLECTIONS: observation, challenge, encouragement (or plain string fallback)
- ENTITIES MENTIONED: from entity_mentions join, grouped by entity type, linked to entity detail
- Full transcript (collapsible, plain text)
- NOT displayed: decisions, blockers, goals, habits, projects, people_mentioned, stories_told

## /dashboard/posts
- Tabs: Ready / Scheduled / Published
- Post cards: content preview, platform badge, generated_at
- Publish to X button (requires X OAuth in settings)
- Edit modal with text area

## /dashboard/studio
- Content creation pipeline
- Input: select source upload(s) from library
- Generate: video essay / article / thread
- Script editor (segment by segment)
- Record: teleprompter mode, beat by beat
- Produce: assembles audio + visuals → MP4
- Status: queued → running → scripted → assembling → generating-visuals → composing → done
- Productions stored in productions table

## /dashboard/edit
- Auto-edit from vlogs
- Select clip session (group of uploads)
- Runs cross-clip synthesis → finds themes, narrative arcs, best moments
- Generates edit plan (EDL: ordered list of timestamp ranges)
- User reviews plan
- Assemble → Replicate FFmpeg assembles final MP4
- Download assembled video

## /dashboard/brain (/dashboard/entities)
- 6-region intelligence view
  1. Memory — entities by type (people, topics, skills)
  2. Executive — projects + action items
  3. Emotional — mood/energy patterns over time
  4. Pattern — recurring themes, habits, values
  5. Marinating — ideas accumulating across sessions
  6. Conflict — contradictions, blockers, unresolved questions
- Synthesize Graph button → fires synthesize-user-graph Inngest job
- Entity cards link to /dashboard/entities/[id]

## /dashboard/entities/[id] (Entity Detail)
- Entity name, type, status badge
- Summary paragraph
- All mentions across sessions (chronological)
- Per mention: date, video title, context excerpt, sentiment badge
- Related entities graph

## /dashboard/projects/[slug]
- Full project document
- Overview, decisions log, action items, roadmap, technical notes
- Synthesis history (last 10 snapshots showing what changed)
- Synthesize button → fires synthesize-project Inngest job
- Export as Markdown

## /dashboard/system (Admin)
- Pipeline status panel: counts by status (queued/in-progress/done/failed)
- Null dates count, missing thumbnails count
- Estimated minutes remaining for queue
- Buttons:
  - Reprocess Stuck Jobs (stuck >20 min)
  - Backfill Recording Dates (calls /api/system/run-date-backfill directly)
  - List Missing Thumbnails (returns signed URLs for browser capture)
- Backfill result now shows: HTTP status, error message, updated/skipped/total, summary diagnostic
- Shows DEFAULT_PROMPTS for extraction, debrief, script, posts (NOTE: extraction prompt shown here is SHORTER than real ANALYSIS_SYSTEM_PROMPT — they are out of sync)

## /dashboard/settings
- API Keys section: Anthropic, OpenAI, Groq, Replicate, ElevenLabs keys
- X OAuth: connect/disconnect
- R2 storage: bucket name, region, credentials
- Profile: display name, bio, avatar

## /dashboard/character (Deprioritized)
- Portrait corpus for LoRA training
- NOT in main nav
- Do not build further

## Public Pages
- / — Landing page with terminal animation, product sections, amber aesthetic
- /[username] — Public profile page
- /[username]/[slug] — Published post
