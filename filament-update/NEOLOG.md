# Neolog — the personal life graph

This document specifies **Neolog**, a personal life graph and creative production system. It is the operator's complete representation of their thinking, work, projects, ideas, relationships, and creative output — accumulated over time as a structured artifact, with multiple production pipelines built on top to ship work back out into the world.

## What Neolog is

Neolog is the operator's *unified representation of themselves*. Every vlog they record, every project they work on, every person they mention, every idea they develop, every essay they publish, every screenplay scene they draft, every X post they ship, every decision, reframe, breakthrough, return-to-an-old-thought — all of it accumulates into a single structured graph that belongs to the operator and grows as they grow.

The original premise: the operator does not have a Facebook timeline, has not had one for many years, does not want one. Facebook gave the world a thin version of *"a structured representation of your life over time"* and most people gave that infrastructure up when they left those platforms. Nothing replaced it. Neolog is the operator's own version, built deliberately, with depth Facebook never had — because the operator is a creator whose life *is* their work, and the graph is the substrate that lets the work compound.

The graph is the artifact. The graph is the point.

Everything else in this document — extraction, clustering, cultivation, video essay production, article generation, X posts, clips, creative work — those are *tools that operate on the graph*. They are how the operator *contributes to* the graph (by recording vlogs, by making things), how the system *organizes contributions* (extraction parses contributions into structured nodes and edges), and how the graph *outputs back into the world* (production pipelines turn graph material into shipped artifacts). But the graph itself is the foundation. The productions are downstream.

## What Neolog is *not*

It is not a productivity tool. It is not a content production tool. It is not a journaling app dressed up. It is not a video essay engine — though video essays are a major output of it.

The earlier scaffolding name for the production-engine subsystem within Neolog was *NeoVlog*. That name is no longer used in this document because the boundary between "the production engine" and "Neolog itself" was confusing and not load-bearing. The production engine is part of Neolog. Everything in this document is Neolog.

## The current state of Neolog code

Some of Neolog already exists. Some has to be built. Some of what exists has to be torn down and rebuilt because the original implementation was thin and the architecture this document specifies is substantially deeper.

**What exists and continues:**
- Vlog ingestion (multipart R2 upload, Inngest event pipeline)
- Audio extraction (Replicate fofr/toolkit), HEVC transcode for DJI files
- Audio transcription with word-level timestamps (Groq Whisper / AssemblyAI)
- Cloudflare stack: Workers, D1, R2, Workflows, Queues, Containers
- Frontend: Next.js 16 deployed via @opennextjs/cloudflare
- Supabase auth and user storage
- Entity extraction with deduplicated `entities` table and `entity_mentions` table
- ~150 vlogs / 171 sessions in the database

**What exists but needs to be replaced:**
- The thirty-four-field extraction schema (replaced with thread-based extraction from section 6, plus the parallel passes specified for clip detection and creative-mode)
- The Studio page (currently broken — vlog-per-card with non-functional BEGIN buttons; replaced by the deliberate-work cluster detail view per 4.5.4)
- The Timeline (works but needs to become a heterogeneous-card single-feed surface per 4.5.1)

**What exists but is being deprecated as standalone pages:**
- The Edit page — clip candidates surface as Clip-type cards on the Timeline per 4.5.2; the underlying clip-detection pipeline (7.4.15) remains
- The Posts page — x_post and x_thread candidates surface as Post-type cards on the Timeline per 4.5.2; the underlying x_post pipeline (7.4.14) remains

**What does not exist and needs to be built:**
- The graph as an explicit substrate (currently implicit in the entity tables but not architected as a first-class structure)
- Thread extraction
- Connection graph between threads
- Clustering engine
- Cultivation lifecycle
- Voice profile system
- Multi-output production pipelines (article, x_post, x_thread, clip, creative_work)
- Macro-cluster (meta-synthesis) layer
- The Surfaced card type and its subtypes (cluster ready, adjacent insight, gap question, new evidence, auto-link) per 4.5.3
- The Capture surface with backdating prompt for material without recording-date metadata per 4.5.8
- The Graph view, Projects surface, Settings, System
- Visual treatment system
- Production engine

This is a substantial redesign. The substrate (database, vlog ingestion, transcription, entity graph) stays. Everything above the substrate is being redesigned: extraction, all production pipelines, all operator-facing pages. Section 13 covers reconciliation with the existing codebase in detail.

## How Claude Code should approach this document

1. Read the document end-to-end before touching code. The architecture is interconnected; pieces don't make sense in isolation.
2. Read the existing Neolog codebase — particularly the extraction pipeline, Studio's current implementation, and the Timeline view — to understand what's already there and what plugs into vs. revises vs. replaces. See section 13.
3. Produce a reconciliation report against this document — what exists, what is partial, what is missing — before writing new code. The report informs sequencing.
4. No build phases prescribed in this document. Claude Code decides sequencing based on dependency order and integration realities. The document specifies *what the system is*, not *what to build first*.

This document supersedes all prior scattered design notes. Where alternative architectures are discussed (the eight-type production taxonomy, the seven-form video essay system, personal_arc form, the two-type video_essay-vs-documentary split), those are explicitly removed in favor of the architecture specified here. The document represents the operator's current locked decisions.

---

## 1. North star

Neolog is the personal life graph and the production engine that ships from it.

The operator vlogs in real conditions — driving, walking, parked, late at night, in the gaps of a working life. The system ingests those vlogs (already implemented). It extracts threads and creative-elements and clip candidates from them. Threads cluster into developing topics. Topics ripen over time as the operator keeps thinking. When clusters are ripe, they materialize into productions — video essays, articles, X posts, clips, eventually generative-video creative work. Productions ship to platforms (YouTube, Substack, X, TikTok, eventually Aldershot for creative work).

But upstream of all of that, the graph accumulates. The operator's *life and thinking and work* become a structured artifact they own and can navigate.

The operator is a screenwriter and former filmmaker who left the path fifteen years ago and has been circling back ever since. They run multiple projects in parallel — Neolog, CANOPTICON, Drophead, Crystal Ford essays, Pack Rats, The Mechanical Bride, micro-SaaS products. The graph holds all of them. The production engine ships from any of them.

Neolog is McLuhan's medium-as-message embodied — the keyboard generation rediscovering creative work through voice, and the vlog as the rough draft of everything that follows.

**The deepest description: Neolog is a tuning fork.** The vlogs are not raw material to be processed. They are the operator's process of articulation — and the system's job is to be the tuning fork that makes each iteration sharper than the last. The operator articulates roughly, the system reflects back a more articulated version, the operator hears that version in their own voice when they record, the next vlog comes out sharper because the muscle has been trained, and the cycle continues. The system is not extracting from the operator. The system is *tuning* the operator.

---

## 2. The feed-forward refraction loop

The operating principle is feed-forward, not feedback.

Feedback is correction. The thermostat reads the room, adjusts the heater, returns to a setpoint. The output is measured against a target and the system self-corrects.

Feed-forward is amplification. The output of one stage becomes the input of the next stage with new properties added. Each pass through is a transformation, not a correction. The operator does not return to baseline slightly improved; the operator ends up somewhere genuinely new.

The Neolog loop:

```
Vlog (rough, in real conditions)
  → Extraction (capture + analysis + completion + bounce)
  → Clustering across library (find resonance, combine ideas)
  → Script generation (articulated version in operator's voice)
  → Recording (operator reads script aloud, beat by beat)
  → Production (cinematic assembly, B-roll + generated visuals + archival)
  → Publishing (refracted across platforms)
  → New vlog reflects on the published work
  → Cycle continues
```

The operator does not get corrected toward an ideal. The operator gets amplified into a more articulated, more public, more developed thinker over time. Each cycle moves forward. The body of work grows. The operator's voice and visual sensibility are *trained* by the system's output, not measured against a fixed standard.

Some feedback exists within this — when the operator asks a question in a vlog, the system answers it through the script; when the operator half-articulates a thought, the system completes it. But the completion is not correction. It is the system giving the operator back a more articulate version of what they were reaching for. The operator hears that version through their own mouth when they read the script aloud, and over time the more-articulate version becomes part of how the operator naturally speaks. The training wheels grip; eventually they come off.

This is structurally identical to how oral cultures trained their members. Bards memorized epics by reciting them. The recitation was both performance and training. Neolog's recitation culture trains the operator into what they will be able to speak about in a year that they cannot speak about today.

The training-wheels framing is load-bearing. The system has to be **zero-friction at the input** because the whole loop collapses if vlogging becomes work. The vlog is the thing the operator can already do. The system takes whatever raw material can be produced in real conditions and refracts it into something better. Friction at the input kills the loop.

**The loop is bidirectional, even though the dominant direction is system-trains-operator.** As the operator sees what the system surfaces from their vlogs — what gets caught, what gets missed, which kinds of phrasings produce the strongest scripts — they get better at directing the system through their voice. They learn what the system reads well; they sharpen the input over time. This is not a feature to build; it is an emergent property of the operator using the system seriously over time. The architectural implication is that the system should be *legible* about what it surfaced from each vlog and why, so the operator can see the connection between input and output and adjust accordingly.

---

## 3. What is locked

These are not under reconsideration without explicit cause. Decisions and constraints, in priority order:

**Production type, current scope.** Voice-narrated documentary video essay. One type. No camera. The operator's voice is the strongest attribute and the system plays to it. On-camera production is a future product with different friction profiles and different design problems; do not anticipate it in current architecture.

**Production tier system.** Lo-Fi / Mid-Fi / Hi-Fi as cost and complexity toggles per production. The operator picks a tier at the brief stage. Lo-Fi is for high-volume daily output (cheaper models, fewer generated assets, simpler treatments). Hi-Fi is for tentpole essays the operator wants to land (best models, full bounce research, generated video for opens and closes, deepest visual treatment). Mid-Fi is the regular default. Tiers are about cost and polish, not about exposure or operator visibility.

**Visual identity.** Cinematic short-documentary. Phone-and-DSLR-class footage shot with cinematographic intention — rack zooms, slow pushes, deliberate composition, available light, occasional black-and-white, film grain treatment. The reference is short documentary film (Adam Curtis, Errol Morris, Werner Herzog, La Jetée), not YouTube video essay. Generated visuals are prompted to match the cinematic register, not "documentary photography" generically.

**Place specificity.** Southern Ontario, the operator's actual world — Hamilton, Toronto, the highways, the parking lots, the coffee shops, the gig-economy environments. The visual world is regional and specific. This is identity, not flavor. Filmmakers from specific places have always done this; place specificity is what makes a body of work *yours* rather than generic.

**Visual sources, in priority order.** (1) The operator's own B-roll, when it fits. (2) Archival and public-domain media, for real people, real places, and real artifacts being directly referenced. (3) Generated visuals, for atmospheres, moods, places that don't need to be specifically real, world-layer detail, and motifs. The visual treatment role picks per beat; sometimes all three sources appear within one production.

**Silent-film-with-voiceover principle.** The production must work as a silent film. Mute the production: if the muted version still feels like something — has rhythm, leads somewhere, feels like a film — it succeeded. If the muted version is a slideshow of vaguely-related images, the visual director failed. Voice sits on top of an already-functioning silent film. This is the bar.

**Diegetic-world coherence.** Each beat's visual sequence stays inside a single coherent world. The wide shot of the parking lot, the close-up of the frozen glove on the asphalt, the medium shot of the man in the car — same parking lot, same night, same light, same color palette. The world is fixed; the camera explores. Scenes don't have to literally connect across beats, but within a beat the diegetic world is locked.

**Never on-the-nose.** Visuals don't translate the literal content of the beat. They counterpoint or parallel. A beat about loneliness does not get a shot of a lonely person. It gets an empty diner booth at 3am. The viewer's mind does the connecting work, and the production is more powerful for it.

**Voice profile.** Self-aware, slightly self-deprecating but not in a bad way, comedic, bold, insightful, breakthrough-oriented. Topics: developer life, business, making-your-own-way, non-traditional career path, vibe coding, voice-first AI, the oral renaissance, McLuhan, gig economy, loneliness-as-self-aware-comedy, the millennial-loner-who-talks-to-AI-all-day. The operator is always trying to get to the breakthrough. Scripts must reflect this; sanitized or generic versions of these topics fail the voice test.



**Zero-friction input.** No matter what feature is added, the input side stays as simple as it is now: record a vlog, upload, walk away. Anything that adds friction at the input is rejected.

**The operator's natural rhythm is the design constraint.** Vlogs do not arrive as a random distribution of one-vlog-one-topic. They arrive in *riffs* — runs of 3 to 20 vlogs in a short timeframe, all circling the same underlying thing from different angles, moods, and moments. When something gets the operator going, the operator does not make one vlog about it. The operator riffs. Each vlog is one pass at the underlying idea; the riff as a whole is the operator using the vlog stream itself as a tuning fork to articulate the idea progressively. The clustering engine, the extraction layer, and the production engine are all designed against this pattern, not against an idealized random-vlog distribution. A future agent who tries to make clustering "smarter" by surfacing hidden cross-vlog connections is solving the wrong problem first; recognizing riffs as they form is the primary job.

**Near-zero-friction at script approval.** This is as load-bearing as zero-friction at input. The script the system produces must be readable by the operator without significant editing. If the operator has to fight the script to make it usable — sanding off LinkedIn-essay register, removing aphoristic content-creator phrasing the operator doesn't actually use, restructuring beats that don't sound like them — the operator stops shipping. The whole loop collapses at the script-approval step the same way it would collapse at the input step. This drives every choice in the ideator design: voice preservation, verbatim ratio, register defense against LLM default essay voice, form-specific prompting. Editing should be light tweaks at most, not rewrites.

---

## 4. Architecture overview

Neolog runs on Cloudflare's stack: Workers, D1, R2, Workflows, Queues, Containers. Frontend is Next.js 16 deployed via `@opennextjs/cloudflare`. AI calls go to Anthropic (Claude Haiku, Sonnet, occasionally Opus per role) and supporting services (Groq Whisper / AssemblyAI for transcription, ElevenLabs for voice cloning, image and video generation models per visual treatment, eventually Flux / Veo / Kling / Wan2.1 VACE for the creative_work pipeline). The system inherits this stack — no new infrastructure choices required.

The architecture has four layers:

**1. The substrate (the graph).** The persistent foundation. Section 5 specifies the graph in detail. Every node and edge in Neolog lives here. All other layers are operations on the graph.

**2. The intelligence layer.** Extraction (section 6), clustering (section 7), cultivation (section 7.4.12), bounce / adjacent insights (section 7.5.1), macro-clusters (section 7.4.12.2). This is how raw graph contributions get organized into useful units the production layer can ship from.

**3. The production layer.** Multi-output pipelines that turn graph material into shipped artifacts. Six production types: video_essay (section 7.4.1–7.4.12), article (7.4.13), x_post (7.4.14), x_thread (7.4.14), clip (7.4.15), creative_work (7.4.16). Each type has its own production engine described in its respective section, plus the shared production-engine specification in section 8.

**4. The operator-facing surfaces.** Views over the graph and the production layer. The Timeline is the heart — a single chronological feed of heterogeneous cards (vlogs, threads, posts, clips, articles, project updates, and system-generated *Surfaced* cards) sorted by recording date. Studio is the deliberate-work mode reached by tapping into a ripening cluster from Timeline. Graph is the direct view of the substrate. Projects is the creative_work surface (Pack Rats, The Mechanical Bride, character studies — different rhythm, own substructure). System and Settings are utility. The full taxonomy is specified in section 4.5.

The motif system (section 10 tracks recurring visual elements across productions. The performance feedback loop (section 11) measures published productions against operator baselines.

Existing Neolog code already implements vlog ingestion, transcription, and parts of the operator-facing surfaces. The current state is not aligned with what this document specifies — most surfaces are broken or implement old architectural assumptions. Reconciliation work is described in section 14.

---

## 4.5 The operator-facing surfaces — full taxonomy

There are five surfaces. Timeline is the heart; the rest are reached from it or sit alongside it. The dock contains five entries, in this order: **Timeline · Studio · Graph · Projects · Settings**. There is no separate Home page — the app opens directly into Timeline.

### 4.5.1 Timeline — the heart

The Timeline is one feed of heterogeneous cards, sorted by **recording date**, not upload date. (Backdating is honored: a vlog recorded a month ago and uploaded today appears at its recording-date position. When uploading material with no recording metadata — documents, images, older content — the system asks for the date at upload time, with manual override always available.)

The Timeline replaces what previous spec versions called "Studio's central view," "Posts page," and "Edit page." Those pages do not exist. Their content lives as *card types* on the Timeline. The operator filters by card type via a pill row at the top of the Timeline: **All · Vlogs · Threads · Posts · Clips · Articles · B-roll · Attachments · Surfaced**. (See 4.5.2 for the full card type taxonomy and 4.5.8.4 for B-roll and Attachment cards.)

Visibility (public / private) is a per-card property, not a separate page. Public cards display an eye icon and a faint topic-color glow; private cards display a lock icon. Both coexist in the same stream. The operator's public-facing share URL points at a filtered view of the Timeline showing only public cards.

The Timeline is grouped by day with sticky day headers (Today · Yesterday · Mon Apr 27 · etc.) so the operator always knows which day they're scrolling within.

### 4.5.2 Card types on the Timeline

Each card has a `type` property and a per-type interior. All cards share a common header strip: type tag (color-coded by topic), status text, recording timestamp, visibility marker.

**Vlog card.** A captured session. Shows a 16:9 thumbnail with play button and duration, vlog title, word count, file size. Tapping enters the vlog detail view (transcript with active-line highlighting, threads extracted, clip candidates).

**Thread card.** An atomic take extracted from a vlog. Shows a headline (the take), the strongest key_quote, strength pips (1–5), and parent-vlog-with-timestamp link. Tapping enters the thread detail view (full transcript span, all linked clusters, related threads).

**Post card.** A short-form text output (x_post or x_thread). Shows the post body, character count or post sequence count, engagement metrics if published (views, reposts, replies). Distinguished from drafts by `published` status and the eye icon. The Post card type covers both "drafted-but-unshipped" and "published" states; status text differentiates.

**Clip card.** A video clip. Shows a video preview frame, in/out timecodes, duration, the take quote. Distinguished from drafts by `published` status. Same type covers candidate-pending-review and shipped-publicly.

**Article card.** A long-form piece (article or video_essay-the-text-component). Shows headline, blurb, progress bar (drafting → in progress → published, with percent), word count, threads woven in, bounce sources count. Same type covers drafting and live; status text differentiates.

**Project update card.** A new element added to a creative_work project (Pack Rats, The Mechanical Bride). Shows the project name as type tag, the element type added (character beat, scene fragment, dialogue, theme), and a short body. Tapping enters that project's detail view, scrolled to the element.

**Surfaced card.** A system-generated observation. The umbrella for everything Neolog's intelligence layer contributes back to the operator. Surfaced cards are visually distinct from operator-contributed cards: dashed border (becomes solid on hover), no thumbnail, an icon prefixing the body text.

### 4.5.3 Surfaced — subtypes

The Surfaced card type has named subtypes that differentiate what the system noticed:

- **Surfaced · Cluster ready.** A cluster has crossed the readiness threshold (composite of thread density, take strength, voice richness, bounce-readiness). Body names the cluster and lists production candidates. Replaces the previous-spec notification pattern.
- **Surfaced · Adjacent insight.** A name for a dynamic, a related framework, a real-world parallel, or a counter-position has been retrieved from bounce. Body explains the insight, optionally with a source. The five flavors of adjacent insight from section 7.5.5 (name, framework, parallel, gap-question, evidence) are represented here.
- **Surfaced · Gap question.** The system has detected that a ripening cluster is missing a structural beat (e.g., the *what good would look like* prompt). Body asks the question. Read-only — the operator does not have to answer.
- **Surfaced · New evidence.** Forensic-mode subtype. A new external source matching a forensic cluster's pattern has come in. Body summarizes the source.
- **Surfaced · Auto-link.** The system has automatically linked a new thread to an existing cluster based on abstracted_topic match (section 7.1.2). Body names both items so the operator can see the linkage and unlink if wrong.

The "Surfaced" label is intentional. It does not reach for startup-jargon ("Insight," "Key Win," "Discovery") and does not pretend to be the operator's. It is honest: the system surfaced this; the operator decides what to do with it.

### 4.5.4 Studio — the deliberate-work mode

Studio is no longer a list-of-clusters page. It is the deliberate-work mode entered by tapping into a Surfaced · Cluster ready card on the Timeline (or by tapping into a thread card and pulling up its parent cluster). The cluster detail view *is* Studio for that cluster.

Studio shows: the cluster's current take, all contributing threads, all adjacent insights gathered so far, the gap question if one exists, the production candidates with ready/pending status, and the materialize action. Tapping materialize opens the production setup screen (outputs, voice profile, visual treatment, drop strategy, schedule).

The dock's Studio entry, when tapped, lands on a list of all currently-ripening and ready clusters — equivalent to a Timeline filter for *Surfaced · Cluster ready* plus *Surfaced · Cluster ripening*, but presented in a focus mode without the rest of the feed. From there the operator drills into a specific cluster.

### 4.5.5 Graph — the territory view

The Graph surface is the direct view of the substrate. Nodes are colored by topic territory; edges show relationships. The operator can filter by node type (clusters, threads, entities, projects). Tapping a node opens that node's detail view.

### 4.5.6 Projects — long-form creative work

Projects is its own surface, separate from Timeline, because the rhythm is different: creative_work projects accumulate elements over years, have substructure (characters, scenes, themes), and produce eventual outputs through generative pipelines that are not the same as the standard production engine.

Project updates surface as cards on the Timeline, but the project's own page is where the operator does deep work on it.

### 4.5.7 Settings and System

Standard utility surfaces. Settings holds operator profile, voice profiles, API keys, integrations, storage, system preferences. System holds pipeline status, prompts in use, maintenance actions. System is reachable from Settings; not in the main dock.

### 4.5.8 Capture — the entry point

Capture is the global "record / upload" affordance. It is reachable from any surface via a floating control above the dock. Capture handles every kind of material the operator can put into Neolog and routes each to its proper place in the graph based on the operator's stated intent at capture time.

**Capture modes.**

- **Record** — in-app recording. Sub-modes: vlog (default; talking-head with audio, becomes content substrate), voice memo (audio only), screen capture (for technical work-in-progress demos), and B-roll (camera-only with no speech routing — see below).
- **Upload** — file ingestion. Accepts video files (MP4, MOV, HEVC), audio files (M4A, WAV, MP3), images (PNG, JPEG, HEIC), documents (PDF, MD, TXT), and screenshots. Upload supports drag-and-drop and multi-file selection.

**Capture-time intent.**

The operator declares intent at capture time when it would otherwise be ambiguous. The default routing is auto-classification (4.5.8.2 below), but the operator can override:

- *"This is a vlog."* — content substrate. Runs through the three extraction passes (analytical / creative-mode / clip-candidate). Becomes a Vlog card on the Timeline; threads, clip candidates, and creative elements are spawned downstream.
- *"This is B-roll."* — visual substrate. Skips content extraction entirely. Vision-tagged at upload (see 9.2). Goes into the B-roll library, available to the visual treatment system. Becomes a B-roll card on the Timeline (a previously unlisted card type — see addendum to 4.5.2 below).
- *"This is reference material."* — attachment substrate. PDFs, articles, screenshots that should be attached to a specific cluster or project for use during materialization. The operator picks the destination cluster or project at capture time. See 7.7.1 for attachment mechanics.
- *"This is for a project."* — creative_work substrate. Goes into a specific project (Pack Rats, Mechanical Bride). Routed to the creative-mode extraction pass; threads-pass is suppressed. The operator picks the project at capture time.
- *"Backdate this."* — applies to uploads of older material. The operator enters the recording date manually. Capture surfaces this prompt automatically when uploaded material lacks recording-date metadata; the operator can also invoke it explicitly to override metadata.

#### 4.5.8.1 The B-roll record mode

The operator yesterday went out and shot dedicated B-roll. The Capture surface needs to support this as a first-class mode, not as an edge case of "uploaded video with no speech."

**B-roll record mode** is selected via a small toggle on the in-app camera surface — the toggle says "B-roll" and changes the recording UI to omit the audio waveform and speech-detection signals. Tapping record captures camera-only footage with ambient audio (kept for atmospheric value but not transcribed). When the operator stops recording, the file is routed directly to the B-roll library, bypasses the analytical / creative / clip-candidate extraction passes, and runs only the vision-tagging pass (9.2: subject, location, mood, motion, time of day, lighting, color palette, weather, season).

The operator can also, at capture time, write a short note about the asset (*"signature shot — the parking lot at 4am"*) which augments the auto-tags and allows the operator to mark the asset as a recurring motif (10).

#### 4.5.8.2 Auto-classification (when intent is not declared)

When the operator uploads without declaring intent (or when in-app recording uses the default vlog mode), Capture auto-classifies:

- **Has speech (transcript yields content above a minimum threshold):** routed as vlog. Runs all three extraction passes.
- **No speech, video file:** routed as B-roll candidate. Operator gets a confirmation prompt (*"Detected no speech. Treat as B-roll?"*) with a fallback to vlog if they say no.
- **Audio file with speech:** routed as voice memo (still produces threads and clip candidates, but no video).
- **Document / image / screenshot:** routed as orphaned attachment. The operator gets a prompt to attach to a cluster, project, or just leave on the Timeline as a standalone card.

Auto-classification is conservative — when in doubt, ask the operator. The operator's intent always wins over the classifier.

#### 4.5.8.3 What happens after capture

After capture, the new item appears as a card on the Timeline at its recording-date position. Extraction runs in the background; the system's progress is reflected by Surfaced cards as threads are extracted, clip candidates are detected, B-roll is vision-tagged, and clusters are auto-linked.

For vlogs specifically, there is a small pipeline-status indicator on the Vlog card itself while extraction is running (*"transcribing..."* → *"extracting threads..."* → *"complete"*). For B-roll, the indicator shows *"vision-tagging..."* → *"complete"*. For attachments, the operator's chosen destination is shown immediately.

#### 4.5.8.4 Addendum to 4.5.2 — additional Timeline card types

The card type list in 4.5.2 covered Vlog, Thread, Post, Clip, Article, Project update, and Surfaced. Two additional card types serve B-roll and attachments:

- **B-roll card.** A B-roll asset in the library. Shows a thumbnail (looped if the asset is short), duration, and primary auto-tags (subject, mood, time of day). Tapping enters the B-roll detail view, which shows full tags, usage history (which productions have used this asset), and the operator's notes. Auto-tag editing is allowed.
- **Attachment card.** A reference material item — PDF, screenshot, article, document. Shows a thumbnail or first-page preview, source filename, and the cluster or project it's attached to (or "Unattached" if the operator hasn't routed it). Tapping opens the asset in the system viewer; the operator can re-route, re-tag, or detach.

Both card types are filterable from the pill row at the top of the Timeline. The full pill row, updated: **All · Vlogs · Threads · Posts · Clips · Articles · B-roll · Attachments · Surfaced**.

---

## 5. The graph — Neolog's substrate

The graph is what Neolog *is*. Everything else in this document is either a way of contributing to the graph (vlog ingestion, extraction), a way of organizing what's in the graph (clustering, cultivation), a way of surfacing graph content to the operator (Timeline, Studio, entity pages), or a way of producing graph-derived artifacts back into the world (the production pipelines).

This section specifies the graph's structure. It is the foundation everything else stands on.

### 5.1 What the graph represents

The graph represents the operator. Their vlogs, their projects, their writing, their relationships, their ideas, their work, their thinking accumulated over time. It is a *unified representation of one person's creative life* maintained as a structured artifact the operator owns.

This is a deliberate alternative to the social-platform timeline (Facebook's *"on this day"* feature, Twitter's archive, Instagram's grid). Those structures are owned by the platforms and shaped to platform incentives. Neolog's graph is owned by the operator and shaped to the operator's actual life — projects that span years, ideas that recur across topics, relationships that develop slowly, work that accumulates.

The graph is *complete*. Every vlog the operator has ever recorded is in it. Every entity the operator has ever mentioned is in it. Every production they have ever shipped is in it. Every project they have started, paused, returned to, abandoned is in it. The graph is not selective — selectivity is what *views over the graph* do (Timeline shows the latest vlogs, Studio shows ripe clusters, etc) — but the graph itself accumulates everything.

The graph is *exportable*. The operator should be able to take it with them at any time as structured data. The operator should never lose it. Backup, export, ownership of the underlying data structure are first-class concerns.

### 5.2 Node types

The graph has several node types, each representing a different kind of thing in the operator's life:

**Source-input nodes (things the operator contributes):**
- **Vlog** — a recorded video. Has transcript, word-level timestamps, audio URL, video URL, recording metadata, ingestion timestamp.
- **External-input** — text the operator pastes in, articles they save, screenshots they capture, links they attach to clusters during cultivation. Currently the only external-input pathway is cluster attachment (section 7.7.1); other input pathways (article ingestion from operator's Substack archive, X archive ingestion, screenplay file ingestion) are reserved namespaces for future implementation.

**Extracted-content nodes (units the system parses out of source inputs):**
- **Thread** — analytical unit extracted from a vlog. Topic, take, key_quotes, questions_raised, transcript_span, register, strength. Section 6.1.
- **Creative-element** — fictional/creative unit extracted from a vlog. Element_type (character_beat, scene_fragment, dialogue, theme, setting, tonal_reference, plot_fragment), content, project_link, register, source_vlog_id, transcript_span. Section 7.4.16.
- **Clip-candidate** — delivery moment extracted from a vlog. Start_time, end_time, headline, why_clippable, vlog_id. Section 7.4.15.

**Accumulation nodes (the system organizes extracted content into these):**
- **Cluster** — accumulation of related threads. Section 7.3.
- **Macro-cluster** — accumulation of related produced clusters; meta-synthesis layer. Section 7.4.12.2.
- **Project** — persistent container for creative-elements. Pack Rats, The Mechanical Bride, character studies. Section 7.4.16.

**Reference nodes (things mentioned across other nodes):**
- **Entity** — people, places, named projects (in the proper-noun sense, e.g. Drophead, CANOPTICON, Mark Carney), tools, concepts, themes, references (books/podcasts/articles cited). Linked to mentions across vlogs, threads, productions.
- **Voice-profile** — a stylistic reference set: a name, reference texts, notes on cadence and register. Crystal Ford voice profile, neutral default, character voice profiles for creative_work. Section 7.4.8.

**Output nodes (the system's productions):**
- **Production** — a shipped or ship-ready artifact. Type (video_essay, article, x_post, x_thread, clip, creative_work_output), state (materialized, recorded, produced, published, archived), source cluster or project, output URLs (file, platform link), publishing record.

### 5.3 Edge types

Edges in the graph are typed and directional. Important edge types:

**Extraction edges:** vlog *contains* threads / creative-elements / clip-candidates.

**Membership edges:** thread *belongs to* cluster. Creative-element *belongs to* project.

**Abstraction edges:** thread *abstracts to* abstracted_topic. Cluster *abstracts to* macro-abstracted_topic.

**Connection edges:** thread *connects to* thread (when their abstracted_topics match — drives clustering). Cluster *connects to* cluster (when they share macro-abstracted_topic — drives macro-cluster formation).

**Synthesis edges:** macro-cluster *synthesizes* clusters.

**Production edges:** cluster *materialized as* production. Project *materialized as* production. Production *cites* production (lineage edges, including parent_cluster follow-up references and synthesis-piece lineage).

**Mention edges:** vlog / thread / cluster / production / creative-element *mentions* entity. Entities link the most heavily-trafficked routes through the graph.

**Semantic edges:** entity *relates to* entity (Mark Carney → Bank of Canada, McLuhan → media theory). Built from explicit operator relationships and from co-mention patterns.

**Cultivation edges:** external-input *attached to* cluster (during cultivation, see 7.7.1). Voice-profile *applied to* production (selected at materialization).

**Lineage edges:** cluster *follows up* cluster (post-produced follow-ups, section 7.4.12.1). Production *companion of* production (coordinated drops where a video essay ships with companion x_posts).

### 5.4 Graph mechanics

The graph evolves through three mechanisms:

**Ingestion.** A new vlog is uploaded → a Vlog node is created → transcription runs → the transcript becomes part of the Vlog node. Other ingestion pathways (external-input attachment, future article/X archive ingestion) follow similar patterns.

**Extraction.** Each ingested vlog runs through three extraction passes — analytical (produces thread nodes), creative-mode (produces creative-element nodes), clip-candidate (produces clip-candidate nodes). Each extracted node is added to the graph with extraction edges to the parent vlog.

**Accumulation.** Asynchronously and continuously, the system runs accumulation passes. Threads with matching abstracted_topics get connection edges. Dense subgraphs of connected threads form clusters. Produced clusters with matching macro-abstracted_topics form macro-cluster candidates. Creative-elements get linked to existing projects when project signals match. Entity mentions accumulate. The graph grows denser over time as more material is ingested and as the system finds more connections within it.

The graph never gets regenerated. It is grown. Every node and edge persists. The intelligence layer's value compounds because the graph compounds — more material means more connections, more clusters, more macro-synthesis opportunities, richer entity context for bounce, more navigable history.

### 5.5 The graph drives every operator-facing surface

Every page the operator sees is a *view over the graph*:

- **Timeline** — the heart. One chronological feed of heterogeneous cards, sorted by recording date. Default view shows all card types (vlogs, threads, posts, clips, articles, project updates, surfaced cards). Operator filters by card type via pills at the top. Visibility (public/private) is a per-card property, not a separate page. Section 4.5.1 specifies this surface in full.
- **Studio** — the deliberate-work mode. Reached by tapping a Surfaced · Cluster ready card on Timeline, or by tapping the Studio dock entry which lists ripening and ready clusters. The cluster detail view *is* Studio for that cluster: contributing threads, adjacent insights, gap question, production candidates, materialize action. Section 4.5.4.
- **Graph view** — direct navigable rendering of the graph. CANOPTICON has it. Neolog needs it. Even at one-operator scale, being able to see the *shape* of one's own thinking is valuable — clusters of clusters, dense entity neighborhoods, projects that interconnect more than the operator realized. Section 4.5.5.
- **Projects** — view of project nodes with their creative-elements (Pack Rats, The Mechanical Bride, character studies). Project updates surface as cards on Timeline; the project's own page is where deep work happens. Section 4.5.6.
- **Settings / System** — utility surfaces. Operator profile, voice profiles, API keys, integrations, storage, pipeline status, prompts in use. Section 4.5.7.
- **Entity pages** — node-centric view, reachable from any entity mention: tap an entity, see every vlog/thread/cluster/production that mentions it, plus its relationships to other entities. Walking the graph by entity is the most powerful navigation pattern for someone trying to find *"what was I thinking about Drophead in March"* or *"every time my dad has come up in the last year."* Reachable from within Timeline cards and from the Graph view; not a top-level dock entry.
- **Topic history** — lineage view: tap a cluster, see its parent cluster (if a follow-up), its sibling clusters (other follow-ups of the same parent), its children (its own follow-ups), and any macro-cluster it contributes to. The evolving public position visible as a structure. Reachable from cluster detail (within Studio); not a top-level dock entry.

The previous-spec surfaces *Posts page*, *Edit page*, and *Live feed* are deprecated. Their content lives on Timeline as Post-type cards, Clip-type cards, and Surfaced cards respectively.

### 5.6 Privacy and ownership

The graph belongs to the operator. Specific properties this implies:

- **Local-first export.** The operator can export the entire graph as structured data (JSON, GraphML, or a format suited to general-purpose graph tools) at any time. Export includes all nodes, edges, transcripts, and content.
- **No platform lock-in.** The graph's value does not depend on Neolog continuing to exist as a hosted service. Exported graphs should be navigable and readable by other tools.
- **Audit trail.** The operator can see what extraction passes ran on which vlogs at what time with which prompt-template version. When extraction prompts evolve, the operator knows which threads were extracted under which prompt.
- **Right to delete.** The operator can delete any node and its associated edges. The system never retains vlogs, transcripts, or extracted content the operator has explicitly deleted.
- **Encrypted at rest.** Vlogs, transcripts, and extracted content are encrypted at rest. Standard hygiene, named here because the graph contains the most personal material the operator generates.

### 5.7 What needs verification against the existing codebase

- The current `entities` and `entity_mentions` tables form a partial graph but are not architected as a unified graph substrate. The Neolog graph specified here generalizes that pattern across all node types.
- Whether the existing schema needs migration to a graph-native database or whether the relational schema with explicit edge tables is sufficient. Most of what's needed can be modeled in the existing Postgres / Supabase setup with proper indexes; a dedicated graph database is not required and would add infrastructure.
- The `transcript_words` table provides word-level timestamps that enable transcript_span computation for threads, creative-elements, and clip-candidates.
- Export tooling does not currently exist. New build.

Reconciliation with current code is described in section 14.

---

## 6. Extraction — the three passes

Extraction is the layer that turns ingested vlogs into structured graph nodes. The current implementation extracts thirty-four fields per vlog in a single Claude call. Twenty-two of those fields are never surfaced anywhere in the UI. The schema accumulated through iteration as different ideas got added (mood tracking, productivity tracking, idea capture, story extraction, entity linking) and was never deliberately collapsed. This section specifies the replacement.

The new extraction model runs **three parallel passes** against each ingested vlog's transcript, plus entity extraction as a fourth pass:

- **Analytical pass (6.1)** — produces thread nodes. The dominant pass for most vlogs. Specified in detail in this section.
- **Creative-mode pass** — produces creative-element nodes when the vlog contains fictional or creative material. Most vlogs return empty from this pass; some return rich material. Architecture and prompt specified within the creative_work pipeline section (7.4.16).
- **Clip-candidate pass** — produces clip-candidate nodes by scanning for delivery moments where the operator nailed a segment cleanly. Different signal entirely from the analytical and creative passes. Architecture and prompt specified within the clip pipeline section (7.4.15).
- **Entity extraction** — runs alongside the three content passes. Entities are extracted from the transcript directly and joined to threads / creative-elements / clip-candidates via timestamp overlap. Specified in 6.1.9.

All three content passes run on every vlog. Most vlogs produce 1–3 threads, 0–2 clip candidates, and 0 creative elements. Vlogs the operator records while developing Pack Rats might produce 0 threads, 0 clip candidates, and several creative elements. The system handles all combinations.

The remainder of this section (6.1.1 through 6.1.10) specifies the analytical pass — thread extraction — in detail because this is the primary pass and the most architecturally consequential. The creative-mode and clip-candidate passes have their detailed specifications inside their respective production-pipeline sections.

### 6.1 The analytical pass — threads



#### 6.1.1 The thread is the atomic unit

A vlog is not the atomic unit. The vlog is a recording session — it could contain one coherent riff, or three different threads, or a check-in plus a riff plus an aside. Treating the vlog as one undifferentiated blob produces extraction that smears multiple threads together into the same `key_quotes`, `strong_opinions`, `ideas` fields.

The atomic unit is the **thread** — a coherent stretch of the operator working out one topic. A vlog produces one thread or many threads. Threads are what cluster. Threads are what ripen. Threads are what materialize into productions.

Most of the operator's vlogs since the project pivot from journaling-toward-creative-work produce one or two threads. Earlier vlogs (more journaling-shaped) produced threads that were thinner and shorter. Both shapes are accommodated — the extraction does not force a thread out of material that isn't thread-shaped, and it does not collapse multiple threads into one.

#### 6.1.2 What extraction produces

For each vlog, two outputs:

**Vlog wrapper:**
- `title` — five to eight words, derived from the strongest thread or composed across threads if the vlog has multiple
- `pii_detected` — safety filter, kept from current implementation
- `language` — detected, kept from current implementation
- `threads[]` — the array of threads in this vlog

**Each thread:**
- `topic` — what this thread is about, in one sentence. Specific. *"The YouTube For You page recommends a static feed regardless of refresh."* Not *"thoughts on YouTube."*
- `take` — what the operator said about it, in their voice. The sharp version of the operator's position. The *take* is the operator's contribution that gives the thread argumentative shape. Without a take, the thread is a description, not material for a video essay.
- `key_quotes[]` — one to three verbatim phrasings inside this thread. The strongest spoken moments. Voice preserved. Profanity preserved. Hesitations preserved when they carry meaning. Each quote has timestamp range from word-level transcript.
- `questions_raised[]` — questions the operator actually asked inside this thread. *"Why does it serve me the same five clips? What would the good version of this app look like?"* These become bounce-side queries when the thread enters cultivation.
- `transcript_span` — `{start_time, end_time}` from word-level timestamps. Lets the system play just this thread back to the operator.
- `register` — one of: `riff` (developing position with energy), `observation` (noticing without arguing), `argument` (structured claim), `story` (narrative recounting), `aside` (brief mention, low investment), `question` (operator asking themselves something). Used by clustering and form selection.
- `strength` — integer 1 to 5. The system's confidence that this is a coherent developed thread versus a passing mention. A thread with strength 1 is barely worth surfacing. A thread with strength 5 is a complete riff with a clear take and quotable phrasings.

That's the extraction. Six fields per thread, three at the vlog level. Eleven fields total versus the current thirty-four.

#### 6.1.3 What is removed

The fields removed in this rewrite, with brief reasoning:

- `key_win` — productivity-tracker artifact. Most vlogs don't have a "win." Forcing one produces hallucinated optimism.
- `summary` and `summary_first_person` — the title plus the threads' takes are sufficient. Separate summaries duplicate information.
- `emotional_arc` — over-determined and rarely accurate. Mood at the per-thread level (if needed) is captured implicitly in register.
- `mood` and `energy_level` — the operator confirmed these are not load-bearing. Removed.
- `reflections` (with sub-fields observation/challenge/encouragement) — life-coach schema, not creative extraction. Removed.
- `ideas[]` and `content_ideas[]` — these are what threads *are*. The threads array replaces both.
- `recurring_themes` — this is cluster-level work being done at the per-vlog level, where it's just hallucination. Removed; clustering produces real recurring themes across the library.
- `projects[]` — entities track projects. No need for a separate projects field at extraction time.
- `action_items`, `decisions`, `blockers`, `goals`, `commitments`, `habits`, `values_expressed`, `lessons_learned` — productivity/journaling tracker fields. Not creative extraction. Removed.
- `life_events` — out of scope for the production pipeline. If the operator wants a life-events log, the vlog transcripts are searchable.
- `people_mentioned`, `references`, `skills_mentioned` — entity extraction handles people and references. Skills_mentioned was never used.
- `stories_told` — was the highest-value field in the old schema, never surfaced. Now subsumed by threads with `register: story`.
- `strong_opinions` — subsumed by threads with `register: argument` or `register: riff`. The take field captures what `strong_opinions` was trying to capture, but at the thread level, properly localized.
- `topics`, `categories` — flat tag lists at the vlog level made navigation noisy. Threads themselves carry topic. If filterable navigation tags are needed later, they can be derived.
- `rewrite` — the cleaned-up rewrite of the transcript. Never surfaced. The transcript itself plus the threads' takes is sufficient.
- `key_quotes` at the vlog level — moved to per-thread. Quotes belong to threads, not to vlogs.

#### 6.1.4 Why this works

The current schema tried to serve four different purposes simultaneously: navigation (Timeline display), journaling (life-log reflection), idea capture (content pipeline), and productivity tracking (action items, goals, decisions). Each purpose pulled the schema in a different direction. The result was thirty-four fields where most vlogs had reasonable data in three to six of them and hallucinated filler in the rest.

The thread-based extraction serves only the production pipeline. Navigation falls out for free because the Timeline becomes thread-shaped (see 6.1.6). Journaling falls out for free because the vlog transcripts themselves are the journal — searchable, replayable, complete. Idea capture is what threads *are*. Productivity tracking is dropped — the operator confirmed it does not serve the system's purpose.

One purpose, one schema. The fields that remain are all load-bearing for clustering, cultivation, and script generation.

#### 6.1.5 The extraction prompt

The extraction is a single Claude call per vlog. Sonnet-class for quality, not Haiku — the cost difference is small relative to the production-pipeline value, and the thread-segmentation step in particular benefits from stronger model judgment.

The prompt's instructions to the model:

- Read the full transcript.
- Identify distinct threads. A thread is a coherent stretch of the operator working out one topic. Threads can be as short as 30 seconds or as long as the entire vlog. A vlog with multiple threads is normal; a vlog with one thread is normal; a vlog with no threads (just a check-in or a quick note) is also normal — return an empty threads array if nothing in the vlog has thread-shape.
- For each thread, extract the six fields. Voice preservation is mandatory in `take` and `key_quotes`. Profanity stays. Hesitations stay when they carry meaning. Filler words (uh, um, like) can be lightly cleaned.
- Do not force fields. If a thread has no questions_raised, return an empty array. If a thread has only one key_quote, return one. If the operator did not state a take and the thread is purely descriptive, mark `take: null` and `register: observation`. The system handles null takes downstream.
- Strength scoring is conservative. A thread is strength 5 only if it has a clear take, two or three strong quotes, and a developed line of thought. Most threads will be strength 2 or 3. Strength 1 threads are surfaced but visually de-emphasized in Studio.

The prompt is versioned. Prompt-template versions are stored against each thread so performance attribution (18 in the production pipeline) can trace back to which prompt version produced which thread.

#### 6.1.6 The Timeline becomes thread-shaped

Under the current schema, Timeline shows one card per vlog. With 150 vlogs the operator has to scroll through 150 cards, each containing a title, mood, a few extracted fields, to find what they're looking for.

Under thread-based extraction, Timeline shows one card per thread. The 150 vlogs produce roughly 250 to 400 threads. Each card shows: the thread's topic, the take (if present), the strongest key_quote, the parent vlog and timestamp, and a play button that jumps to the thread's transcript_span. The operator can still drill into the parent vlog to see the full transcript and all threads from that vlog, but the primary navigation surface is threads, not vlogs.

This solves the surfacing problem the previous spec described as "Studio's central view becomes cluster-per-card." That description was right but came from the wrong direction — the right unit isn't clusters of vlogs, it's clusters of threads, and the Timeline is the thread library that clusters draw from.

#### 6.1.7 Voice preservation rule

The single most important rule in extraction. **No layer that feeds the script generator may sanitize the operator's voice into LinkedIn-post register.**

The current `strong_opinions` field tends to clean up what the operator actually said. Verbatim quote *"It was hell, you know, like having all these ideas and not even having this outlet"* (raw, frustrated, real) gets rephrased as *"Raw content is not garbage to throw away — it's part of your journey and database"* (productivity-advice register, voice gone). When the script generator pulls from sanitized opinions, scripts come out sanitized too. This is fatal.

The rule: `take` and `key_quotes` preserve the operator's actual phrasing. Profanity stays. Hesitations stay when they carry meaning. Conversational texture stays. Filler words can be lightly cleaned (uh, um, you-know stripped) but rephrasing is forbidden. The take field can be a slight tightening of what the operator said, but it cannot be a rewrite. If the operator said something messy and didn't quite land it, the take captures the messy version, not a cleaned-up version.

The script generator receives takes and quotes in their preserved form and writes the script around them, not by paraphrasing them. See 8.2.3 for the script-layer voice preservation rule.

#### 6.1.8 Cross-references and abstraction

Two cross-cutting properties that operate on threads, not on vlogs.

**Abstraction.** Each thread's `topic` field is the literal topic. Internally, the system also stores an `abstracted_topic` — the underlying pattern the topic represents. The YouTube For You page thread and a hypothetical Twitter algorithm thread both abstract to *recommender systems failing despite explicit user signals*. Without abstraction, clustering would be blind to cross-topic resonance. With abstraction, clusters can form across surface-different threads that are arguing the same underlying thing.

Abstraction is the most failure-prone step in extraction because it requires the LLM to do creative pattern-matching. The system stores both the literal and abstracted forms; clustering uses abstracted forms by default but can be configured per-cluster to require literal-form match if the operator wants tighter cluster boundaries.

**Cross-references.** When a new thread is extracted, the system runs a lazy connection pass against recent threads and proposes edges — *"this thread's abstracted_topic matches three prior threads; this might be a developing cluster."* Edges are stored separately from threads, in the connection graph. The clustering engine reads the connection graph to find dense subgraphs; those are the production candidates.

This is the same architecture the previous spec described, but operating on threads instead of on vlog-level claims. The unit changed; the topology is the same.

#### 6.1.9 Entities — joined via timestamp overlap

Entity extraction continues as a separate pass, working from the transcript directly rather than from extraction output. People, projects, tools, places, concepts. Linked to the persistent entity graph. Used for entity-mention navigation (find every thread that mentions Drophead) and for bounce-side context (when a thread enters cultivation, the entities give the bounce concrete things to research).

Entities are not part of the thread atom. They are properties of the transcript, joined to threads via timestamp overlap.

#### 6.1.10 What needs verification against the current codebase

- Current schema state (the thirty-four-field analysis JSONB)
- Current Timeline UI (which fields it reads from)
- Whether prompt-template versioning exists
- Whether word-level timestamps from transcript_words are available to the new extraction prompt for transcript_span computation
- Cost profile of moving from Haiku to Sonnet on extraction

Reconciliation with current code is described in 13.

---

## 7. The clustering engine

This is the central design problem, and it's the largest single gap between what Neolog currently does and what Neolog needs to add. Current Studio is one-vlog-in, one-production-out: each vlog surfaces its own card with its own "Begin →" button. With 150+ vlogs in the library, this surfaces 150+ potential productions, which is functionally useless. The operator wants a small number of high-quality production candidates per week, each pulling material from multiple vlogs.

The clustering engine reads across the library, finds **generative resonance** — moments where ideas across multiple vlogs amplify each other into a stronger argument than any single vlog could carry alone — and surfaces these as production candidates.

### 7.1 The worked example: the founder's-trap cluster

Across the screenshot batch from the extraction test, at least eight vlogs from late February through mid-March circle the same insight at different altitudes of articulation. These vlogs nominally cover different topics — Neolog feature decisions, transcription breakthrough, the editing pipeline, the Gary Vee alignment, vibe coding through voice, the meta-layer realization — but they share an underlying thread.

Surfaced in extraction outputs across these vlogs:

- *"Recognized the pattern of over-pushing product vision when execution discipline is what's needed"* (Mar 13)
- *"Realized Neolog's core value is capturing stream-of-consciousness voice recordings — not adding aesthetic features"*
- *"How to identify feature creep in your own product"*
- *"There's a time in development when you should stop pushing and just build"*
- *"The founder's trap: when to stop iterating and start shipping"*
- *"Why your executed ideas never feel as good as the initial vision"*
- *"Committed to building the accuracy layer before the metaphorical layer in Neolog's entity system"*
- *"Build accuracy before metaphor in system architecture"*
- The Gary Vee alignment — *"Document don't create like Gary Vee is right about that"* connecting pop-business-content philosophy to accuracy-first software architecture: don't pre-articulate, capture what's actually happening, let framing emerge from accuracy.

These are the same insight at different altitudes:

- **Felt** — frustration in some vlogs, the *"It was hell, having all these ideas and not even having this outlet"* energy
- **Recognized** — *"I keep adding features when I should be shipping"*
- **Articulated as principle** — *"The founder's trap: when to stop iterating and start shipping"*
- **Generalized** — *"Build accuracy before metaphor"* / *"Don't pre-articulate; capture and let framing emerge"*
- **Connected** — Gary Vee's *document don't create* recognized as the same move

Each vlog alone is partial. Together they form a real video essay thesis: **Building software in 2026 means constantly fighting the urge to over-design. The discipline isn't in the vision — it's in the restraint. And recognizing this in real time, while building, is the actual skill.** The same insight is articulated differently in different moods, on different days, in different framings — and *that variety is itself part of the essay's texture*. The viewer hears the operator approaching the same realization from multiple angles, which is more compelling than a single clean statement.

This cluster is the demo target (12). The clustering engine has to be capable of finding it.

### 7.1.1 Riffs are the primary cluster pattern

The founder's-trap cluster looks like a "thematic recurrence cluster" in the typology below, but the deeper truth is that **riffs are the dominant input pattern, and the clustering engine's primary job is to recognize riffs as they form, not to find hidden cross-vlog connections.**

A riff is a run of 3 to 20 vlogs over a short timeframe (hours to weeks), all circling the same underlying thing from different angles, moods, and moments. When something gets the operator going — whether it's deliveries-and-the-AI-job-market, vibe-coding-with-voice, feature-creep-while-building, slow-pace-as-strategy — the operator does not make one vlog. The operator riffs. Each vlog is one angle, one mood, one pass at the underlying thing. The riff as a whole is the operator using the vlog stream itself as a tuning fork to articulate the idea progressively.

This means the substrate naturally arrives in clusters. The founder's-trap cluster in 6.1 is a riff in retrospect. The deliveries-and-AI-pace riff is forming now and will likely produce 10-20 vlogs over the coming weeks before it cooks.

The clustering engine's primary job becomes:

1. **Riff detection.** When 3+ recent vlogs share abstracted claims, engine, or move patterns, flag a riff in progress. *"You've made 4 vlogs in the last 6 days that all touch the pace-as-strategy thing. Looks like a riff."* Surface to the operator early, not as a candidate but as awareness — *the riff is forming.*

2. **Riff cooking sensing.** When a riff has stopped accumulating new angles — when the latest vlog is rephrasing rather than adding — the riff is *cooked*. Ready to materialize as a cluster and produce. *"The pace riff has been at 7 vlogs for two days, no new angles. Want to ship it?"*

3. **Cross-riff resonance, secondary.** Sometimes riffs fuse — the pace riff and the vibe-coding-with-voice riff might combine into one essay because they share an underlying claim about cognitive ergonomics. This is real but it's the *secondary* job. Riff-first, cross-riff second.

4. **Stragglers and re-entries.** Sometimes an old vlog from months ago suddenly becomes relevant when a new riff starts. The system should surface old material when a new riff is forming. *"Your current pace riff connects back to a vlog from January about leaving Toronto."*

This architecture is cleaner than abstract clustering because it follows the operator's actual behavior rather than imposing structure on it. A future agent who tries to make the clustering engine "smarter" by surfacing hidden cross-vlog connections instead of recognizing riffs is solving the wrong problem first.

### 7.1.2 Riff-aware thread tagging

Riffs surface as clusters of threads with the same abstracted_topic across multiple vlogs. When a new vlog produces a thread whose abstracted_topic matches an active riff cluster, the thread is automatically tagged with that cluster's id at extraction time. This lets the operator see, in the Timeline, which threads contribute to which active riffs without having to manually link them.

The mechanism is part of the connection graph (6.1.8): a new thread's abstracted_topic is compared against existing clusters' abstracted_topics, and matching threads are auto-linked. The operator can override the auto-linkage in Studio if a thread was incorrectly assigned.

Riff awareness is cheap. Runs against existing thread embeddings plus the new thread. Haiku-class. No web search.

### 7.2 Cluster types

Not all clusters look the same. The clustering engine recognizes several patterns of thread accumulation:

**Thematic recurrence cluster (the riff).** Same underlying topic or take appears across many threads in different forms — multiple vlogs each contributing one or more threads on the same abstracted topic. **This is the dominant cluster pattern.** Strongest cluster type for video essays because the multi-altitude articulation across threads gives the script natural texture.

**Single-thread cluster** — one thread so strong on its own it can carry a production. Rare but real. Usually happens when the operator nails a complete riff with a clear take and several strong quotes inside one vlog. The clustering engine flags single-thread candidates with a high strength threshold (typically 4 or 5) to avoid false positives. The YouTube For You page topic is plausibly this kind of cluster — one rich thread, no need for accumulation.

**Tension cluster** — two threads articulate positions that contradict each other, either across vlogs or even within a single vlog. Strong material for video essays because contradiction is dramatic. The script can sit in the tension rather than resolving it.

**Drift cluster** — the operator's take on a topic has shifted across threads over time. Three months ago a thread had one take on Drophead; today a new thread has a different take. Drift is a goldmine for reflective essays. Requires temporal awareness in clustering — the engine looks at how takes on the same abstracted topic have changed.

**Cross-topic resonance cluster** — threads about apparently unrelated topics share an abstracted form. The vibe-coding-through-voice thread and the gig-economy-math thread and the YouTube algorithm thread all touch on *"what infrastructure does to thinking."* Hardest cluster type for the engine to find — depends on the abstraction step in extraction (6.1.8) — but produces the most interesting essays when it works.

**Investigative cluster (forensic mode candidate).** Threads converge on a specific topic that has named subjects, documented public records, or a contested public account. The bounce returns evidentiary material rather than commentary. Forensic mode (7.4.10) activates at materialization. Drophead curbsider patterns, Canadian political topics for CANOPTICON, are example domains.

### 7.3 Cluster data structure

A cluster is a structured object. The clustering engine produces these; the ideator reads them; the operator browses them in Studio. Clusters are clusters of *threads* (5.1), not of vlogs.

```
cluster:
  id
  lifecycle_state:
    one of forming / surfaced / ripening / hold_for_more /
    ready / produced / archived
    (see 7.4.12 for the cultivation lifecycle)
  ripeness:
    score 0.0 - 1.0 — composite of thread count, take strength,
    abstracted-form coherence, and operator engagement signals
  topic:
    one sentence describing what this cluster is about,
    derived from the threads' topics
  thesis:
    the take the cluster supports (system-proposed,
    operator-editable). Drawn from threads' takes.
  spine:
    ordered list of 3-7 sub-points the thesis builds through
  spine_gaps:
    sub-points where thread coverage is thin or missing —
    used by adjacent-insight feed to suggest gap-questions
    for the operator to vlog into next
  threads:
    array of (thread_id, role) pairs where role indicates
    what this thread does for the cluster —
    "core-take", "supporting-observation",
    "contradicting-self", "voice-rich-anchor",
    "open-question", "context-setting"
  questions_raised:
    consolidated list of questions_raised from threads in
    this cluster. Used as the bounce-side query seed when
    the cluster enters cultivation.
  attachments:
    external material the operator has attached to the cluster —
    screenshots, popular posts, links, pasted text. See 7.7.1.
  adjacent_insights:
    bounce-layer output presented to operator during ripening —
    facts, context, prior thinking, evidence (when forensic mode
    is activated). See 7.5.1.
  type: video_essay
    (the system has one production type — see 7.4.1)
  form:
    one of concept_essay / manifesto_rant / reflection /
    cultural_criticism / probe (see 7.4.7)
  voice_profile:
    optional — the voice profile attached to this cluster.
    Defaults to neutral, meaning the default register from
    7.4.6 applies. See 7.4.8.
  mode:
    one of default / forensic
    (see 7.4.4 for selection logic)
  forensic_shape:
    when mode is forensic, one of forensic_investigation /
    systemic_history / unresolved_inquiry / profile_anatomy
    (see 7.4.11.2). Null when mode is default.
  verbatim_ratio:
    target ratio of operator-verbatim-or-near-verbatim content
    vs ideator-generated connective tissue. Form-dependent default
    (concept_essay: 0.15-0.30; manifesto_rant: 0.55-0.75; etc.)
  length_magnitude:
    one of single / short / mid / extended
    (see 7.4.7 length discussion)
```

The cluster is a much simpler object than in earlier drafts of this spec. Fields removed in this rewrite:

- `cluster.type` (the seven cluster-types: founder's-trap, riff-cluster, etc.) — removed; clusters are clusters, the texture is captured in the thesis and threads.
- `register` (essay / rant / reflection / breakthrough mood field) — removed; subsumed by form.
- `cadence` (slow-confessional / fast-self-deprecating / lecture / etc.) — removed; cadence is what the voice profile produces, not a separate cluster property.
- `tier_suggestion` (Lo-Fi / Mid-Fi / Hi-Fi) — removed; production tier is decided at materialization, not stored on the cluster.
- `motifs` (visual elements that recur) — removed; visual treatment is handled by the production engine, not as a clustering concept.
- `required_bounce` (boolean) — removed; bounce always runs during ripening (6.1.5), the operator decides whether to use what it returns.
- `open_questions` (separate from questions_raised) — removed; merged into questions_raised.
- `tension_or_turn` (the rhetorical pivot) — removed; the take in each thread captures this if it exists, and the script-generation layer surfaces the turn from the threads.
- `source_map` (per-spine-sub-point list of vlog_id/timestamp/role) — replaced with `threads` array. The thread's transcript_span gives the timestamp; the role field indicates what the thread does for the cluster.
- `length_target` (short/mid/long with beat counts) — replaced with `length_magnitude` (single/short/mid/extended) which is form-aware.

Cluster data is the handoff to the ideator. The ideator's job is to produce a script *given* a cluster, not to produce a cluster from raw material. Separating these makes both jobs simpler and lets the operator inspect/edit clusters before scripts get generated.

### 7.4 Production types — the multi-output architecture

Neolog is not a video-essay engine. It is a **multi-output creative engine** where the same underlying intelligence layer (vlogs → threads → clusters, plus creative-work's parallel structure) feeds multiple production pipelines, each producing a different kind of artifact for a different audience and platform.

The operator's source material — vlogs, riffs, takes, character ideas, scene fragments — is not narrowly suited to one output type. A single ripe cluster can become a long video essay, a written article, a sequence of X posts, or several of these in coordination. A single thread can yield a tweet quote and a clip and contribute to a video essay. A creative-work project accumulates separately and produces something else entirely. The system's job is to recognize what each piece of material is good for and surface the right candidates for each pipeline.

This is what CANOPTICON does well that the current Neolog UI does not. CANOPTICON treats one underlying investigation and produces from it a daily brief, single-story shorts, video essays, X threads, and articles — different productions sharing intelligence but shipping as their own artifacts. Neolog should work the same way at its own scale and vibe.

#### 7.4.0 The production type taxonomy

The system supports six production types, organized by friction profile and pipeline shape:

**1. video_essay** — *thought articulated.* Long-form analytical treatment of a topic. Cluster ripens, materializes into a script, operator records, system produces. The most labor-intensive production type. Forensic mode (7.4.10) is an activatable register variant for evidentiary topics. See 7.4.1 and the rest of 7.4 for full specification — this type is specced first because it is the system's primary build target.

**2. article** — *thought written.* Same intelligence layer as video_essay (cluster, threads, bounce, voice profile) but outputs written prose in the operator's article register (Crystal Ford voice profile by default — drawn from the operator's existing Substack corpus). No recording loop. The article is the artifact. Lower friction than video essay. Some clusters want to be articles instead of (or in addition to) video essays. See 7.4.13.

**3. x_post** — *thought stated.* Single-quote or single-take output for X / Twitter. Operates on individual threads' key_quotes (per-thread surfacing) or on cluster materializations as derivative companion posts (per-cluster surfacing). No cultivation lifecycle — fast turnaround, ship or skip. See 7.4.14.

**4. x_thread** — *thought sequenced.* Multi-post threaded sequence on X / Twitter. Operates on a single analytical thread (in the Neolog thread sense) where the operator developed a take across several beats, or on a small cluster. Output is a coordinated multi-tweet sequence with explicit thread markers. See 7.4.14.

**5. clip** — *operator on the internet.* Raw-vlog moments where the delivery worked, surfaced as candidate shorts. A different detection signal entirely from thread extraction (delivery quality, audio, self-containedness — not topic or take). Surfaces as Clip-type cards on the Timeline (4.5.2). The vlog footage itself is the production; no script, no re-recording. See 7.4.15.

**6. creative_work** — *fiction and creative output.* Parallel pipeline for character ideas, scene fragments, themes, and other fictional material the operator develops in vlogs. Different extraction pass (creative-elements rather than threads), different cultivation (projects accumulate over months/years, no automatic ripening), different production engine (screenplay → generative video pipelines like Flux, Veo, Kling, or Wan2.1 VACE rather than recorded VO). Pack Rats, The Mechanical Bride, and similar projects live here. See 7.4.16. Substantively different from the analytical pipeline; specced as fully parallel rather than as a variant.

#### 7.4.0.1 Shared infrastructure, parallel pipelines

The six types share specific infrastructure and diverge on others:

**Shared:**
- Vlog ingestion, transcription, and storage (5.1–5.3)
- Entity graph (6.1.9)
- Operator profile / identity context (8.2.2)
- Voice profile system (7.4.8) — applies wherever prose register matters (video_essay, article, x_post, x_thread)
- Publishing infrastructure (12)

**Diverged:**
- Extraction passes — analytical (threads) for video_essay/article/x_post/x_thread, delivery-quality for clip, creative for creative_work
- Cultivation — clusters for analytical pipelines, projects for creative_work, no cultivation for x_post or clip
- Production engine — script-and-record for video_essay, prose-generation for article, snippet-generation for x_post/x_thread, footage-extraction for clip, screenplay-and-generative-video for creative_work
- Output artifact — video file, markdown article, tweet text, video clip, generated film

This means the spec's middle section (clustering engine, cultivation, voice profile) applies uniformly to the analytical pipelines and is *adapted* for creative_work. The production engine section (7) describes the video_essay pipeline; the article, x_post, x_thread, clip, and creative_work pipelines have their own production-engine descriptions in 7.4.13–7.4.16.

#### 7.4.0.2 The operator picks output(s) at materialization

When a cluster reaches `ready` state, the operator chooses what to ship. Same cluster can ship as multiple types simultaneously:

- *Just video essay.* The cluster materializes into a script, operator records, video produced. Default for clusters where the long-form analytical treatment is the canonical output.
- *Just article.* The cluster materializes into a written piece in the operator's article register. Default for clusters whose subject matter is better suited to text (subtle reframes, dense factual material, topics where the operator's written voice is sharper than spoken).
- *Both video essay and article, coordinated.* The cluster generates both a script and an article, drawn from the same threads and bounce material. The two outputs are sibling artifacts — same intelligence, different prose engineering. Shipping a video essay with an accompanying Substack article is a high-leverage move.
- *Video essay or article + companion x_posts.* When a cluster materializes, the system also surfaces 1–3 x_post candidates derived from the materialization — the strongest quotable lines, the sharpest reframes, single beats that work standalone. These ship as a coordinated drop with the long-form piece.

The operator chooses at materialization. The system proposes defaults based on cluster signals (topic shape, register, length_magnitude, forensic mode activation) but the choice is the operator's.

#### 7.4.0.3 Different friction levels, same Timeline

Production types have different friction profiles, but they all live in the same place: the Timeline. The earlier draft of this spec assumed different friction levels required different *pages* (Studio for deliberate work, Posts for fast outputs, Edit for clips). That assumption was wrong. Different rhythms can coexist in one feed if the cards are typed clearly and the operator can filter.

What different friction profiles *do* require is different card interiors and different action affordances. A Post card has a one-tap "Ship" action because the friction should be low; a video_essay Article card has a "Continue drafting" action that opens the deliberate-work flow because the friction is genuinely higher. Both cards live on the same Timeline, sorted by recording date, filterable.

**Studio** is the deliberate-work *mode*, not a separate top-level page. The operator enters Studio by tapping a Surfaced · Cluster ready card on Timeline, or by tapping the Studio dock entry to land on a focus view of all currently-ripening and ready clusters. Once in Studio, the operator works on one cluster at a time: contributing threads, adjacent insights, gap question, production candidates, materialize action.

**X posts and x_threads** surface as Post-type cards on the Timeline. Drafted candidates show ship actions; published posts show engagement metrics. No separate Posts page.

**Clips** surface as Clip-type cards on the Timeline. Candidates pending review and shipped clips coexist; status text differentiates. No separate Edit page.

**Creative_work projects** are the exception. They have their own surface (Projects, section 4.5.6) because their structure is genuinely different — characters, scenes, themes accumulate as substructure within a project, not as cards on a global Timeline. Project *updates* surface as Project-update cards on Timeline; deep work happens in the project's own page.

**System activity** (new threads added, new clusters forming, bounce results back, x_post candidates ready) appears as Surfaced cards on the Timeline. The previous-spec "Live feed (light)" surface is deprecated; its content lives as Surfaced cards in-stream.

#### 7.4.0.4 Sequencing — what gets built in what order

This spec does not specify build phases. Claude Code reads the full architecture and adapts. But for orientation: the video_essay pipeline is the most architecturally complete in this document, and it shares more infrastructure with article and x_post than any of those share with clip or creative_work. The natural starting point is the video_essay pipeline end-to-end. Article pipeline reuses most of the video_essay infrastructure and is a small additional build. X post and x_thread pipelines are also light additions. Clip pipeline is its own thing but architecturally simple. Creative_work is the most distinct pipeline and is the largest additional build.

The current Neolog codebase has broken implementations of Studio (one-vlog-per-card), Edit (auto-edit-from-topic that doesn't work), and Posts (broken). All three are being redesigned. See 14 for reconciliation specifics.

#### 7.4.1 The video_essay type

**video_essay** — *thought articulated. Argument with structure underneath, conversational register on top, with activatable forensic mode when the topic demands evidentiary discipline.*

The production format the operator is building toward. Reference points for the conversational baseline: Nerdwriter, Folding Ideas, Like Stories of Old, Lindsay Ellis, Contrapoints, Tom Scott, Every Frame a Painting, Defunctland in essay-mode, HBomberguy, Patrick Willems. Reference points for forensic mode (when activated): Errol Morris, Adam Curtis, Frontline, Defunctland in long-form documentary mode, Folding Ideas's Line Goes Up, Serial as audio reference, Bellingcat for evidence-foregrounded register.

Length: short to long (1–20 minutes typical, up to feature-length when forensic mode is activated and the investigation warrants it).

Voice register specifications:
- **Default register** (7.4.6): conversational-with-structure-underneath. Used when the topic is interpretive — the operator is reasoning through an idea, reframing publicly available material, working out a position.
- **Forensic mode** (7.4.10): attribution-front-loaded, past-tense default, evidence-foregrounded. Used when the topic is investigative — the operator is surfacing what wasn't visible, building a case from documented facts, testing an accepted account.

Visual treatment: cinematic short-doc engine with B-roll, archival, generated visuals where needed. When forensic mode is activated: archival-heavy, citation-supported, document/screenshot-rich, on-screen text carries citation density.

Primary platforms: YouTube canonical, Substack embed, X/social as clips.

#### 7.4.2 The operator-as-source principle (recap)

The operator's vlogs are the *origin* of the topic — the thread, the take, the angle the essay will be built around — but the essay is *about the topic*, not about the operator's experience of the topic. See 7.4.6.1 for the full principle. This applies whether forensic mode is activated or not.

#### 7.4.3 Type vs form vs voice profile vs mode — the four layers

Four orthogonal layers, set per cluster:

- **Type** (7.4) — `video_essay`. Currently the only type.
- **Form** (7.4.7) — concept_essay, manifesto_rant, reflection, cultural_criticism, probe. The structural shape within video_essay.
- **Voice profile** (7.4.8) — neutral default, or operator-built profile (Crystal Ford, a specific YouTube channel's transcripts, a custom reference set). Stylistic overlay.
- **Mode** (7.4.10) — `default` (conversational register) or `forensic` (attribution-front-loaded register). Activated by cluster signals; operator can override.

The relationship: a cluster materializes as `video_essay / [form] / [voice profile] / [mode]`. For example: `video_essay / concept_essay / crystal_ford / default`, or `video_essay / cultural_criticism / neutral / forensic`.

The default for any cluster is `video_essay / concept_essay / neutral / default` unless cluster signals push otherwise.

#### 7.4.4 Mode selection — when does forensic mode activate?

The cultivation engine proposes mode based on cluster signals at the point of materialization:

**Activates forensic mode:**

- Cluster has named subjects with documented public records (people, institutions, places, companies).
- Bounce returned evidentiary material — court records, regulatory filings, public documents, archival sources.
- Cluster has temporal anchors — specific dates, durations, named events that need to be sequenced.
- Cluster's questions_raised include investigative questions — *"who actually did this," "what actually happened," "where did this come from."*
- Cluster intends to test, complicate, or correct an accepted public account.
- Cluster will make accusations, attribute responsibility, or name actors.

**Stays in default register:**

- Cluster spine is interpretive — *"what does X mean," "why does X matter," "how should we understand X."*
- Bounce returned commentary, frameworks, prior thinking rather than primary sources.
- Subject is conceptual, textual, aesthetic, or thematic.
- Operator's threads in the cluster are predominantly reasoning-out-loud.
- Cluster does not turn on disputed facts.

**Operator override.** The operator can override mode at materialization. Same cluster in default register produces a fundamentally different script than in forensic mode. The system proposes; the operator decides.

#### 7.4.5 Sequencing

Default register video_essay is the system's first build target — full ideator, voice profile, visual treatment, end-to-end pipeline. Forensic mode is the second build target, building on the same architecture and adding: forensic-specific voice register (7.4.10), attribution-handling in voice (7.4.10.5), the seven-section anatomy structural option (7.4.11), and evidence-foregrounded visual treatment. The architecture must support both modes from day one; only default register needs full operational infrastructure at MVP.

#### 7.4.6 Default voice register for video essay

The video essay's default voice register is the **conversational-with-structure-underneath** register — argument with conversational surface, derived from research into the YouTube essayist corpus (Nerdwriter, Folding Ideas, Like Stories of Old, Lindsay Ellis, Contrapoints, Tom Scott, Every Frame a Painting, Defunctland, HBomberguy, Patrick Willems, Adam Curtis as cautionary case).

The defining slogan: **steel in the walls, conversation in the air** (Zhou via Seinfeld). The argument is structurally sound; the surface sounds like a person reasoning out loud.

**Patterns to encode (preferred):**

- *Register baseline.* "Someone sitting next to you, demonstrating thinking" (Zhou and Ramos's operating definition for *Every Frame a Painting*). Two registers up from text-message chat; two registers down from polished essay prose. Always evaluative — the speaker's stance is constantly visible.
- *Sentence-length distribution.* Roughly 10–15% short (≤10 words), 60–70% medium (11–25 words), 15–25% long (26–50 words), almost never very long (>50 words). Variance enforced sentence-to-sentence — never two same-length sentences in a row except where deliberate.
- *Connective density.* High frequency of inter-sentence connectives doing analytical work: *and, but, so, because, which means, here's the thing, what's interesting is, and yet, but here's where, now*. Sentences should *attach* to the prior sentence's reasoning. The absence of connective tissue is the single most reliable tell of "AI-written" or "literary register" video essay.
- *Argumentative connective preference.* Prefer *because, which means, which is why, the reason being, and that's why* over plain *also, additionally, furthermore*. Argumentative connectives carry analytical pressure; additive connectives just stack.
- *Conversational asides permitted.* *Or rather; to be more precise; well, sort of; I should say; and I mean this in two senses; which, fine.* Use sparingly but include — they're the trace of articulation, the visible mark of a person actually working through the idea.
- *First-person as analytical anchor.* Default to Olson-mode "I want to look at" / "I think what's happening here is" rather than confessional "I felt." Permit confessional disclosures but rate-limit them — they earn argumentative content, they don't substitute for it.
- *Glossed technicality.* When a technical term enters, gloss it in the same sentence. Never assume; never avoid.
- *Hooks on concrete objects.* Default to opening on a specific scene/moment/artifact/observation. Avoid opening on abstract claim, manifesto, or "we live in" stock-taking statement.
- *Thesis surfaces mid-flow.* Bury the thesis sentence inside connective tissue rather than announcing it ("So my argument is…"). The listener should encounter the thesis as the natural endpoint of a sequence of observations, not as a headline.
- *Digressions weld back.* Whenever the script digresses, mark the return ("okay, but back to") and tie the digression's content into the through-line. No orphan digressions.
- *Pacing through sentence-length contrast and connective density.* Slow down by extending sentences and adding analytical connectives at moments of: thesis surfacing, counterargument steelmanning, personal disclosure, close. Speed up at: setup, list-of-examples, chronological run, joke beat.
- *Signposts as conversation, not announcement.* "Now here's where it gets strange" rather than "My main point is." "What almost nobody notices is" rather than "Important point:."
- *Closes don't aphorize.* Default to a quiet close: extension of the last argumentative beat into one more thought, a slight reframing, an open statement (Puschak-style). Do not land on epigram unless the essay has demonstrably earned it.
- *Self-correction permitted.* A speaker mid-thought can revise — *"or, more precisely…"* — and this is part of the register, not a bug.
- *Active voice default.* Passive permitted only when the agent is genuinely unknown or genuinely irrelevant; otherwise active.
- *Contractions default.* *It's, that's, doesn't, I'm, we're.* The uncontracted forms read as institutional.
- *Rhetorical questions answered.* A rhetorical question must either be answered immediately (Wynn-style hypophora) or be set up as a question whose answer will be the whole next section. Never gestural.

**Patterns to forbid:**

- *No aphoristic-probe register at the default level.* No clusters of short, balanced, standalone-declarative sentences each engineered to "land." This register *requires* performed delivery to function. Aphoristic_probe is a *form within video_essay* (7.4.7) that operators can explicitly select; it is not the default register and the ideator must not drift into it.
- *No beat-by-beat punctuation rhythm read aloud.* Em-dashes, semicolons, and parenthetical asides doing structural work invisible to the ear. Punctuation in the script supports natural breath, not engineering effects.
- *No announced theses or section breaks.* "Today I'm going to argue that," "So with that out of the way," "In conclusion," etc.
- *No portentous Curtis-cosplay openings.* "We live in a strange time." "Something has gone wrong." Without Curtis's institutional infrastructure, this register sounds either pretentious or like parody.
- *No uniform sentence length.* Particularly no sequences of three or more medium-length sentences without rhythmic disruption.
- *No connective-free parataxis.* Sequences of "X happened. Y happened. Z happened." without analytical connectors. Reads either as documentary-narration-cosplay or as flat exposition.
- *No literary metaphor density.* One developed metaphor per substantial section is plenty. Over-metaphorized prose narrated reads as overwritten — the ear loses metaphors that the eye would catch.
- *No "however," "furthermore," "moreover," "nevertheless"* as default connectives. Institutional-prose tells. Use *but, also, still, and yet* instead.
- *No abstract-noun pileup.* *"The relationship between authenticity and performance in the digital age"* — phrases of this shape kill voice register. Replace with concrete: *"how people online try to seem real."*
- *No closes on epigram unless earned.* If the body of the essay hasn't done the work, a "and that's why X is really about Y" close lands as posturing.
- *No filler that isn't doing work.* *"Basically, literally, sort of, you know"* are fine in measured doses where they perform a register function; forbidden as space-fillers.
- *No scare quotes as argument.*
- *No confessional drift.* Personal anecdote without argumentative return.
- *No symmetric balanced clauses for their own sake.* *"It is not X but Y. It is not A but B."* Read aloud, sounds like a sermon. Ration to once or twice per script and earn it.
- *No "have you ever wondered" hooks.* Default cliché; signals amateur.
- *No headline-style topic introductions.* *"Today, we're talking about X."* Just start.

**Functional test for default-register prose:**

A spoken-essay paragraph passes the default-register test if (a) it could be read by a normal speaker at normal pace without any sentence forcing an artificial slowdown to "work"; (b) it contains at least one inter-sentence connective doing analytical work; (c) it would not be improved by adding a section header before it (because its connective tissue is doing that work); (d) it could not be reduced to one aphoristic line without losing argumentative content; and (e) reading it aloud, you can hear a person *thinking* rather than a person *reciting*.

**Worked contrast.** A passage that fails the default register (aphoristic-probe register, would only work if the operator explicitly selected probe form with intensified-aphoristic cadence):

> *"The film is a mirror. It reflects what we cannot see. We look, and what looks back is ourselves. This is its power. This is its terror."*

The same observation in default video-essay register:

> *"What's strange about the film — and I think this is actually why it stays with people — is that it works as a mirror. You're watching it, but you're also watching yourself watch it, because all the things it shows you are things you already half-know. Which is why it ends up being more unsettling than scary. Scary you can shake off. This kind of thing you can't."*

The second is roughly four times longer but reads at the same elapsed time because the first version requires a performed pause after each fragment to "land." The second runs on connectives (*and, because, which is why*), uses one mid-sentence self-correction (*"and I think this is actually why"*), distributes weight across the sequence rather than packing it into single lines, and closes on a quietly shifted thought rather than an epigram. Same observation, voice-native rather than page-native.

#### 7.4.6.1 The operator-as-source principle

Critical principle for video essay generation, learned through demo runs that kept producing vlog-shaped scripts when the operator wanted essay-shaped scripts:

**The video essay is about the topic. The operator is the source.**

The operator's vlog material identifies the *thread* — the angle, the take, the reframe, the observation that wants to be developed into an essay. The vlog is *where the topic was first articulated*. The video essay is the topic *treated as a subject in itself* — at one altitude up from the vlog, with the bounce-gathered facts and context the operator's vlog material did not contain.

What this means operationally:

**The operator's experience does not occupy the script.** No "I drive ten hours a day," no "I subscribed to fourteen channels," no "I'm in the car thinking." That material belongs in the vlog, not in the video essay. The vlog already exists. The video essay is the next thing up.

**The operator's voice colors the prose.** Voice profile (7.4.8) shapes cadence and register. The script *sounds* like the operator. But the script is *about* the topic, not about the operator's relationship to the topic.

**The operator's direct quotes appear sparingly as anchor lines.** One or two per essay, where a vlog sentence captures something the ideator could not write better. These anchor lines are placed deliberately — typically at a turn or a landing — and signal "the operator's actual phrasing on this point." They are not the spine of the script. They are punctuation in it.

**The bounce is the engine of the script's content.** For video essay specifically, the bounce gathers *factual material that lets the topic be argued at depth* — the actual mechanics, the documented history, the technical specifications, the relevant reporting that already exists. Not for documentary's evidentiary purpose, but to give the essay's argument something concrete to argue with. A video essay produced from operator material alone, without bounce extension, will read as thin because the operator's vlog only contains the *take* — not the topic-knowledge needed to support the take.

**First-person is permitted but constrained.** Olson-style analytical first-person ("I want to look at," "what I find interesting here is") is fine, used sparingly. Vlogger-style confessional first-person ("I drive a lot," "this happened to me") is not. The first-person is doing analytical work, not biographical work.

**This principle applies to all video_essay forms** — concept_essay, manifesto_rant, reflection, cultural_criticism, probe. None of them put the operator at the center. The operator's voice is the lens; the topic is the subject; the bounce is the depth.

**Diagnostic for operator-as-source compliance.** A script passes the principle if: (a) removing the operator's first-person sentences would leave the essay's argument structurally intact, (b) the script's content is dominantly about the topic rather than dominantly about the operator, and (c) a reader who did not know who the operator was could still follow and engage with the essay. A script fails the principle if: (a) the script depends on the operator's biographical details to be coherent, (b) the script is essentially a vlog transcript with cleanup, or (c) the script reads as the operator's diary on the topic rather than as the topic treated.

The personal-arc-as-video-essay concept was removed from the form taxonomy because it kept producing scripts that violated this principle. If the operator's natural relationship to a cluster is biographical rather than analytical, the cluster probably wants to be a vlog kept in Neolog's Timeline, not a video essay.

#### 7.4.7 Forms within video essay

Within the video_essay video type, the cluster takes a *form* — the underlying shape of the essay. Different forms have different rules for how the operator's source material gets used, how much invention the ideator is allowed, what the beat structure looks like, what the visual treatment defaults are, and what bounce requirement applies.

Form is a first-class cluster property *when the video type is video_essay*. The clustering engine selects form based on cluster signals; the operator can override.

**All video_essay forms are about the topic, not about the operator.** This is the principle from 7.4.6.1. The operator's vlogs identified the topic; the operator's voice colors the prose; the operator's direct quotes may anchor one or two beats. The essay itself is a treatment of the topic.

**Form 1 — concept_essay.** *"Here's a thing happening in the world. Here's what's interesting about it. Here's why it matters."* The default form for video essays. The operator's vlogs identified the topic and contributed the take/angle/framing. The essay then treats *the topic itself* — what it is, how it works, what produces it, what it implies, where it goes. The ideator extends *into the concept itself* via the bounce — what the topic actually is technically, historically, structurally. Invention is required. Without bounce-driven extension the script has nothing to argue with. Beat structure: hook (concrete moment or example from the topic) → topic specification (what is actually happening) → mechanism (what's producing it) → reframe (the operator's take, sourced from vlog quotes where possible) → implication → close. Bounce default: true (concept essays require factual extension). Verbatim ratio default: low (0.15–0.30) — the operator's voice is the *register* and the *take*, but the *content* is the topic. Visual treatment: subject-matter visuals, archival, generated where needed. The operator's life-context appears only if it's directly relevant to the topic, which is rarely.

**Form 2 — manifesto_rant.** *"This is what I see, and it's bullshit, and here's what I think instead."* Forceful. Declarative. Aphoristic in the operator's actual style (probe-like, holistic, McLuhan-influenced) rather than in LLM default aphoristic style. The operator's voice carries the form because the form *is* a position — the topic and the take are inseparable, and the take comes from the operator. Verbatim is heavy because sanitization of operator phrasing kills the form. Profanity preserved. Beat structure: opening claim → unpacking → escalation → unexpected pivot → landing. No "and here's the balanced view" — manifestos do not balance. Bounce default: optional (a manifesto can stand on the operator's voice alone, but bounce-gathered facts can sharpen the claims being made). Verbatim ratio default: high (0.55–0.75) but lower than the previous spec because even in manifesto mode the script extends with topic-specific material. Visual treatment: held shots, single strong images, heavy use of held silence. This is one of the operator's strongest forms.

**Form 3 — reflection.** *"Sitting with something. Not arguing it. Letting it be what it is."* Slow, contemplative, mood-dominant. The operator is observing the topic rather than asserting about it. Material is used to anchor mood and texture, not to build to a conclusion. Beat structure: looser — circling, returning, layering rather than progressing. Bounce default: optional. Verbatim ratio default: medium (0.30–0.50). Visual treatment: long held shots, atmospheric, often near-silent. Closer to short experimental film than to argumentative essay. The topic is still the subject, but the treatment is contemplative rather than analytical.

**Form 4 — cultural_criticism.** *"Here's something happening in the culture. Here's the take on it."* Observer-and-commentator stance. Half topic-treatment and half external-context-grounding. The operator's take is the spine; bounce material provides the cultural context the take is operating against. Beat structure: observation (what's happening in culture) → analysis (what's actually going on) → the take → broader implication. Bounce default: true (cultural criticism requires current-discourse context). Verbatim ratio default: low (0.20–0.35). Visual treatment: cultural-reference visuals, archival, screen-recording of cultural artifacts being commented on.

**Form 5 — probe.** *McLuhan-style.* Aphoristic, layered, holistic. Not building to a thesis but circling one. Returns to phrases and ideas rather than progressing past them. The form itself imitates the medium-as-message principle — the script's structure embodies the claim it is making. Bounce default: optional. Verbatim ratio default: medium (0.30–0.50) — operator phrasing carries cadence; topic-specific material carries content. Visual treatment: associative rather than illustrative; the visuals participate in the probe rather than subordinate to the voiceover. **This is the operator's natural register when writing.** Many of the operator's productions will fold probe-cadence into other forms (e.g., a manifesto_rant with probe cadence, a cultural_criticism with probe cadence) rather than producing a pure-probe essay. If the operator wants an even tighter beat-by-beat aphoristic register — the kind that fails as default video_essay register but works when supported by appropriate visual treatment — the probe form supports that as a stylistic intensification, with voice profile attached at materialization shaping cadence further.

**Length is material-driven, not form-fixed.** Probe form specifically can land at any magnitude:

- *Single-beat probes (10–25 seconds).* One held line that says the whole thing. Rare, but real — sometimes the cluster ripens to one line and that line is enough. These often function as social-media-native formats (a single shot with a single line of voiceover) or as segment material in a compilation.
- *Short probes (3–8 beats, 30–90 seconds).* A tight rhythm that lands quickly. The thesis is single-pointed; no need for accumulation past the point where the recognition lands.
- *Mid probes (8–20 beats, 90 seconds to 4 minutes).* The standard probe shape. Enough beats to build rhythm and intensification; closes when the recognition has compounded enough.
- *Extended probes (20–40 beats, 4–10 minutes).* When the cluster has multiple sub-claims that each need their own probe-rhythm and the close is structurally complex.

The system should not pad short probes to mid-length, and should not truncate extended probes to fit a length target. Length follows the cluster's ripeness, the form's rhythm, and the operator's intent. Cluster ripeness signals can include a `length_magnitude` field (`single`, `short`, `mid`, `extended`) that the operator can set or override.

**Form selection signals.** The clustering engine selects form based on:
- *Material density.* Many strong claims about a topic → manifesto_rant or concept_essay. Few claims but rich texture → reflection or probe.
- *Operator stance.* Vlogs analyzing a topic → concept_essay. Vlogs ranting about a topic → manifesto_rant. Vlogs commenting on cultural phenomena → cultural_criticism.
- *Energy register.* Defiant / forceful vlogs → manifesto_rant. Quiet / processing vlogs → reflection. Analytical vlogs → concept_essay.
- *Operator override.* The operator can specify form when materializing a cluster, overriding the engine's choice.

**Form is editable in Studio.** When the operator inspects a cluster pre-script, they can change the form and re-materialize. Same source material, different production. This is one of the most useful operator interventions — same vlogs as a manifesto_rant produces a fundamentally different essay than as a concept_essay.

### 7.4.8 Voice profiles — selectable cadence and register

Voice profile is the **third layer** in the materialization stack: video type (7.4) sets the kind of video, form (7.4.7, where applicable) sets the structural shape within type, and voice profile sets the cadence and register on top of those.

**Voice profile is optional and orthogonal.** It does not change the video type's structural rules or the form's beat structure. It shapes *how the prose sounds* — cadence, sentence rhythm, register lean, vocabulary preferences, characteristic moves — within whatever structure the type and form already specify.

A voice profile is a reference set the ideator pulls cadence and rhythm patterns from when generating a script. The same form in the same video type can be produced in different voice profiles, and the same voice profile can be applied across multiple forms or even multiple video types.

**The default voice profile is neutral.** When no voice profile is attached, the ideator generates in the video type's default voice register (for video_essay, this is the conversational-with-structure-underneath register specified in 7.4.6). This is the right default for many productions — the type's default register is already designed to work well, and the operator only needs to attach a voice profile when they want stylistic overlay.

**Operator-defined voice profiles** can be created by the operator from reference texts they trust. Reference texts can be:

- The operator's own writing (essays, blog posts, articles in a register they want to match)
- Transcripts from a YouTube channel or podcast whose register the operator wants to deploy
- Pasted prose samples from any source
- A combination of any of the above

**A voice profile contains:**

- The reference texts themselves
- Optional operator notes about when this voice applies (*"good for argumentative pieces, not for personal-arc"*)
- Optional flags about register intensity (*"don't lean too hard on engineering vocabulary, it gets dense"*)
- Optional tags so the operator can organize voices (aphoristic-leaning, narrative-leaning, rant-leaning, etc.)
- Optional video-type compatibility hints (*"works for video_essay but not for short or manifesto"*)

**The ideator uses voice profiles as cadence reference, not as content source.** When a voice profile is attached to a script generation, the ideator reads the reference texts to understand the operator's preferred sentence rhythm, paragraph length, characteristic moves, vocabulary register, and cadence variation. The ideator does not pull *content* from the voice profile — content comes from the cluster (vlog transcripts, attachments, bounce material). The voice profile shapes how that content gets phrased.

**Selection at materialization time.** When the operator materializes a cluster into a script, they pick which voice profile to use. Default is neutral (= the video type's default register applies as-is). Operator picks from their library of voice profiles, or skips and uses neutral.

**Voice profiles can be downloaded or shared.** Operators can build voice profiles from public reference texts (a favorite essayist, a video-essay channel they admire) and share them with other operators using Neolog. The system should support importing voice profiles as a unit (reference texts + notes + tags + compatibility hints).

**Defaulting by video type and form.** Clusters can default to a particular voice profile based on video type or form when the operator has set a default. (E.g., the operator's manifesto productions might default to one voice profile, reflection forms within video_essay to another.) The operator always has final selection.

**What voice profiles do NOT do.** Voice profiles do not bypass voice preservation rules from the source vlogs (8.2.3). The operator's verbatim and connective-cadence anchors remain — the voice profile shapes the *non-verbatim* connective tissue and the overall register, not the verbatim itself. A voice profile cannot override the cluster's source material; it can only shape how the ideator-generated material around that source reads.

**What voice profiles do NOT replace.** Voice profiles are stylistic reference, not structural rules. The video type taxonomy and form taxonomy still govern structural decisions. A reframe-heavy voice profile applied to a concept_essay cluster does not turn the concept_essay into a sectioned reframe-essay — it produces a concept_essay whose connective tissue *leans toward* reframe-style cadence where appropriate.

**Voice profiles do not override the video type's default register baseline.** They modulate it. For video_essay, the conversational-with-structure-underneath register specified in 7.4.6 is the *floor* — voice profiles can shape cadence and vocabulary on top of that floor but cannot push the prose into aphoristic-probe register or other forbidden patterns. For documentary, the attribution-front-loaded forensic register specified in 7.4.10 is the *floor* — voice profiles can shape narrator personality on top but cannot push the prose into essay register (lose attribution discipline) or sensational register. The functional tests in 7.4.6 (for video_essay) and 7.4.10 (for documentary) are the gates voice profiles cannot evade.

**No hardcoded operator voice in the spec.** The spec does not specify which voice profiles the operator should build or which are their canonical voice. Operators may have multiple voice profiles for different contexts. The default for any production is neutral unless the operator selects otherwise.

**Anti-pattern flag.** Voice profiles should not be used to evade voice preservation. If the operator's verbatim from vlogs reads in one register and the voice profile pushes the connective tissue toward a very different register, the result will sound disjointed. The coherence check (8.2.5) should flag register-mismatch between verbatim anchors and ideator-generated connective tissue when a voice profile creates that tension.

#### 7.4.10 Forensic mode — voice register for evidentiary topics

The forensic mode is the **attribution-front-loaded register** activated when the cluster's bounce-gathered material is evidentiary in nature. Calm under stakes, evidence-foregrounded, contradiction-tolerant, uncertainty-naming, consequence-closing. Derived from research into the investigative-documentary corpus (Errol Morris, Adam Curtis, Frontline, Defunctland in long-form documentary mode, Folding Ideas's Line Goes Up, Serial / S-Town as audio reference, Bellingcat for evidence-foregrounded register).

In the previous spec this register was specified as a separate video type (`documentary`). It is now a mode within video_essay because the distinction between essay register and forensic register emerges at the bounce stage, not at the cluster-promotion stage. The operator does not decide *"this is a documentary"* before knowing what evidence the bounce will surface; the bounce surfaces evidence (or doesn't), and forensic mode activates accordingly.

The defining premise is that forensic mode is *evidence walked through*, not *argument articulated*. The default register narrator is reasoning out loud about an idea in the present. The forensic-mode narrator is showing the listener what happened and what was actually going on. Both modes are still video_essay — both still have the operator's take as the spine, both still treat the topic rather than the operator's experience of the topic — but forensic mode applies attribution discipline that default register does not require.

##### 7.4.10.1 Tense

Default is **past tense with present-tense stake-marking**. Events under investigation are narrated in simple past ("In March 2017, the company filed for bankruptcy"). The narrator's framing of why this matters is in present ("This bankruptcy is the door we're going to walk through"). Within scenes, *historical present* can be used to dramatize a specific moment but should be used sparingly and signaled clearly.

This is different from broadcast TV news, which uses present tense as default ("A community is mourning tonight…") for immediacy. Documentary register prefers past-tense factual narration *because past tense carries the implicit claim of having-been-investigated*. The tense is part of the credibility apparatus. It is also different from video essay, which is overwhelmingly present-tense first-person because the video essay is a present-tense act of thinking.

##### 7.4.10.2 Person

Default is **third person, with first-person plural permitted for the investigative apparatus**. "We obtained," "we found," "we asked" — the "we" is the investigation, not a confessional voice. First-person singular is permitted but should be marked: used when the narrator is genuinely a participant in the investigation (Defunctland on-screen, Koenig in Serial) or when the narrator is openly interpreting (Herzog mode). The system default is third-person/first-plural; first-person singular is an opt-in mode.

Video essay, by contrast, is overwhelmingly first-person singular and present.

##### 7.4.10.3 Attribution before claim

This is the most important micro-craft point. In print, citations are footnotes. In voice, attribution has to be sentence-shaped, and *attribution comes before the claim, not after*. The listener cannot re-read; they need to know who is speaking before they hear the claim.

Preferred attribution constructions (encode as natural-sounding sentence templates):

- "According to [source], …"
- "[Source] told us that…"
- "Court records show…"
- "In a [year] interview with [outlet], [person] said…"
- "Internal emails — later released in discovery — describe…"
- "What [person] would later admit was that…"
- "Two former employees, who asked not to be named, described…"
- "By [person]'s own account…"
- "There is no public record of…"

Forbidden constructions: trailing-attribution patterns from print ("…, according to the inspector general's report"). The print rhythm is dead in voice.

##### 7.4.10.4 Handling uncertainty

Where a video essay can argue past uncertainty ("I think this is basically what's happening"), documentary qualifies. Encode a small register of uncertainty-marking phrases:

- "What the records confirm is X. What they don't tell us is Y."
- "We cannot say with certainty that…, but…"
- "The available evidence is consistent with… but does not prove…"
- "[Person] denies this. The documents tell a different story."
- "On this point, the accounts diverge."

##### 7.4.10.5 Sentence rhythm and connective tissue

Documentary register's characteristic rhythm differs from video essay:

- **Opens sections with a declarative orienting sentence.** ("There were two phone calls that night.")
- **Builds through short factual sentences,** often with concrete dates, names, places.
- **Punctuates with one longer interpretive sentence per beat** that tells the listener what the facts add up to.
- **Closes sections with a turn sentence** — a one-line statement of where the leverage now is. ("And that was the lie that, six months later, would unravel everything.")
- **Front-loads attribution clauses.** "What the inspector general would later find was…"
- **Uses temporal anchors** — specific dates, durations, ages, times of day — as connective tissue. "Eleven days later." "By the spring of 2019." "Three hours before the call."

Three connective patterns are characteristic and should be encoded as available transitions:

- **Scene → reflection.** A specific moment is rendered, then the narrator steps back to say what it meant.
- **Evidence → implication.** A piece of evidence is named, then its consequence is drawn out.
- **Then → now.** The historical moment is set against the present.

##### 7.4.10.6 Narrator's relationship to subject

Four stances are available, and the system should make this an explicit parameter at the cluster level:

- **Analytical** (Frontline default; Morris) — neither sympathetic nor hostile to subjects; interested in what happened.
- **Sympathetic** (Herzog on Treadwell; Defunctland on Lasarenko) — the narrator is openly moved by or invested in a subject without abandoning the investigation.
- **Skeptical** (Olson on NFT promoters; Curtis on power) — the narrator is openly unconvinced by the subject's account and is testing it.
- **Advocate** (Koenig leaning toward Adnan Syed; some Bellingcat work on war crimes) — the narrator is making a case. Most ethically demanding because it must *still* engage seriously with counter-evidence.

The system default for the operator's "forensic exploration" use case is **analytical with skeptical undertones**: presume nothing, test everything, name what cannot be confirmed.

##### 7.4.10.7 Patterns to forbid

The documentary register actively forbids:

- **First-person singular present-tense argumentation as default voice.** That is the video essay register.
- **"Could it be that…" / "Some experts believe…" / unattributed speculation.**
- **Lists of more than three consecutive enumerated facts in spoken voice.**
- **Mystery-box stalling that does not pay off.**
- **Trial-by-narration.** Selected evidence presented in support of a thesis without acknowledging the selection.
- **Wikipedia-summary structure.** Recitation of well-known facts in chronological order without an investigative move.
- **Strict chronology at the piece level.** Anatomy structure, not chronology (see 7.4.11).
- **Sensationalist tone-escalation.** The voice does not match the gravity of the content; the voice stays calm and lets the content carry the gravity.
- **Fabricated process.** Theatrical "live investigation" framing when the work is actually finished.
- **Accusation without right-of-reply disclosure.** If a person is being critically characterized, the script must state whether they were asked to respond.
- **Conflating fact, allegation, and inference in single sentences.** "Smith was charged with" is fact; "Smith allegedly" is allegation; "the pattern suggests Smith may have" is inference. Match the language to the epistemic level.
- **Reusing the same fact across multiple segments without new evidence attached.**
- **Rhetorical close.** The documentary close is consequential, not flourishing.
- **"Voice of God" omniscience.** No unattributed authoritative pronouncements about contested matters; the narrator is named, situated, and accountable.

##### 7.4.10.8 The functional test

A piece is in documentary register, not essay register, when it passes three diagnostics:

1. **The attribution test.** Strip the script of attribution clauses ("according to," "we obtained," "records show," named source clauses). If the script still reads coherently as a piece of writing, it is essay register. Documentary register *depends* on its attribution apparatus and falls apart without it.
2. **The tense test.** Highlight every claim about events under investigation. If they are predominantly in past tense, with present-tense reserved for stakes-framing and the narrator's interpretive moves, it is documentary register. If they are predominantly in present-tense first-person, it is essay register.
3. **The "what was actually going on" test.** Can you state, in one sentence, what previously-unseen thing this piece surfaces? If yes — a specific finding, a documented contradiction, a chain of events the public account misses — it is documentary. If the answer is "an interesting way of thinking about X," it is essay.

A piece that passes one or two is a hybrid and should be flagged for the operator to choose which type to commit to before the script is finalized.

#### 7.4.11 Forensic mode structural skeleton — the seven-section anatomy

When forensic mode is activated, the script structure follows a seven-section anatomy that differs from the default-register essay structure. This is an alternative scaffold within video_essay, not a separate production type.Documentary structure differs from video essay structure in five concrete ways: the cold open is concrete not conceptual, stakes are stated explicitly then earned, subjects are named and characterized, evidence is layered and weighted (not enumerated), and the close is consequential not concluding. The default skeleton implements these properties.

##### 7.4.11.1 The seven sections

1. **Cold open (≈5–10% of runtime).** A concrete artifact, scene, or moment that *contains* the question. End the cold open by stating the question explicitly — "And this is what we wanted to find out." or equivalent.
2. **Stakes & frame (≈5%).** Why this matters. What the accepted version of this story is, and where there is reason to think the accepted version is wrong or incomplete. This is the contract with the listener.
3. **Character & ground (≈10–15%).** The people, place, institution, or system involved. Background only as much as the investigation will require — no more.
4. **Evidence / anatomy (≈50–60%).** The body. Build in 3–7 named segments, each functioning like an affidavit: opens on a sub-question, presents primary evidence, surfaces what that evidence implies, ends on a turn (a confirmation that strengthens the case, or a complication that bends the next segment). At least one segment should explicitly stage *the moment our reading changed* — the discovered contradiction, the document that reframed everything, the interview that broke the official story. This is the forensic equivalent of the Act II midpoint reversal.
5. **Competing accounts (≈5–10%).** Explicitly handle the strongest version of the opposing or complicating reading. Do not bury it. The narrator names what the other view holds and why a reasonable person could hold it, then states what the evidence does or does not support against that view.
6. **What is still unknown (≈5%).** Forensic discipline requires this. The narrator names the questions the investigation could not answer and why — what records are sealed, what witnesses are dead, what has not been independently verified.
7. **Synthesis / consequence (≈10%).** The close. Not "and so we have proven X" but "and here is what this means about [the larger system / the people involved / what should now be done / what we should now understand differently]." If the investigation is unresolved, the close is a precise statement of the unresolved state and what would resolve it.

This skeleton is modular: a 12-minute video_essay in forensic mode uses all seven sections compressed; a 90-minute long-form doubles the body and breaks the evidence section into named acts.

##### 7.4.11.2 Forensic-mode shapes

When forensic mode is activated, the script can take one of four shapes within the seven-section anatomy. These are not separate forms (forms are specified in 7.4.7 — concept_essay, manifesto_rant, etc.); these are *investigative postures* that determine the angle of the seven-section structure.

**Shape 1 — forensic_investigation.** *"What actually happened, and why?"* The default forensic shape. A specific event, decision, or chain of events under investigation. Full seven-section skeleton applies. Reference: Errol Morris on a single case, Defunctland's Disney Channel's Theme, Frontline standard. Verbatim ratio default: medium (0.40–0.55) — operator material is the voice, but most of the *content* is evidentiary material from the bounce. Visual treatment: archival, document, screenshot-rich.

**Shape 2 — systemic_history.** *"Here is how this became this — the chain of decisions that produced the present."* Curtis-style historical-investigative. Traces the genealogy of an idea, system, or condition over decades. Reference: HyperNormalisation, Bitter Lake, parts of Folding Ideas's Line Goes Up. Verbatim ratio default: lower (0.25–0.40) — most material is archival. Visual treatment: archival montage, named-protagonist sequences, period-appropriate visual treatment.

**Shape 3 — unresolved_inquiry.** *"Here is what we do and don't know, and why that matters."* The investigation has not finished, may not finish, may not be finishable. Close is a precise statement of unresolved state, not a synthesis. Reference: Serial Season 1, LemmiNo on unsolved cases. Verbatim ratio default: medium (0.35–0.50). Visual treatment: timelines, evidence layouts, what-is-known vs what-is-not-known visual structure.

**Shape 4 — profile_anatomy.** *"Who is this person/institution/place actually, beneath the public account?"* A specific subject at the center, investigated through their record, their relationships, their decisions. Reference: 30 for 30, parts of Defunctland's Walt Disney work, Wormwood. Verbatim ratio default: medium (0.35–0.50). Visual treatment: archival biographical material, key documents, the named subject's own image and voice where available.

The operator can override the engine's shape selection at materialization. Same cluster as different forensic shapes produces different output.

#### 7.4.12 The cultivation lifecycle

**Productions are not generated, they are cultivated.** This is one of the most important architectural decisions in the system and it was learned the hard way through failed paper-demo runs. Two attempts at full-script generation failed on rich-but-thin clusters (8 vlogs of riff material, lots of strong moments but no real depth on any particular angle). The ideator was reaching to fill gaps the operator had not yet filled, and the reaching produced LLM-default essay register no matter how carefully voice preservation was specified.

The fix is not better prompting at script-generation time. The fix is **not generating scripts from thin clusters in the first place.** A cluster ripens over time as the operator talks more into the gaps; only when the cluster is dense enough does it enter `ready` state and become eligible for script generation.

This means clusters have a lifecycle:

- **forming** — cross-references and connection edges between threads are accumulating but no candidate is detected yet. Internal state, not surfaced to operator.
- **surfaced** — system has detected a candidate worth showing. Cluster appears in Studio's candidates view with a one-line description, ripeness score, and adjacent insights (7.5.1). Operator has not yet engaged. Cluster will continue to accumulate threads that match its abstraction signature, and may be promoted or demoted as more material arrives.
- **ripening** — operator has acknowledged the cluster (promoted it from surfaced, or made vlogs that significantly extend it after seeing the surfaced summary). System is now actively shaping the cluster around operator engagement: bounce queries fire from the cluster's questions_raised (6.1.2), gap-tracking on spine sub-points, adjacent-insight feed updates as the operator adds threads.
- **hold_for_more** — operator has explicitly told the system that the cluster needs more material before materializing. *"I have three threads on this but the take isn't sharp enough yet, hold this until I record more."* The cluster waits. Adjacent-insight feed continues to surface. New threads on the same abstracted topic feed in automatically. The operator can move it back to ripening at any time.
- **ready** — ripeness threshold crossed. Thread density, take strength, voice richness, and (when forensic mode is activated) evidentiary material from bounce all meet thresholds. Cluster is eligible for script generation. Operator is notified.
- **produced** — script generated, recorded, produced. Cluster is locked.
- **archived** — cluster never ripened (operator ignored, rejected, or it sat in hold_for_more without new threads for a long period) or has been superseded by a better cluster on the same material.

**The hold_for_more state is operator-controlled, not engine-controlled.** A ripening cluster crosses to ready when the engine's ripeness score crosses threshold; the operator can override by moving the cluster to hold_for_more even when the engine would have promoted it to ready. This is the mechanism for the operator's stated workflow — *"let's say I have three vlogs about the YouTube algorithm, one might've been enough, but maybe another topic I've done three vlogs and the output was not great so I should be able to say keep going on that."* hold_for_more is that "keep going" signal made structural.

**Ripeness scoring** is a composite operating on threads:

- *Thread density.* How many threads in the cluster, weighted by their strength scores.
- *Take strength.* How sharp and developed the takes across threads are. A cluster of three observation-register threads with no clear take ripens slower than a cluster of one strong-take riff thread.
- *Spine coverage.* How much of the proposed spine has at least one thread covering it.
- *Spine gaps.* Inverse of how many spine sub-points have no thread coverage. Used to generate gap-questions (7.5.1) for the operator's next vlogs.
- *Voice richness.* How many threads have key_quotes flagged as voice-rich phrasings the script can anchor on.
- *Operator engagement signal.* Threads the operator recorded *after* the cluster was surfaced count more — they show the operator is actively riffing into the cluster.
- *Form fit.* Does the thread material match the form's verbatim-ratio target? A manifesto_rant cluster needs higher operator-voice density than a concept_essay.
- *Forensic readiness.* When forensic mode is the candidate mode, ripeness includes whether the bounce has returned sufficient evidentiary material — named subjects, primary sources, documented chains of events.
- *Length magnitude fit.* Clusters ripen at different magnitudes — `single`, `short`, `mid`, or `extended`. Magnitude is operator-overridable.

Different forms require different ripeness thresholds. Manifesto-rant ripens at high voice density. Concept_essay ripens with broader topic coverage and bounce-extension readiness. Probe ripens when there are enough resonant thread fragments to circle. Forensic-mode video_essays ripen only when bounce has returned evidentiary material.

**The key design principle: do not skip ripening.** A cluster surfaced today and immediately materialized into a script tomorrow will fail because the operator has not yet had time to feed the system the connective insight that turns thread aggregation into argument. The system's job during ripening is to keep the cluster visible to the operator and surface gap-questions and adjacent insights so the operator's next vlogs sharpen the cluster naturally.

#### 7.4.12.1 Post-production lifecycle — script staleness and follow-up clusters

The lifecycle states above cover from cluster formation through `produced`. Two cases need additional handling: what happens between *script generated* and *recorded*, and what happens *after a cluster is produced* when the operator keeps vlogging on the same topic.

**Materialized state — script generated, not yet recorded.** Between `ready` and `produced`, the cluster is `materialized` — script exists, recording has not happened yet. New threads recorded on the same abstracted_topic during this window do not silently overwrite the script. Instead, the system flags the cluster: *"2 new threads since this script was generated. Regenerate script with new material, or proceed with original?"* The operator decides at record-time. The flag is a small badge on the materialized cluster card; not noisy.

The operator can:
- *Proceed with original script.* The new threads sit unused. They may form a follow-up cluster later (see below).
- *Regenerate.* The system regenerates the script with the new threads incorporated, and the previous script version is archived for reference.
- *Hold longer.* Move the cluster back to ripening or hold_for_more if the new threads suggest the topic isn't done baking.

**Follow-up clusters after produced.** Once a cluster is `produced` (recorded, edited, ready to publish), it is locked. New threads on the same abstracted_topic do not try to add to it. Instead, they form a **follow-up cluster** with a `parent_cluster` reference back to the original. The follow-up cluster has its own lifecycle (forming → surfaced → ripening → ready → produced) and accumulates independently. Most follow-up clusters never ripen and quietly archive. Some accumulate enough new material to materialize as v2 of the topic.

This handles the case the operator described: *"we lock in a script and produce it about the YouTube algorithm, then I'm talking about YouTube algorithm again, but it's a little bit different — like a different part of the YouTube algorithm — how does it differentiate?"* The system handles this automatically. New threads with matching abstracted_topic feed a follow-up cluster. If the new threads are substantively a different argument that just shares an abstract shape with the produced cluster, the operator can split the follow-up into its own independent cluster in one tap. The system's wrong-guess is cheap and fixable.

The follow-up architecture extends to v3, v4, and beyond. A topic can keep generating productions over time as the operator's thinking evolves. The system tracks the lineage and surfaces it as a **topic history** — *"this is the third video essay you've made on YouTube's recommender. Here are the previous two."* This is a real artifact of the operator's evolving public position, surfaced naturally from the architecture rather than as a separate feature.

#### 7.4.12.2 Macro-clusters — meta-synthesis across produced work

Beyond clusters of threads, the system supports clusters of *clusters* — **macro-clusters** that surface synthesis opportunities across the operator's body of produced work. This is the meta-synthesis layer the operator surfaced in conversation: *"what if there's a better video essay analyzing everything we've discussed across five produced essays?"*

A macro-cluster is a cluster whose constituent units are produced clusters (or in some cases, mature ripening clusters), not threads. It has its own lifecycle, similar to but slower than the regular cluster lifecycle:

- **forming** — multiple produced clusters share an abstracted shape one altitude up from their individual abstracted_topics. System detects but doesn't yet surface.
- **surfaced** — system has detected enough convergence to propose: *"You've made five essays on platform recommenders. The thesis they all imply but none of them argue is X. Want to materialize this as a synthesis piece?"*
- **ripening** — operator has acknowledged. Bounce runs against the macro-cluster's proposed thesis (typically broader and more theoretical than per-cluster bounce). Adjacent insights surface.
- **ready** — macro-cluster has a clear synthesis thesis and at least 3-4 produced clusters as constituent evidence.
- **produced** — synthesis piece materialized, recorded, produced.
- **archived** — operator dismissed, or macro-cluster never reached enough convergence.

Macro-clusters surface several kinds of synthesis opportunity:

- **The synthesis essay.** Multiple produced essays on related topics together imply a thesis no single one stated. The synthesis essay names the thesis and uses the constituent essays as worked examples.
- **The retroactive umbrella.** Multiple produced essays rest on a frame the operator keeps almost-making but never quite saying (often McLuhan-shaped or operator-signature reframe-couplet shape). The umbrella essay states the frame explicitly and shows how it ran underneath the prior work.
- **The missing essay.** Operator has covered most of a topic area but has a structural gap. System surfaces: *"you've covered the user-side of recommender systems thoroughly, but you've never written about the creator-side, which shows up as background in vlog material."* The missing essay fills the gap.
- **The cross-domain synthesis.** Most interesting case. Operator's essays on apparently-unrelated domains share an abstract shape — *"systems where the stated metric and actual metric diverge, and the user is the inventory."* The cross-domain synthesis names the pattern across domains, with each domain as a worked example. Highest-leverage form because it produces an artifact a viewer cannot get from any single essay.

**Macro-cluster cost profile.** Detection runs weekly off-hours, or when triggered by the operator manually flagging *"these three essays go together, what's the synthesis?"*, or when the system detects a strong-enough macro-pattern signal. Each macro-cluster materialization is expensive (Sonnet+ class call against full text of multiple produced essays plus their underlying clusters); the signal is rare enough that this is sustainable.

**Synthesis discipline.** Synthesis pieces are not auto-churned. The system surfaces candidates with low priority — they sit until the operator decides they're ready to make a synthesis piece. Synthesis is a deliberate move, not a routine output. The system's job is to make synthesis *available* when the body of work supports it, not to push synthesis prematurely.

**Citation lineage.** When a synthesis piece materializes, it cites back to the constituent essays. The operator is building a body of work where individual pieces reinforce each other; the synthesis piece is a capstone, not a replacement. Viewers who hit the synthesis essay can navigate down to specifics; viewers who hit a specific essay can navigate up to the synthesis. The published artifacts surface this lineage as part of their navigation.

#### 7.4.13 The article pipeline

The article pipeline produces written prose in the operator's article register, drawing on the same intelligence layer as video_essay (clusters, threads, bounce, voice profile). Substack-shaped output. Crystal Ford voice profile by default, since that voice profile was built from the operator's existing 17-article Substack corpus and is the operator's native written register.

**The article and the video essay share the cluster.** A cluster ripens once. At materialization, the operator chooses output(s) — video essay, article, both. If both, the system generates both from the same threads, bounce material, and voice profile, with prose engineering tuned to each medium.

**Why an article is different from a video-essay-script-read-aloud.** Spoken essay register is conversational with structure underneath (7.4.6). Written article register is denser, allows more compressed phrasing, supports longer sentences with clauses that would lose a listener but work for a reader, can use textual devices (italics, bullet points, blockquotes, footnotes) the spoken script cannot. Crystal Ford's signature reframe-collapse couplets, engineering vocabulary on human systems, McLuhan-shaped probes — all work in both registers but with different prose engineering.

**The article-generation prompt** receives:
- The cluster object (thesis, spine, threads array, voice_profile, length_magnitude — see 7.3)
- Full transcripts of source vlogs whose threads feed the cluster
- The operator's article corpus (Crystal Ford reference texts) for register reference
- Bounce output for factual extension
- Operator profile / identity context
- A flag indicating whether this article is being generated standalone or as a sibling artifact to a video essay (sibling articles can reference *"in the video version of this..."* if useful, or stay independent)

**Length defaults.** Articles match the cluster's length_magnitude:
- *short* (3–8 thread sub-points) → 800–1,500 words
- *mid* (8–20 sub-points) → 1,500–3,000 words (the Crystal Ford default)
- *extended* (20+ sub-points) → 3,000–6,000 words

**Output artifact.** Markdown. Front-matter with title, dek, reading time, optional companion-video-link. Footnotes and source citations integrated inline (links in the prose) rather than appended.

**Friction profile.** Lower than video essay — no recording loop, no production engine, no visual treatment. The operator opens the generated article, edits, publishes. Article materializations should ship the same day they're generated when the cluster was ripe.

**Voice preservation.** Same rule as 6.1.7 and 8.2.3: the operator's voice carries the prose. Crystal Ford reference texts inform cadence; operator's threads' takes inform content; bounce extends factual depth; the article is *about the topic*, not about the operator. Reframe-collapse couplets, engineering-vocabulary-on-human-systems, McLuhan-shaped probes are the operator's signature moves and should appear naturally where the material supports them.

**Anti-patterns.** Articles must avoid the same LLM-default essay register failures as video essay scripts (8.2.3). No coined-phrase landings that summarize the argument in a tweetable line. No falsely-balanced rhetorical structures. No aphoristic-insight-construction in LLM default style. The article register is denser than the video essay script's, but the failure modes are the same.

**Surface.** Studio. Same surface as video essays, because both are deliberate productions drawing on cluster cultivation. Cluster cards in Studio show available output options (*video essay ready, article ready, both available*); operator selects at materialization.

#### 7.4.14 The X post and X thread pipelines

These are fast-friction outputs. Single-post X / Twitter content (`x_post`) and multi-post threaded sequences (`x_thread`). Different unit, different cultivation profile, different surface.

**x_post operates at two altitudes:**

**Per-thread surfacing (most common).** When a thread is extracted, the system evaluates its key_quotes for X-post viability. A key_quote is x_post-viable if it: (a) lands as a complete thought without surrounding context, (b) is under 280 characters or compresses cleanly to that length, (c) has voice and edge characteristic of operator's posting register, (d) doesn't depend on the cluster's bounce material to make sense. Threads with one or more x_post-viable key_quotes surface as candidate posts. *"This phrasing from your Mar 14 vlog would work as a standalone X post."* Most threads produce zero or one candidate; some produce two or three.

**Per-cluster surfacing (post-materialization).** When a cluster materializes (into a video essay or article), the system also generates 1–3 companion x_post candidates derived from the materialization. The strongest quotable lines from the script or article. Sharpest reframes. Single beats that work standalone. These ship as a coordinated drop with the long-form piece — a video essay launches with companion tweets that sample the strongest phrasings.

**x_thread operates on threads (the Neolog kind, confusingly).** A single analytical thread where the operator developed a take across several beats can become a multi-post X sequence. The thread's key_quotes become individual posts, with the operator's connective phrasings adapted to bridge them in the threaded sequence. Thread-level x_thread candidates surface when a single thread is dense enough (multiple strong key_quotes) but not yet at cluster-formation density. Cluster-level x_thread candidates surface as companion drops when a cluster materializes — sequencing 5–10 beats from the long-form piece into a tweet thread.

**No cultivation lifecycle.** x_post and x_thread candidates do not ripen. They surface as available, appear as Post-type cards on the Timeline, and ship or skip. Stale candidates auto-archive after 14 days unless the operator pins them.

**Generation prompt.** Light. Receives the source thread or materialized cluster, the operator's posting voice profile (drawn from operator's existing X account if available, or defaulted to a tighter version of Crystal Ford), and instructions to preserve verbatim phrasing where possible. The system does not invent quotes — it shapes operator phrasings into post-shaped artifacts.

**Output artifact.** Plain text post (or post sequence for x_thread). Character counts visible. Optional media attachment (the system can suggest pulling a clip from the source vlog as media, particularly when the post derives from a thread that is also a clip candidate).

**Surface.** Post-type cards on the Timeline (4.5.2). Lighter rhythm — the Post card is a one-tap-ship affordance rather than a workflow. The operator filters Timeline to *Posts* when they want to scan candidates and ship a few; otherwise Post cards appear inline with the rest of their stream.

**Coordinated drops.** When a cluster materializes with multiple output types (video essay + article + companion x_posts), the companion x_posts surface as Post-type cards grouped near the cluster's Article card on the Timeline, with a *"part of the [cluster topic] drop"* label. The operator can ship the long-form first and the x_posts as a follow-on, or coordinate timing across platforms.

#### 7.4.15 The clip pipeline

Raw-vlog moments where the delivery worked, surfaced as candidate shorts. Surfaces as Clip-type cards on the Timeline. Substantively different from the analytical pipeline because the detection signal is different — clip detection looks for *delivery quality*, not topic or take.

**Clip-candidate detection runs as a separate extraction pass.** Same vlog, different prompt, looking for different things:

- **Delivery moments where the operator nailed it on camera.** Audio is clean. Energy is right. The segment is self-contained — it lands without the surrounding context.
- **Length is shippable.** Between roughly 30 seconds and 3 minutes for the segment. The system identifies start and end timestamps from the word-level transcript.
- **The vlog footage itself is usable.** Operator was not driving in a way that's unsafe to show, lighting is acceptable, no PII visible, no profanity that breaks platform rules (or at least, profanity that the operator has flagged as ship-eligible in their voice profile).
- **The segment is a complete unit.** A landed take, a clean explanation, a finished riff — not the middle of a longer thought.

**Clip candidates are not derivatives of threads.** They're a different unit entirely. The system runs both passes against the transcript — analytical thread extraction and clip-candidate detection — independently. A thread might be strength 5 (great take, clear cluster contribution) without being clip-worthy (audio bad, you stumbled, the segment is rambly). A 30-second moment might be clip-worthy (you nailed an explanation cleanly) without being thread-shaped on its own.

**Clip-candidate prompt.** Takes the transcript with timestamps plus an audio-quality-and-pace signal (computed at transcription time as a separate signal) and identifies candidate moments. Outputs each candidate as: `{start_time, end_time, headline (5-8 words describing what's said), why_clippable (delivery_clean / take_landed / self_contained / energy_right), vlog_id}`.

**Output artifact.** A clip is the *trimmed vlog footage* between the candidate's start and end timestamps. No script, no re-recording, no voiceover replacement. The operator's original recording, edited down to the strong segment. ffmpeg handles the trim.

**Surface.** Clip-type cards on the Timeline (4.5.2). Each card shows: video preview frame with play button, in/out timecodes, duration, the take quote, why_clippable signals as small chips. Operator previews (taps the card to play the segment with start/end markers visible), approves or rejects. Approved clips can be downloaded directly, or pushed to the publishing pipeline for direct platform upload. Once shipped, the same Clip card persists with `published` status and engagement metrics.

**Multiple-vlog compilation.** Out of scope for this section. The current Neolog Auto-Edit page advertises *"AI picks your best moments across all vlogs and assembles them into a finished video"* — that is essentially the compilation/episodic production type already in the spec (8.2.6), which sequences multiple ripe clusters into one production with light connective framing. The clip pipeline as specified here is for *single moments inside single vlogs*. Multi-vlog auto-compilation is a distinct future capability, downstream of the cultivation pipeline rather than the clip pipeline.

**Friction profile.** Lowest of all production types. From clip candidate surfacing to shipped post should be 30 seconds. The Clip card appears on the Timeline; the operator scans, taps to preview, approves, ships. *"You being a person on the internet"* — light, fast, low-stakes.

**Future direction (non-blocking).** The operator has mentioned interest in eventually remastering raw vlogs with replacement visuals (cartoon, generated, etc). That capability is downstream of this pipeline — the clip is the source artifact, remastering is a transform applied to it. Not specced here; lives in a future sub-spec when the rest of the pipeline is shipping reliably.

#### 7.4.16 The creative_work pipeline

Parallel pipeline for fictional and creative material. Pack Rats. The Mechanical Bride. Character ideas, scene fragments, themes, settings, dialogue, mood references. Substantively different from the analytical pipeline — different extraction, different cultivation model, different production engine, different output artifact.

**Different extraction pass.** The transcript is run through a creative-mode extraction prompt in addition to the analytical thread extraction. The creative-mode prompt looks for:

- **Character beats.** New traits, behaviors, voices, relationships introduced for an existing or new character.
- **Scene fragments.** Moments imagined and described — *"I had this idea where [character] is in [setting] and [thing happens]."*
- **Dialogue.** Lines of imagined speech, attributed to characters.
- **Themes.** Thematic ideas the operator is developing — *"this whole thing is really about [X]."*
- **Setting / world details.** The Toronto creative-studio milieu, a specific location, a period detail.
- **Tonal references.** Films, shows, books, music the operator names as sonic / visual / mood references for the project.
- **Plot fragments.** Narrative beats, structural ideas, sequence proposals.

Each extracted creative-element has: `element_type, content, project_link (if identifiable), register (operator's own voice or imagined character voice), source_vlog_id, transcript_span, voice-preserved phrasing`.

**Project as the persistent container.** Creative-elements accumulate against named **projects** (Pack Rats, The Mechanical Bride, an unnamed character study). Projects are different from clusters in important ways:

- **No automatic ripening.** Projects accumulate over months or years. There is no ripeness threshold that triggers materialization. The operator drives when something materializes.
- **No auto-promotion lifecycle.** Project state is operator-controlled. States are simpler: `developing` (accumulating), `materializing` (active production work), `produced` (something shipped from this project), `dormant` (no recent activity).
- **Linkage to elements is two-way and editable.** Operator can re-link elements between projects, split elements off into new projects, merge projects.
- **Mood notes and references are first-class.** Project carries operator-attached visual references, music references, tonal anchors — not just element-extracted material.

**Project linkage at extraction time.** The creative-mode extraction tries to identify which project a creative-element belongs to. Signals: explicit naming (operator says "for Pack Rats"), abstracted shape match against existing projects, character names, setting overlap. Confidence-weighted. Operator can override.

**Production engine — generative video.** When the operator decides a project is ready to produce something (a scene, a trailer, a short film, a sequence), the system materializes a screenplay or scene document from the accumulated creative-elements, then hands off to the generative video pipeline.

The generative video stack (per current operator research):
- **Image generation:** Flux for stills and reference frames
- **Video generation:** Wan2.1 VACE, Veo, Kling, or Runway for clip generation, depending on what the scene needs
- **Audio:** Generated VO when characters speak (using voice-cloning or character-voice generation), generated score, sound design as needed
- **Assembly:** ffmpeg pipeline (same as video_essay) but with generated assets rather than recorded operator footage

The operator's existing **Aldershot** project concept (generative cinematic AI engine, AI film studio combining cinematic AI with game-like interactivity and social presence) is the longer-term home for this production engine. Neolog's creative_work pipeline produces the *material* — screenplays, scene documents, character bibles, mood boards — that Aldershot's production engine renders. The boundary between the two systems will be defined as both develop.

**Operator on the screen, vs not.** Some creative_work projects might still feature the operator (essay-as-fiction, video-essay-with-character-voice, hybrid forms). Most will not — the operator is the writer and director, not the on-camera performer. The voice profile system (7.4.8) extends to support character voices — voice profiles for fictional characters built from operator-provided reference texts (sample dialogue, character descriptions, voice notes).

**Surface — Projects page.** Separate from Studio. Lists active projects with their state (developing / materializing / produced / dormant), accumulated element count, last activity, mood references. Tapping a project surfaces its elements, references, recent additions, and any in-progress productions.

**Cultivation rhythm — slower.** Projects don't push notifications when new elements arrive (most of the time). They accumulate quietly. The system surfaces a project only when the operator opens the Projects page, or when the operator explicitly asks the system *"what do I have on Pack Rats lately?"* This matches the operator's actual rhythm with creative work — long marination periods punctuated by intense production sprints.

**Status of this pipeline in the spec.** Architecturally specified; detailed implementation deferred. The video_essay and article pipelines are closer to shippable. Creative_work depends on the generative video stack stabilizing and on the Aldershot infrastructure being in place. The architecture here reserves the namespace and ensures the analytical pipeline doesn't accidentally absorb creative material (a vlog about Pack Rats characters should not get extracted as bad analytical threads and form a bad cluster). When the analytical pipeline ships and the generative stack matures, the creative_work pipeline gets full operational buildout.

### 7.5 Surfacing — how the system feels alive

Earlier drafts of this spec described surfacing as "Studio's central view." That framing was wrong. Surfacing is not a property of one page — it is a property of how Neolog's intelligence layer talks back to the operator. The operator's mental model is **CANOPTICON-style living threads** — the operator's other major project, where the system tracks active investigative threads (a politician, a fund, an emerging story), automatically ingests new material against those threads (news articles, social posts, statements, filings), and surfaces developments (*"new article came in on the Mark Carney fund — potential exposure here"*). Threads in CANOPTICON have momentum. They feel alive. They're not a list — they're a working system.

Neolog applies the same pattern to the operator's own developing thinking. The system pays attention to what the operator is working out, gathers adjacent material, notices gaps, recognizes when a cluster is ready, and surfaces all of this back to the operator in the same place the operator's own contributions live: the **Timeline**.

The mechanism is the **Surfaced card** type (section 4.5.3). When something noteworthy happens — a cluster crosses readiness threshold, a new bounce-source returns a useful item, a gap appears in a ripening cluster, a thread auto-links to an existing cluster — a Surfaced card appears on the Timeline, dated to the moment the system noticed. The card is read-only ambient context; the operator absorbs it or taps into it. No required action.

#### 7.5.1 Surfaced card subtypes — what the system surfaces

Surfaced cards have named subtypes (full taxonomy in 4.5.3). Mapping to surfacing intent:

- **Surfaced · Cluster ready** is what the previous spec called *"the operator opens Studio and sees a cluster has reached threshold."* It is now a Timeline card. Body names the cluster, lists production candidates, links to Studio (cluster detail) for the materialize action.
- **Surfaced · Adjacent insight** is the bounce-feed mechanism described in 7.5.2. Body carries the insight (name, framework, parallel, counter-position) plus a source citation when the insight comes from external research.
- **Surfaced · Gap question** carries the *"you've talked about X and Y; you haven't said Z — worth a riff?"* prompt for ripening clusters with a thin spine sub-point.
- **Surfaced · New evidence** is forensic-mode bounce. Body summarizes the new external source matching a forensic cluster's pattern.
- **Surfaced · Auto-link** is the system telling the operator *"a new thread from yesterday's vlog auto-linked to your Voice as input cluster."* Body names both items so the operator can see the linkage and unlink if wrong.

#### 7.5.2 Studio sees Surfaced too — but as a focus mode

The operator can also reach surfaced material by entering Studio (the dock entry, or by tapping a Surfaced · Cluster ready card on Timeline). Studio is a focus mode that filters the Timeline's Surfaced cards down to *what's actively in cultivation* — ripening clusters, ready clusters, held clusters — and shows each as a richer cluster card with full adjacent-insight feed, gap question, contributing threads, and production candidates. The same data the Timeline shows, but presented for deliberate work rather than ambient absorption.

The operator opens Studio when they're sitting down to work. They open Timeline when they want to see what's happened.

#### 7.5.3 The cluster card — what it shows when fully expanded

Within Studio (the cluster detail view), each cluster shows:

- **Topic** — system-generated one-line summary, operator-editable. *"YouTube's For You page — recommender as cache, not personalization."*
- **State** — `surfaced` (new, you haven't engaged yet) / `ripening` (active, system is cultivating) / `hold_for_more` (you've held this for more material) / `ready` (threshold crossed, ready to materialize).
- **Ripeness bar** — visual indicator of how close to ready. Composite of thread density, take strength, voice richness, bounce-readiness.
- **Thread count with momentum.** Not just "6 threads." *"6 threads · 2 added this week."* The momentum indicator is what makes the cluster feel alive rather than archival.
- **New-since-last-viewed signal.** *"3 new adjacent insights · 1 new thread auto-linked from yesterday's vlog."*
- **Adjacent insight feed inline.** One or two of the most useful items from bounce shown directly on the card so the operator sees the system thinking alongside them.
- **Gap question.** If the cluster is ripening and has a thin spine sub-point, the one-line prompt is shown: *"You've talked about the static refresh and the Not-Interested workaround. You haven't said what good would look like — worth a riff?"*
- **Production candidates.** Which output types are ready (video essay, article, x_thread, clips), which are pending.

The operator scans the cluster card. They might tap into a thread to see all contributing material, or absorb the gap question and let it shape their next vlog. They might mark a cluster as `hold_for_more`. They might tap **Materialize** on a `ready` cluster to enter the production setup screen.

**The notification pattern is low-friction.** Surfaced cards on the Timeline are the notification — they appear in the operator's stream as the system notices things, without modal prompts. The operator absorbs them and moves on. Future vlogs naturally riff toward active clusters without the operator consciously deciding to.

This matches how the operator works: mostly mobile, mostly between deliveries, low-friction inputs only. The system tracks; the operator riffs; the system extracts and links; clusters ripen with momentum the operator can feel.

**The surfacing rules are conservative.** Surfaced cards appear only when something has actually crossed a threshold worth surfacing. Studio's filtered view shows fewer clusters rather than more. A small number of strong, alive-feeling clusters beats a long list of weak ones. The previous Studio's failure mode — showing every recent vlog as a "session ready to produce" — is exactly what to avoid. If Studio shows three clusters and they all have momentum, that's success. If Studio shows fifteen clusters and none of them feel alive, that's failure regardless of their data quality.

**Pull surfacing.** The operator can also pull — ask Studio for clusters around a topic, mood, length, or form. *"Show me clusters about platform mechanics." "Show me anything with manifesto-shape." "Give me a single-thread candidate ready to ship."* Pull uses the same cluster data structure, just queried differently. Pull is operator-initiated and runs against existing material; push is system-initiated and produces Surfaced cards on the Timeline.

### 7.5.5 Adjacent-insight feed — bounce moves earlier

Bounce was originally specified as a script-time operation: when an ideator generates a concept_essay or cultural_criticism script, it pulls in frameworks, counter-positions, and external evidence as part of the script generation. This is the wrong place for it.

**Bounce is repurposed to fire during ripening, alongside each cluster the operator has engaged with.** It produces an *adjacent-insight feed*: a small set of items the operator might find useful to know while the cluster is still developing. These are not for the script. They are for the operator. They feed the next vlog. They give the cluster the *living* quality CANOPTICON has — the feeling that material is flowing in alongside the operator's own contributions.

The adjacent-insight feed produces:

- **A name for the dynamic.** If the operator is describing a phenomenon without naming it, bounce surfaces the existing name. Example: *"The pattern you're describing — community of viewers who find more meaning in dissecting a creator's downfall than in the creator's own work — is sometimes called parasocial dissection. It's adjacent to spectatorship-as-content, where the meta-discussion outpaces the original content."*
- **A related framework.** Useful theoretical or conceptual lens that sharpens the operator's articulation. *"Goffman's presentation of self in everyday life — the front stage / back stage distinction — applies here. Live-streamers collapse those into one stage, in front of an audience that watches the collapse happen."*
- **A real-world parallel.** Specific external example the operator can anchor to. *"There's a six-year-running podcast just about DSP — not made by him, made about him by viewers analyzing his content. They have larger audiences than he does. This is the live exhibit of the dynamic you're describing."*
- **A pointed gap-question.** Only if it adds something genuinely useful. *"You've described what watching this looks like. You haven't said what the consequence is for the people doing the watching. Worth a riff?"*
- **(Forensic mode candidate clusters)** — *"A new piece of evidentiary material relevant to this thread came in: [source]. This brings the count of documented incidents in your timeline to 7."* When forensic mode is the candidate mode, the adjacent-insight feed surfaces evidence rather than commentary, and the cards visibly note that.

Not all five for every candidate. The adjacent-insight engine selects the one or two most likely to feed the operator's next vlog, based on what's already in the cluster and what's missing.

**The adjacent-insight feed updates as the cluster ripens.** As the operator adds vlogs into the cluster, the feed shifts to address new gaps and surface new framings. The first feed for a cluster might offer a name for the dynamic. After three more vlogs, the feed might shift to a real-world parallel. After two more, it might surface a counter-position that sharpens the operator's actual stance by contrast.

**Crucially, the adjacent-insight feed is teaching, not interrogating.** The operator does not have to answer questions. The operator does not have to engage at all. The feed is read-only for the operator; it is bounce output presented as ambient context. If something in it pulls the operator into a riff, great; if not, the cluster keeps ripening on the next vlog.

This is the load-bearing mechanism for the bidirectional training claimed in 2. The system trains the operator (by feeding adjacent insights, names, frameworks, parallels) at the same time the operator trains the system (by feeding more vlog material into specific clusters). Neither happens through explicit teaching or explicit prompting. Both happen ambiently as the operator works through the cultivation lifecycle.

### 7.5.6 Surfacing what NOT to do

A few common failure modes worth flagging explicitly so a future agent does not implement them:

- **Do not interrogate the operator.** No required-question screens. No "answer these three questions to ripen this cluster." No forced engagement. The operator works in fragments, on the road, between deliveries; any required interaction kills the loop. Adjacent-insight feed is read-only.
- **Do not surface every cluster the engine forms.** Most `forming` clusters never reach `surfaced`. The surfacing threshold is conservative: only show clusters that have crossed an initial density threshold and have a coherent thesis-shape. Surfacing too aggressively trains the operator to ignore the candidates view.
- **Do not auto-promote clusters from `surfaced` to `ripening` without operator engagement.** The operator's tap or post-surface vlog is the signal. Without it, the cluster stays in `surfaced` indefinitely or gets archived if material density doesn't grow.
- **Do not skip from `surfaced` directly to `ready`.** Even if a cluster's material density spikes past the threshold from a single vlog drop, the cluster must spend at least one cycle in `ripening` so the adjacent-insight feed has a chance to fire and the operator has a chance to react.
- **Do not generate scripts from thin clusters because the operator asks for one.** If the operator forces script generation on a `surfaced` or early-`ripening` cluster, the system can do it but flags the result as low-confidence. The operator may want to see what's there even when it's thin; honor that. But mark it.
- **Do not let the adjacent-insight feed drift into LLM-trivia mode.** The feed is *useful* adjacency, not "fun facts." If bounce can't surface a real name, framework, parallel, or gap-question, it stays silent rather than producing filler.

### 7.6 Cluster building — the process

The clustering engine doesn't run as a single all-at-once operation. It runs incrementally:

1. **At extraction time** (per vlog), the new vlog produces threads with topic, take, key_quotes, and abstracted_topic. The cross-reference pass proposes connection edges between this vlog's threads and recent threads with similar abstracted_topics.
2. **As edges accumulate**, dense subgraphs emerge — clumps of threads where many abstracted_topics converge or where many cross-references between threads point to the same underlying pattern.
3. **Cluster candidate detection** runs periodically (daily off-hours). It reads the connection graph, identifies dense subgraphs and tension/drift patterns across threads, and proposes clusters. Each proposed cluster gets a strength score based on thread density, take strength, voice richness, and recency.
4. **Cluster materialization** converts top-scoring proposals into the structured cluster data above. Sonnet runs a single-shot pass per cluster: read the source threads (their topic, take, key_quotes), produce thesis/spine/threads-array/questions_raised/length_magnitude.
5. **Bounce** — runs against the cluster's questions_raised when the cluster enters ripening. This is when the system gathers either commentary/frameworks (default mode) or evidentiary material (forensic mode), produces adjacent insights, and surfaces gap-questions for the operator's next vlogs.
6. **Surfacing** — top-scoring materialized clusters are pushed (or wait for pull) in Studio.

This is incremental and lazy. Most extraction runs do not trigger cluster materialization. Only the proposal step is cheap-and-frequent; materialization and bounce are expensive-and-selective.

### 7.7 Cluster editability

The operator can edit clusters in Studio before generating scripts:

- Reframe the thesis if the system's framing is off
- Reorder the spine
- Add or remove source vlogs from the source map
- Change form, register, cadence, length target, tier, or voice profile
- Adjust verbatim_ratio target
- Add motif notes
- Reject the cluster entirely (and optionally flag why — *"this isn't a real pattern,"* *"I'm not ready to talk about this,"* etc., feeding back into clustering scoring)

Form changes are particularly powerful — switching a cluster from concept_essay to manifesto_rant produces a fundamentally different production from the same source material. Operators should be encouraged to try form changes when a generated script doesn't land.

Edits are saved on the cluster, not on the source vlogs. The ideator reads the (possibly edited) cluster as its input.

### 7.7.1 Attachments — external material into ripening clusters

The operator can attach external material to any cluster in `surfaced` or `ripening` state. Attachments are not vlogs and not extracted — they are reference material the operator brings in deliberately, with low friction.

**What attachments can be:**

- Screenshots (the operator's own posts on other platforms, screenshots of articles, expo screenshots, etc.)
- Image files (a photo, a diagram, a found image)
- Links (a tweet, an article, a video the operator wants to reference)
- Pasted text (a snippet of writing the operator did elsewhere, a quote from someone else, a comment thread)
- Audio snippets (a voice note specifically about this cluster — distinct from a vlog because it's targeted)

**What attachments do for the cluster:**

1. *Strengthen the thesis as source material.* The attachment's content (text in a screenshot, the linked article, the pasted snippet) is added to the cluster's source pool. The ideator sees it during script generation alongside vlog transcripts. If the attachment is the operator's own previous take on the topic (e.g., a popular post they made), it functions as cross-channel verbatim — it can be quoted directly in the script.

2. *Provide ready visual assets for the production.* Attachments with visual content (screenshots, images) become eligible for direct use in the production's visual treatment. The visual_treatment role can choose to slot the actual screenshot into the matching beat instead of generating B-roll or atmospheric visuals for that beat. This collapses friction at the visual-treatment step — for some beats, the visual is *already provided by the operator*, no generation or selection needed.

3. *Anchor external validation when relevant.* When the operator attaches their own popular post, that's signal to the cluster that this take has already landed with an audience. The ideator can use this as opening material (*"I made this post about X. People agreed. Here's what I didn't say in the post."*) — a particularly strong opening pattern for video essays, since it starts with social proof and immediately moves past it.

**Friction-minimization is the design principle.** Adding an attachment is one tap (share-to-Neolog from the screenshot, paste into the cluster, drag-drop). The operator should never feel like attaching material is *work*. If it starts to feel like work, operators stop attaching and the feature dies.

**Attachments are optional.** Most clusters won't have any. Some will have one or two. A cluster with a popular external post or a striking screenshot is a stronger candidate than one without — it has both internal evidence (vlogs) and external evidence (the attached material). But the system should never *require* attachments; clusters built on vlog material alone are still complete clusters.

**Visual-treatment integration.** The production engine's visual_treatment role checks attachments before deciding visuals for a beat. If an attachment matches a beat's content (e.g., the popular post about YouTube algorithm matches the beat about YouTube algorithm), the visual_treatment role proposes using the attachment directly with appropriate framing (full-screen, lower-third, etc.). The operator approves or overrides at the recording-overlay step.

**Attachments do not bypass voice preservation.** If an attachment is text (a pasted snippet, a transcribed audio note, a quote), and the ideator pulls from it for the script, the same voice-preservation rules apply (8.2.3) — the attachment's text is treated as operator material if it's the operator's own writing/posts, or as bounce material if it's external (someone else's article, a quote, etc.).

### 7.8 What does NOT belong in the clustering engine

- Direct script generation. The clustering engine produces *cluster data*. The ideator role produces scripts from cluster data. Keep these separated — the clustering engine has a hard enough job.
- Content moderation, taste calls, or "should we publish this" judgments. The clustering engine surfaces candidates. The operator decides what to make.
- Visual treatment decisions. Motifs are noted in the cluster as hints, but the production_director and visual_treatment roles handle visuals. Cluster-level motif notes are seeds, not specs.

### 7.9 Topic ontology — a deliberate non-decision

Earlier discussions raised the topic-ontology question: how should the system tag and categorize material so that recurrences are detectable? AI-generated dynamic categories drift; predefined ontologies are too rigid.

The architecture above sidesteps this question by relying on **abstraction tags on claims and moves rather than vlog-level topic categories**. Two vlogs about apparently different topics can share abstracted claims even if their topic tags would never overlap. The connection graph operates at the claim/move level, not the topic level.

Topic-level categories may emerge as a downstream view (a Brain page that organizes the substrate by topic), but they are not the spine of the clustering engine. This is a deliberate architectural choice and should not be reversed without strong reason.

---

## 8. The production engine

The production engine is adapted from the CANOPTICON production engine spec, with Neolog-specific modifications for substrate type, format defaults, style anchor, citation system, and coherence check. This section covers the parts that carry over near-verbatim. 8 covers the visual treatment system in Neolog-specific detail. 9 covers motifs. 10 covers performance.

### 8.1 The six-state model

A production has six lifecycle states. They flow forward; the operator can return to earlier states but the system tracks where the production currently lives.

```
Ready → Recording → Producing → Publish → Perf → Archive
```

- **Ready.** Script exists, coherence-checked, beats are defined, waiting for the operator to start recording.
- **Recording.** The operator is reading beats. Some recorded, some pending. Can be paused for days and resumed.
- **Producing.** All beats recorded; auto-edit pipeline is stitching, trimming, generating captions, rendering visuals, assembling.
- **Publish.** Render complete. Operator does final review, schedules platforms.
- **Perf.** Published. Tracking performance per platform; insights feed back into the prompt-pattern weighting system.
- **Archive.** Old enough that performance has stabilized; reference-only.

The Studio screen is six tabs corresponding to these states. Productions move tabs as they progress. This is the simplest model that worked in CANOPTICON; alternatives (kanban, time-ordered list, pipeline visualization) were rejected as worse on phone screens or as hiding state the operator needs at a glance.

The state model lives in a `productions` table with a `state` enum; the actual artifacts (script, beats, recordings, visuals, edited file, captions, thumbnails) live in adjacent tables linked by `production_id`.

### 8.2 The script — what the operator reads

The script is generated, not written from scratch. A `production_ideator` role takes a cluster from the substrate and produces a complete script with beats. The operator can edit, but the default is that a script *exists* before the operator has had to think about it. This is what makes the system work for someone with limited time — the friction from "I want to make a video about X" to "there is a script ready to read" is collapsed.

The script is decomposed into beats. A beat is the atomic unit of recording — typically 10–30 seconds, occasionally up to 60. A complete production has 20–40 beats. Beats are stored with text, an optional cue (stage direction like *"pause, slow, pull weight onto last clause"*), a `beat_role` (open / context / turn / evidence / reflect / close / transition), and a `recording_status`.

**Why beats rather than paragraphs:**

- *Mistake localization.* When the operator flubs a sentence reading a 5-minute monologue, they start over. When they flub one beat, they re-record one beat. The operator keeps going. This is the difference between the production engine actually getting used and not.
- *Pause tolerance.* Real life happens between beats. Pause at beat 12, resume tomorrow at beat 13. The system holds state. The operator's life doesn't have to clear a 30-minute window.
- *Editing predictability.* The auto-edit pipeline knows where the cuts are because cuts are always at beat boundaries.

**Beat roles** determine pacing, prompt style, and visual treatment. An "evidence" beat reads declaratively. A "turn" beat is the rhetorical pivot, slow read, probably a graphic punctuation. An "open" beat is a hook with cinematic visual treatment. A "close" beat is the landing with the coined phrase emphasized. The treatment system uses beat role as a primary input.

**Script principles** (passed to the ideator role as system instruction):

- Beats are written for ear, not eye. No clauses that work in print but die when read. No long sentences that exhaust the breath. No vocabulary that requires effort to pronounce.
- Open with the strongest claim, not the setup. Inverted-pyramid for video. Most viewers don't make it past beat 3; whatever they see in beats 1–3 is what they leave with.
- Each beat has one job. If a beat is doing two jobs, split it.
- Citations are integrated, not appended. Where a Neolog beat is grounded by something — a thinker, a source, a piece of evidence the bounce surfaced — it shows up in the beat that uses it, not in a footer.
- Length discipline by format. Shorts: 5–8 beats. Mid-length essays: 20–40 beats. Long-form: 40–80 beats.

### 8.2.1 Ideator inputs — full transcripts, not just thread takes

The ideator receives:

- The cluster object (thesis, spine, threads array, form, voice_profile, mode, verbatim_ratio target, length_magnitude — see 7.3)
- The full transcripts of every source vlog whose threads feed the cluster — not just the threads' takes and key_quotes. Takes flag what the cluster is about; key_quotes flag what to definitely use as anchor; full transcripts let the ideator catch the operator's actual cadence, connective phrasings, looping returns, the way thoughts get built. Without full transcripts, scripts come out as Greatest Hits Compilations of punchy quotes connected by generic-essay connective tissue.
- The persistent **operator profile / identity context** (see below) — voice signals, life arc, current life context, accumulated riffs, recurring obsessions and engines.
- The **bounce output** for the cluster — adjacent insights, frameworks, counter-positions, evidentiary material if forensic mode is activated.

### 8.2.2 Identity context — who the operator is

The ideator is not generating in a vacuum and is not generating from one cluster's narrow window. It generates with knowledge of who the operator is. The system maintains a persistent **operator profile** updated by every vlog and every production:

- *Voice signals.* Cadence, signature phrasings, characteristic moves, profanity register, what the operator tends to circle back to, how they build a thought.
- *Life arc.* Long-arc context — career history, formative events, the through-line of what the operator has been trying to do across years. (For this operator: screenwriter, dropped out of film school, dad's death, fifteen years of building and abandoning channels and projects, currently doing deliveries to fund the work.)
- *Current life context.* Where the operator is now — geographic, financial, vocational, social. (Southern Ontario, gig-economy income, vibe-coding-through-voice, building Neolog, CANOPTICON, Drophead.)
- *Accumulated riffs and arcs.* The body of riffs the operator has explored to date and the longer arcs (years long) that thread through them.
- *Recurring obsessions and engines.* The underlying drivers that show up across many vlogs. The stuff the operator can't stop thinking about.

This profile is built incrementally and is available to every ideator and clustering call as default context. **The script is written by an ideator that knows who the operator is, not just what's in the immediate cluster.** Without this, the ideator has to guess at framing — which is when factual errors creep in (e.g., "for the past year I've been talking instead of typing" when the operator's actual arc is years longer).

### 8.2.3 Voice preservation at the script layer — the load-bearing rule

Same rule as 6.1.7 (extraction voice preservation), one layer further down. The ideator must not sanitize the operator's voice into LinkedIn / Medium / generic-essay register. This is the script-edit-friction principle from 3 made operational: if the script comes out in essay register, the operator has to fight it to make it usable, and the operator stops shipping.

**Forbidden registers and patterns.** The ideator must actively reject:

- Aphoristic-insight-construction in LLM default style: *"the discipline isn't in X, it's in Y"; "what looks like X is really Y"; "not A but B"; "the trap dressed up as creativity"*
- Falsely-balanced rhetorical structures that pretend to insight without earning it
- Building-to-a-thesis essay structure when the form is rant or probe or reflection
- Generic content-creator register — phrases that could appear in a thousand other essays (*"displacement activity from the harder work"; "the actual skill"; "what the work develops in you"*)
- Sanitization of operator profanity, hesitations, colloquialisms, fragmentary phrasings, looping returns
- "Coined phrase" landings that summarize the essay's argument in a tweetable line
- **Story-time preamble.** *"Let me tell you about the time I..." "So I was thinking the other day about..."* The operator has explicitly rejected story-time as a register. Beats land directly; they do not set up.
- **"Floundering" connective tissue.** *"And then I... and so I... oh and another thing..."* This is the texture of stream-of-consciousness vlogging, not the texture of a script. The script is one altitude up from the vlog, not at vlog altitude.

**Preferred registers and patterns.** The ideator must actively prefer:

- Verbatim or near-verbatim from operator material wherever the operator already said it well
- Connective tissue that stays close to the operator's vlog cadence — fragmentary, looping, returning, real
- The operator's own aphoristic style when aphoristic — probe-like, layered, McLuhan-influenced (when this is the operator's natural register), holistic rather than constructive
- Returning to phrases and ideas rather than building past them
- Texture over polish
- **Beat-by-beat punctuation rhythm.** Each beat is a complete unit that lands. The accumulation of landed beats — not narrative arc, not story progression — does the structural work.

**The target description.** The script should sound like the cluster's source vlogs at one altitude up — with ten more minutes of thinking between sentences, but in the same voice as the source material, with the same fragmentary cadence, the same returns, the same texture. **Not** like an essay version of those vlogs. Not like a Medium post. Not like a TED talk. The video type's default voice register (7.4.6 for video_essay) provides the baseline — for video_essay this is the conversational-with-structure-underneath register, not aphoristic-probe register. If a voice profile (7.4.8) is attached, the connective tissue takes additional cadence reference from the voice profile while still anchoring on the operator's verbatim from source vlogs and the video type's default register.

**The negative test.** If a sentence in the generated script could appear in a thousand other generic essays without surprising anyone, it does not belong in this script. Cut it or rewrite it in operator cadence.

**Verbatim ratio enforcement.** The cluster specifies a target verbatim ratio (e.g., 0.65). The ideator measures itself: if the generated script falls below the target ratio, the ideator must rebuild with more direct operator material. Direct quotation is the voice-preservation mechanism.

### 8.2.4 Form-specific ideator behavior

The ideator is one role with one prompt template, but the prompt template branches by `form` field on the cluster. Each form changes the ideator's behavior:

- **concept_essay** — bounce required for factual extension; topic-treatment beat structure (hook → topic specification → mechanism → reframe → implication → close); operator material as anchor lines and register, not as protagonist arc; verbatim ratio low (0.15–0.30).
- **concept_essay** — invention required, operator-as-illustrator, concept-progression beat structure, lower verbatim ratio, bounce material woven throughout.
- **manifesto_rant** — invention discouraged outside operator's voice; verbatim very high; declarative escalation rather than balanced argument; profanity and emphasis preserved; no balanced "and the other side is" beats; built to land, not to qualify.
- **reflection** — looser structure, mood-dominant, atmospheric, often near-silent visually; verbatim used for anchoring rather than for argument-building.
- **cultural_criticism** — observer-and-commentator stance; cultural context required (bounce); operator's specific angle as the spine; balanced between operator material and external context.
- **probe** — aphoristic in operator's style, layered rather than constructed, returns and circles, structure embodies content (medium-as-message principle). Probe form supports beat-by-beat aphoristic intensification when the operator wants tighter punctuation rhythm — voice profile attached at materialization further shapes cadence within the form.

For documentary video type, form-specific behavior:

- **forensic_investigation** — full seven-section anatomy (7.4.11.1); attribution-front-loaded throughout; the "moment our reading changed" beat is required somewhere in the body; close is consequential not concluding; competing accounts segment is mandatory.
- **systemic_history** — Curtis-style chain-of-events tracing; named protagonists for each major idea or decision; archival-heavy; close lands on "and that is how this became this."
- **unresolved_inquiry** — close is precise statement of unresolved state; what would resolve it; what is at stake while it remains unresolved. No false synthesis.
- **profile_anatomy** — single subject at the center; investigation works through the subject's own record, statements, decisions; subject is humanized without exonerating; competing accounts segment is especially important.

When a script comes out wrong, the first diagnostic is: did the ideator use the right form? Often the cluster was correct material, wrong form selection. Form change in cluster editing (7.7) is the fastest fix.

### 8.2.5 Coherence check

**Coherence check before Ready.** Between script generation and Ready state, a coherence role runs. For Neolog this is structural and reflective — does the beat sequence form a real arc through the material? *And does the script pass the voice test — does it sound like the operator, or did the ideator drift toward LLM default essay register?* Productions that fail coherence go back to re-ideation. Productions that pass enter Ready. This is where most of the AI-content-slop problem gets caught. If the script doesn't hang together, no amount of good recording rescues it.

The coherence check has a specific voice-test sub-pass. The coherence role is given the script plus the operator profile plus a sample of source vlog transcripts, and asked: *would the operator read this without significant editing?* If the answer is no — if the script has drifted into generic-essay register, has aphoristic-construction lines the operator wouldn't say, has sanitized verbatim quotes, or has structure that doesn't match the form — coherence fails and the ideator re-runs with sharper instructions.

For probe form (when the operator selects intensified aphoristic cadence) the coherence check has an additional rhythm sub-pass: *do the beats form a punctuation rhythm, or are some beats running long and undercutting the form?* Probe-with-intensified-cadence requires beats to land at near-uniform tightness; a beat that drifts into explanation or transition breaks the rhythm and gets flagged.

For documentary video type, the coherence check runs the three-part functional test from 7.4.10.8 (attribution test, tense test, "what was actually going on" test). Scripts that fail any of the three tests are flagged for either re-ideation or video type change. A script that fails the attribution test usually means the cluster's material is interpretive rather than evidentiary — the cluster wants to be a video_essay, not a documentary. A script that fails the tense test usually means the ideator drifted; re-ideation with sharper instructions. A script that fails the "what was actually going on" test usually means the cluster has not actually surfaced anything new; the cluster goes back to ripening with bounce-side gap-questions about what evidence is available.

### 8.2.6 Production types — single-cluster vs compilation/episodic

The script-and-beats model assumes one cluster produces one production. This is the default, but it is not the only production type. The production engine supports two production types:

**Single-cluster production.** One ripe cluster → one production (script, recording, produced video). The cluster's form, length, and verbatim_ratio drive the production. This is what the demo runs in this spec produced. Most productions will be single-cluster, especially for the deeper essay forms (concept_essay, manifesto_rant, extended probe) and for long-form documentary (forensic_investigation, systemic_history).

**Compilation/episodic production.** Multiple ripe clusters → one production composed of segments. Each segment is a complete unit driven by its own cluster (often a short or mid probe, or a single-beat probe), and segments are sequenced into a longer production with light connective framing. The connective tissue between segments is *not* a unifying thesis — it is the operator's voice and register tying the segments together as a show. Reference pattern: the show structure used by news/commentary creators who cover several items per episode. Each item is its own piece; the episode is the operator's selection and ordering.

**When to materialize as compilation.** Cultivation lifecycle (7.4.5) tracks not just "is this cluster ripe" but "is this cluster ripe at what magnitude":

- A cluster ripe at `single` or `short` magnitude is a *segment candidate* — eligible for compilation but not strong enough alone for a standalone production.
- A cluster ripe at `mid` or `extended` magnitude is a *standalone candidate*.
- A cluster ripe at `mid` magnitude can sometimes be split into two `short` segments if the operator prefers — magnitude is a guideline.

Studio's candidates view shows segment candidates and standalone candidates separately. When 4–10 segment candidates accumulate, the system surfaces a *compilation candidate*: a proposed episode composed of those segments in a suggested order. The operator can accept, reorder, drop segments, add a hook segment, and materialize.

**Compilation script structure.** The compilation has an outer-frame script and N segment scripts:

- *Outer frame:* hook (one beat, names the episode), light transitions between segments (one beat each, can be as simple as *"next thing."* or *"this one's been bugging me."*), and a close (one beat, often gestures forward to next episode or just lands).
- *Segment scripts:* each segment is a complete sub-production with its own form, its own beats, its own rhythm. Segments do not need to thematically connect; they need to be the operator's voice pointed at distinct things.

**Compilation cadence.** Compilations can be produced as a regular cadence (weekly show, biweekly digest) or irregularly. The system should not impose a cadence — the operator decides when enough segment candidates have ripened to warrant a compilation. The operator may also produce a compilation early if a particular topic spike makes timing matter (e.g., several short takes on a current event).

**Visual treatment for compilation.** Each segment has its own visual treatment (per segment's form). The outer-frame transitions can use a recurring visual motif (a held shot, a card, a single repeated punctuation visual) that signals episode-level continuity. The compilation has a visual identity at the episode level even when segments are visually distinct.

**Compilation as a forgiveness mechanism.** A cluster that doesn't quite ripen for standalone production can still ship as a compilation segment. This means the cultivation lifecycle has *two viable exits* — standalone or segment — and clusters that would otherwise sit in `ripening` indefinitely can find a home as segment material. This reduces the risk that interesting-but-not-quite-essay-ready material stays unshipped.

### 8.3 Recording — the actual reading

This is the operator-facing surface that makes or breaks the engine. The CANOPTICON spec converged on these rules, and they carry over to Neolog unchanged:

- **Full-screen overlay.** When the operator hits Start Recording, the entire screen becomes the recording overlay. No nav, no sidebar, no distractions.
- **One beat at a time, big serif text.** Current beat fills the screen as readable serif type (~28-32px). The cue, if any, is in mono uppercase above the beat, smaller. The beat is what the operator reads.
- **Beat progress dots.** A row of small dots showing position in the production. Done beats filled, current beat highlighted, remaining beats outlined.
- **Next-beat preview.** A tiny preview at the bottom shows the next beat in italic, dimmed. Reading flows like a continuous read even though it's chunked because the operator is mentally preparing for what's next while landing what's now.
- **Three controls only.** Retake, Mark good · next, Pause. More controls were tested and rejected — operators got distracted choosing instead of reading.
- **Live waveform.** Bottom edge of the screen. Confidence that the mic is working and the level is okay.
- **Status indicator.** Pulsing red dot, REC, elapsed time. Confidence that the system is in the state expected.
- **One audio file per beat.** Each beat's recording is a separate audio file, named by production ID, beat ID, take number. Retakes preserved as superseded.

### 8.4 Producing — the auto-edit pipeline

Once all beats are recorded, the production moves to Producing state. Runs unattended.

Pipeline runs ffmpeg server-side on a Cloudflare Worker container, with Python wrappers for forced alignment. Operations:

- Stitch per-beat audio files in order.
- Trim leading and trailing silence per beat (conservative defaults — better to leave a beat of breath than chop into the read).
- Detect breath catches between sentences within a beat and optionally compress.
- Normalize loudness to broadcast level (LUFS target ~-16 for podcast/social).
- Generate captions via forced alignment of the canonical script text against the recorded audio (do *not* re-transcribe — re-transcription introduces hallucinations and disagreements with the script).
- Render visual track per the visual treatment specs (8).
- Composite audio + visuals + captions per production format.
- Render output formats per platform (long-form 1080p, vertical 9:16 for shorts, audio MP3 for audio-essay, etc.).

Visual generation runs in parallel with audio assembly. Captions are aligned, not generated — the script text is canonical and forced alignment gives word-level timings against the audio with guaranteed agreement.

Thumbnails are auto-generated using the same prompting infrastructure as visuals (8). 3–5 candidates per production. The operator picks one in the Publish tab. Default to the highest-scoring candidate so an operator who skips review still gets something usable.

---

## 9. Visual treatment — the cinematic short-doc engine

This is where Neolog diverges most from CANOPTICON. The visual register is different (cinematic short-documentary, not news/explainer). The visual sources are different (B-roll preferred, archival when relevant, generated for atmospheres). The treatment unit is different (visual sequences per beat, not single images per beat). The principles are explicit and they are load-bearing.

### 9.1 The four visual sources

Listed in priority order:

**1. The operator's own B-roll.** Real footage shot by the operator carries documentary weight that generation cannot match. When B-roll fits, B-roll wins. The visual_treatment role checks the B-roll library first.

**2. Archival and public-domain media.** Real photographs, public-domain footage, Wikimedia Commons, fair-use editorial material for commentary work. Used when productions reference real historical figures, real events, real artifacts, real places that need to be specifically real (the actual McLuhan, not a generated approximation; an actual photograph of a referenced book, not a generated rendering). License-checked, color-graded to match the production's style anchor, treated with motion (Ken Burns / slow push) like any other still.

**3. Generated visuals.** Used for atmospheres, moods, places that don't need to be specifically real, world-layer detail, and motifs. Where generation actually shines.

**4. Talking-head footage.** Out of scope for current production type. Reserved for future on-camera production type, not designed in current architecture.

### 9.2 B-roll substrate

Not all video uploads are vlogs. Some are visual material — slow-motion shots, atmospheric captures, the parking lot at 4am, the coffee on the dashboard. These should be ingested as B-roll substrate, not as content substrate.

**Auto-classification at upload.** Has speech (transcript yields content) → vlog. No speech → B-roll candidate. Vision model auto-tags B-roll on upload (subject, location, mood, motion, time of day, lighting quality, color palette, weather, season). Cost: a cent or two per video, trivial.

**Manual override.** The operator can mark uploads as B-roll explicitly, even if they have incidental speech. The operator can also write a sentence describing a B-roll asset to override or supplement the auto-tag, especially to mark *signature* shots — shots intended to recur as motifs.

**Usage tracked, not restricted.** Each B-roll asset has a usage count and a list of productions it's appeared in. The visual treatment system *prefers* less-used B-roll when scoring candidates (so fresh material rises naturally) but allows reuse when it's the right shot. Signature shots are explicitly meant to recur; the system embraces this rather than fighting it.

**The B-roll motivation loop.** When the operator sees their own footage in finished essays, they start filming differently. They notice potential B-roll in the world. They upload more. The library gets richer. Future essays improve. Feed-forward at the visual-capture muscle, mirroring the voice-capture loop.

### 9.3 The visual sequence (not a single image)

Each beat does not get one visual treatment. Each beat gets a **visual sequence** — a small ordered list of shots that explore one diegetic world together.

Example beat: *"the long drive home from the night shift"*. Visual sequence:

1. Wide shot — empty parking lot at 4am. World layer: frozen glove on asphalt, sodium lamp flicker, blurred Walmart sign deep background, one car running with windows fogged. Static hold.
2. Close-up — the frozen glove on the asphalt. World layer: ice crystals, asphalt texture, sodium light catching the leather. Slow push-in.
3. Medium shot — man in driver's seat, window cracked. World layer: cigarette smoke meeting cold mist, steering wheel catching light from above, dashboard reflection. Slow pan up to face.

The wide shot establishes. The close-up finds detail. The medium shot finds the human. Same parking lot, same night, same light, same color palette throughout. The world is fixed; the camera explores.

This is how documentary actually works. La Jetée. Errol Morris. Adam Curtis. The opposite of slideshow.

Sequence length: 2–5 shots per beat depending on beat length and weight. A 10-second beat gets 2 shots (wide and detail). A 25-second narrative beat gets 3–5 shots so it can breathe. Closing beats often want a single long held shot, no spinoff. The treatment role decides.

**Diegetic-world coherence is the rule.** Without it, generative models produce four unrelated shots that all sort of suit the beat, but the viewer's brain reads them as a slideshow because they don't cohere. With it, prompts share locked elements: same architecture, same time of day, same weather, same light register, same color palette. When all shots in a sequence share these, the brain reads them as one scene. The camera moved; the world didn't.

### 9.4 The production-level visual director

The visual treatment role doing beat-by-beat work cannot produce film pacing on its own. If each beat gets its sequence in isolation, the result is five parking-lot-quality scenes, all dense, all heavy, none breathing. Airless.

Solution: a `production_director` role that runs *before* beat-level treatment. It reads the full script and the full beat sequence and outputs a **visual rhythm map**:

- Which beats are establishing scenes (wide-and-detail sequences in a fixed world).
- Which beats are quiet single-held-image moments (one shot, long duration, no cuts).
- Which beats are montages (fast cuts across many shots, often across worlds).
- Which beats are counterpoint cuts (a single image that comments on the voiceover ironically — a moon, a lens flare, an empty room).
- Which beats return to motif (recurring visual elements that thread through the production).
- Which visual elements are this production's recurring motifs (the parking lot, the steering wheel, a specific kind of light, a book on a desk).

The production_director hands this rhythm map to the visual_treatment role, which fills in each beat *aware of its place in the production*. Result: film pacing instead of beat-by-beat density.

The production_director should be told to **design this as a silent film that the voiceover will sit on top of**. That single instruction reorients everything downstream. Visual sequences will build, breathe, pace themselves, occasionally just hold on a moon and let the voice carry. Mute test: if the muted production still feels like something — has rhythm, leads somewhere, feels like a film — it succeeded.

### 9.5 Editorial principles

These are rules the visual_treatment role and the production_director role both apply. Each is load-bearing.

1. **Never on-the-nose.** Don't visualize the beat literally. Visualize the mood, texture, or unstated subtext. Image is counterpoint or parallel, not translation. A beat about loneliness gets an empty diner booth at 3am, not a sad person.
2. **Hold longer than feels comfortable.** Cinematic editing tolerates stillness. A held shot under voiceover is more powerful than a cut every two seconds. Default to longer durations than content editing would suggest.
3. **World layer is deliberate.** Every prompt specifies what's in the background, not just the subject. The frame is composed; nothing is incidental. Kubrick wrote this into a production discipline; the system inherits it.
4. **B-roll preferred over generation when available.** Real footage carries documentary weight generation can't match. Generation is the fallback when no B-roll fits.
5. **Generation prompts are film shots, not illustrations.** Composition, focal length implied by description, lighting register, off-center subjects, available-light feel, atmospheric secondary motion. Never "an image of X." Always a specific shot of X with cinematographic intention.
6. **Black-and-white is a tool, not a default.** Some pieces or some beats benefit from monochrome treatment. The treatment role can call for it when warranted. Not the dominant register but available.
7. **Silence is allowed.** Beats can have visuals without voiceover. The film breathes between thoughts.

### 9.6 The visual prompt template

For generated visuals, the prompt structure that worked in CANOPTICON carries over with one addition for Neolog:

```
[SHOT TYPE]: [the visual subject and framing]
[ATMOSPHERE]: [mood, lighting, time of day, weather, season]
[STYLE]: [cinematographic anchor — short-documentary register]
[WORLD LAYER]: [what's in the frame the viewer won't consciously notice but unconsciously processes]
[NEGATIVES]: [no text, no logos, no faces with visible features, no fingers, no hands gesturing, plus production-specific negatives by beat role]
```

The world layer is the Neolog addition. Generated images default to literalism in the background — generic books on shelves, generic objects on counters. The world layer instruction pushes back: specify what's there, with the same intentionality as the subject. Sometimes more. The world layer carries subtext.

The style anchor for Neolog is roughly: *cinematic short-documentary, phone-and-DSLR-class footage shot with intention, available light, real-feeling locations, southern Ontario regional specificity, slightly imperfect composition that reads as real rather than staged, occasional film grain treatment.*

When a sequence is being generated, the wide shot is generated first as the **diegetic anchor**. Subsequent shots in the sequence inherit the anchor's specifics — same time, same weather, same light, same key elements visible at large scale. Reference-image conditioning (where the model supports it — Runway, Veo, Kling Multi-Shot Storyboard) is used to enforce consistency across the sequence.

### 9.7 The illustrative register (deferred)

A secondary visual register — illustrative, explanatory, possibly black-background-with-marker style for specific explanatory beats — was discussed and deferred. Not introduced in current scope. May be revisited after generated output from real productions is available to inform the choice. Until then, the cinematic short-doc register is the locked anchor for all visual treatment.

---

## 10. The motif system

Motifs are visual elements that recur — within a single production and across the body of work. They are deliberate, not accidental. They are part of how a body of work becomes a *body* rather than a pile of disconnected videos.

**Within-production motifs.** A specific kind of light, a recurring location, an object that returns at a slightly different angle in a later beat. The production_director identifies these in the rhythm map and threads them through. Adam Curtis does this constantly; it's why his work feels coherent across long runtimes.

**Body-of-work motifs.** Across all Neolog productions, certain elements recur and become part of the operator's visual signature. The operator's specific intersection. The car interior shot at certain times of day. A signature B-roll asset flagged for recurrence. Place specificity (southern Ontario, the actual Walmart sign deep background) operates at the body-of-work motif layer — viewers learn over time that this is a specific world, and that recognition becomes part of why people watch this operator and not someone else.

The motif system is consciously built. Motifs at the production level are tracked by the production_director. Motifs at the body-of-work level are tracked in a `motifs` table — operator-flagged or system-detected from repeated use. The visual_treatment role considers motif fit when scoring candidates: if a beat could use a motif shot without forcing, it should.

---

## 11. Performance feedback and prompt-pattern attribution

Neolog inherits CANOPTICON's performance feedback model with substrate-appropriate adaptations.

After publishing, performance metrics flow back per platform: views, opens, saves, shares, subscriber conversions, comments, retention curves where available. Pulled via APIs where supported, operator-reported where not.

**Per-production tier (A/B/C).** Each production is classified relative to the operator's baseline in the same format and approximate length and topic register. Not absolute numbers — relative to what's normal for this operator, this format, this topic.

**Per-prompt-pattern attribution.** Each beat in the script is tagged with the prompt-template that generated it (which version of the ideator prompt, which beat-role pattern, which style anchor). When productions tier well, the system attributes that performance back to the prompt patterns that produced them. Over time, the operator builds up a library of prompt patterns that work, and the ideator preferentially uses them in new productions.

The same applies to visual treatment patterns — which sequence structures, which world-layer styles, which motif placements, which pacing decisions correlate with strong-tier productions. The production_director and visual_treatment roles get weighted feedback the same way.

This is the loop closure. Without performance feedback, the engine produces; with it, the engine *learns* without the operator having to think about why.

---

## 12. Publishing — the multi-platform refraction

Once a production renders, the Publish tab shows it with platform options. Neolog publishes to YouTube, X, TikTok, Substack, occasionally Mastodon and Bluesky. Different formats per platform.

A single production can refract into multiple surfaces from the same source:

- A YouTube video essay (8–12 min)
- A TikTok or YouTube Short cut from the same source (60–90s)
- An X thread distilling the argument
- A Substack post that's the long-form written version
- A single-quote X post pulled from a key beat

All from one cluster, one ideator pass, one production. The recording happens once. The refraction is automatic. Platform-specific formatting is handled at the publish stage.

A `caption_writer` role generates per-platform descriptions — long-form for YouTube, hook-style for TikTok, single-line for X. Operator can edit each before scheduling. Cross-posting metadata records the URL on each platform back into the production record for performance attribution.

This refraction is part of Neolog's purpose, not a convenience feature. The operator has tried for fifteen years to build a public presence and has built and lost channels repeatedly. The previous failures came partly from running multiple platforms as separate channels with separate content. Neolog inverts this: one body of thought, refracted across surfaces, all linking back to the canonical production. The operator builds *one thing*; the platforms each get their appropriate slice.

---

## 13. The founder's-trap demo essay

The threshold deliverable. One production made through the full system, end to end, that proves the system works.

The earlier draft of this section named *vibe coding through voice / the oral renaissance* as the demo target. The extraction test (5, 6) revealed that material is thinner than expected — the operator's library has only a handful of vlogs touching this directly. It remains a strong future essay, possibly opening section of the demo or a follow-up production. But it is not the right first target.

The demo target is now the **founder's-trap cluster** — the multi-altitude articulation of *"the discipline isn't in the vision, it's in the restraint, and recognizing this in real time while building is the actual skill."* This cluster is documented in detail in 6.1.

### 12.1 Why this cluster is the right demo

- **Material is rich.** At least eight vlogs touch this cluster across late February through mid-March. Multiple altitudes of articulation (felt, recognized, principled, generalized, connected) give the script natural texture without relying on a single vlog carrying the weight.
- **It's voice-appropriate.** Developer / business / making-your-own-way / non-traditional career path is the operator's strongest territory. The voice profile from 3 lands here naturally — self-aware, slightly self-deprecating, breakthrough-oriented.
- **It's emergent, not imposed.** The thesis comes from material the operator already produced. The system isn't manufacturing an angle; it's surfacing one the operator was already articulating in pieces.
- **It tests the full stack.** Clustering across multiple vlogs (6). Extraction at all four layers (5). Script generation in operator's voice (8.2). The Reach made visible — beats that articulate what the operator was reaching for in the source vlogs but didn't quite land. Production-level visual director (8.4) designing a silent film of the building-process. B-roll prioritized (the workspace, the car, late nights, the screen). Generated visuals for atmospheric beats (an empty office at 4am, a single deleted file). Cinematic short-doc register held throughout.
- **Vibe-coding-through-voice fits inside it.** The voice-as-input-medium thread can be section 1, the open of the essay — *"For the past year I've been talking instead of typing. Vibe-coding through voice. And what I've found is..."* — and the founder's-trap thesis emerges as the body. This integrates the thinner material into the richer cluster naturally.

### 12.2 Tentative shape

Not a final spec — the ideator and clustering engine produce the actual structure when they run against the material — but a sketch of what success looks like:

- Open: voice-as-input-medium thread. Personal, specific, voice-rich. ~3-5 beats. Cinematic open with rack zoom on a parked car at night, hands on a steering wheel, the phone glowing on the dashboard.
- Body: the founder's-trap thesis emerges through the multi-altitude articulation. The same insight at felt, recognized, principled, generalized, connected altitudes. ~15-20 beats. Mix of operator B-roll (workspace, car, late nights), archival/reference visuals (briefly — Gary Vee mentioned, McLuhan implicit), generated atmospheric visuals for the abstract beats.
- Turn: a tension or self-surprise. The operator is building Neolog, which is a tool to fight the founder's trap, while *being* a founder caught in the trap. The recursion is the turn. ~3-5 beats with a held visual — possibly a slow zoom on the screen showing Neolog itself.
- Close: a beat that lands the principle as something the operator has earned through the work. ~3-5 beats. Closing shot held longer than feels comfortable.

Total length target: 25-30 beats, ~8-12 minute production at Mid-Fi tier.

### 12.3 What the demo will test

A successful demo passes these tests:

- **Clustering test.** The clustering engine surfaces this cluster from the substrate without operator hand-holding. The operator should be able to scroll Studio and see *"Founder's-trap thesis (8 vlogs, ready)"* as a candidate.
- **Extraction test.** The verbatim_pulls from source vlogs preserve voice texture. The Reach for each source vlog adds something the source didn't fully articulate. The Strong Opinions / claims layer doesn't sanitize.
- **Ideator test.** The script reads as the operator's voice — self-aware, slightly self-deprecating, breakthrough-oriented, profound — not as generic AI essay register.
- **Production_director test.** The visual rhythm is film-paced. Establishing scenes, quiet single-held beats, montage where appropriate, return to motif at the close. Mute test passes.
- **Visual treatment test.** Generated visuals match the cinematic short-doc anchor. No gravel. Diegetic-world coherence within sequences. World-layer detail in prompts. B-roll prioritized.
- **Voice test.** When the operator reads the script aloud, it feels like reading their own thought back to themselves, articulated better. The training-wheels effect grips.
- **Refraction test.** Production refracts cleanly into a YouTube essay (8-12 min), a Short (60-90s), an X thread, and a Substack post. All from one source.
- **Watch test.** The finished essay is would-watch-on-someone-else's-channel good. Not "good for an AI-assisted production." Good, full stop.

If the demo passes these, the system has crossed the threshold. The first production is shipped. Subsequent productions follow the same pipeline but the system has been validated. **Make this one essay. Make it well. Everything follows.**

### 12.4 What happens after the demo

Once the demo is shipped:

- The clustering engine has produced a real cluster, the ideator has produced a real script, and the production engine has produced a real film. Reconciliation work in 13 has been completed for the components needed.
- The performance feedback loop (10) starts collecting data on the published production. The first prompt-pattern weights begin to form.
- The vibe-coding-through-voice thread, if it was the open of the demo, has been partially explored. A follow-up production focused entirely on it becomes the natural next target.
- The operator's daily vlogging continues. New material flows into the substrate. The clustering engine surfaces the next candidates.
- The first body-of-work motifs are established. Future productions inherit them.

The demo is not a one-off proof. It is the first production in a continuing body of work. Every architectural decision in this document should be evaluated against whether it accelerates the operator from "first production shipped" to "tenth production shipped" without the system getting in the way.

### 12.5 The next major demo target — deliveries-and-pace

The founder's-trap demo is the *technical-validation* demo: material exists, voice is appropriate, audience is real (founders, builders, developer-business types), but it is somewhat inside-baseball. The audience is a slice.

The *real-bet* demo is the deliveries-and-pace cluster, which is a riff in formation as of this writing. The operator is currently doing food deliveries to fund all of this work and has begun riffing on:

- The AI-and-the-job-market context (real, current, widely felt)
- Side-hustling-to-fund-passion-projects (universal, accessible)
- The slow-pace-as-strategy choice (deliveries-over-rideshare specifically because deliveries leave room for thinking, voice-coding, and the gaps between drop-offs that the work depends on)
- Self-designed work-life shape vs. inherited work-life expectations
- The millennial-loaner-driving-around-talking-to-AI-all-day texture (with the self-aware comedy we identified in the voice profile)

This riff has all the markers of a strong production: personal stakes, universal resonance, self-aware comedy potential, breakthrough quality, connection to other riffs (vibe-coding-with-voice happens *in the car*, *because of the deliveries*), and the operator is committing to articulating it deliberately ("I'm gonna start talking about that"). The material will accumulate naturally over the coming weeks as the riff cooks.

This is the demo that tests the system at its actual purpose — not technical validation but real-bet production. The audience for this is much larger than the audience for founder's-trap. Topics about the lived experience of the gig economy, AI's effect on work, and self-designed working lives have major cultural moment in 2026. The operator's specific angle (driving for a delivery app while building software with voice while studying McLuhan) is genuinely distinctive.

The order is:

1. Founder's-trap demo first. Material exists; technical validation is the priority; ship to verify the system works end-to-end.
2. Deliveries-and-pace second, made through the system once the riff has cooked (likely 10-20 vlogs over several weeks). This is where the system stops being a technical proof and starts being the actual return-to-work mechanism the operator built it to be.

A key principle: the deliveries-and-pace riff also includes vlogs *about the development of Neolog itself*, including conversations with Claude about Neolog's design. The meta-layer — the operator vlogging about building the system that processes the vlogs — is part of the substrate. The system should treat its own development as material, because it is. This is not a special case requiring special handling; it is the substrate working as designed.

---

## 14. Reconciliation with the existing codebase

This section is the handoff point. The document above specifies what Neolog does; the existing Neolog codebase is what Neolog plugs into. Claude Code reads the architecture, integrates with what exists, and adapts. No arbitrary build phases or deadlines are baked into the spec — Claude Code decides sequencing based on dependency order and integration realities.

**Current state of Neolog (what's there before work begins):**

- Working vlog ingestion (multipart R2 upload, Inngest event pipeline)
- Working audio extraction (Replicate fofr/toolkit), HEVC transcode for DJI files
- Working AssemblyAI / Groq Whisper transcription with word-level timestamps in `transcript_words` table
- An existing extraction pipeline producing thirty-four fields per vlog in a single Claude Haiku call to `video_uploads.analysis` (JSONB). Of these thirty-four fields, twelve are surfaced in the Timeline UI; twenty-two are extracted and never displayed. Schema includes productivity-tracker fields (action_items, decisions, blockers, goals, commitments, habits, values_expressed, lessons_learned) that do not serve the production pipeline. **This entire extraction layer is being replaced by the thread-based extraction specified in 5, plus the parallel passes specified in 7.4.15 (clip detection) and 7.4.16 (creative-mode extraction). The replacement is not incremental patching; it is a full rewrite of the extraction prompts and schema.**
- Working entity extraction with deduplicated `entities` table and `entity_mentions` table
- Working post suggestions to `social_queue` table (status='suggested') — this gets reworked entirely as part of the x_post pipeline (7.4.14)
- Working Timeline view (chronological vlog list with extractions visible) — **must be redesigned to be thread-shaped per 6.1.6 rather than vlog-shaped**
- Existing **Studio page** — broken. Shows individual vlogs as "sessions" with BEGIN buttons. The session cards are tied to the old extraction schema and stop working the moment extraction is rewritten. Page is being redesigned to be the deliberate-work mode reached from Surfaced · Cluster ready cards on Timeline (see 4.5.4). Full teardown and rebuild required.
- Existing **Edit page** — broken. Currently advertises *"AI picks your best moments across all vlogs and assembles them into a finished video"* with a topic-input flow that does not work. **Page is being deprecated.** Clip candidates surface as Clip-type cards on the Timeline (see 4.5.2). The clip pipeline (detection logic and clip-candidate node generation) remains per 7.4.15, but its operator surface is the Timeline, not a dedicated page.
- Existing **Posts page** — broken. **Page is being deprecated.** X post and x_thread candidates surface as Post-type cards on the Timeline (see 4.5.2). The x_post pipeline (detection logic, candidate generation) remains per 7.4.14, but its operator surface is the Timeline, not a dedicated page.
- Cloudflare stack, Supabase, ~150 vlogs / 171 sessions in the database

**The application surface is being redesigned, not just patched.** The substrate (database, vlog ingestion, transcription, entity graph) stays. Everything above the substrate is being redesigned: extraction, all production pipelines, all operator-facing pages. The current Studio, Edit, and Posts pages are broken because the model behind them was never properly designed; patching them individually misses the point. The redesign is comprehensive.

**What this document specifies, organized by area:**

**Substrate and intelligence layer (5–6.3):**

- **Extraction layer rewrite** — thread-based atom (5.1–5.7), connection graph (6.1.8), entities continue (5.9). The thirty-four-field schema is replaced with the thread-based schema. Sonnet-class prompt, prompt-versioned for performance attribution.
- **Threads table** — new schema, joined to vlogs by vlog_id, includes abstracted_topic for cross-vlog clustering.
- **Connection graph** — new. Lazy connection pass after thread extraction proposes edges based on abstracted_topic similarity. Stored in a thread_connections table.
- **Clustering engine** (6.1–6.3) — new. Operates on threads, not vlogs. Cluster data structure simplified per 6.3.

**Production type taxonomy (7.4):**

- **Multi-output architecture** (7.4.0) — six production types, all surfaced as cards on the Timeline (4.5). video_essay, article, x_post, x_thread, clip, creative_work.
- **video_essay pipeline** (7.4.1–7.4.12) — primary build target, most architecturally complete. Cultivation lifecycle, voice profiles, forms, default and forensic modes, script generation, recording, production.
- **Post-production handling** (7.4.12.1) — materialized state, follow-up clusters after produced. Handles the *"new vlogs on a topic that's already produced"* case.
- **Macro-clusters** (7.4.12.2) — meta-synthesis across produced work. Synthesis essays, retroactive umbrellas, missing essays, cross-domain synthesis.
- **Article pipeline** (7.4.13) — same intelligence layer as video_essay, written prose output. Crystal Ford voice profile by default. Lower friction than video essay. Surfaces as Article-type cards on Timeline.
- **x_post and x_thread pipelines** (7.4.14) — fast-friction social outputs. Per-thread surfacing and per-cluster companion drops. Surface as Post-type cards on Timeline.
- **Clip pipeline** (7.4.15) — separate detection pass for delivery quality. Surfaces as Clip-type cards on Timeline. Different unit (delivery moments) from threads.
- **Creative_work pipeline** (7.4.16) — parallel pipeline for fictional/creative material. Projects as containers, generative video production engine, eventual handoff to Aldershot. Architecturally specified, detailed implementation deferred.

**Operator-facing surfaces:**

- **Timeline** — the heart. One feed of heterogeneous cards (vlogs, threads, posts, clips, articles, project updates, surfaced cards), filterable by type, sorted by recording date with backdating honored. Replaces the previous Posts page, Edit page, and Live feed. See 4.5.1 and 4.5.2 for full taxonomy.
- **Studio** — deliberate-work mode. Cluster detail view reached by tapping Surfaced · Cluster ready cards on Timeline, or via the Studio dock entry which shows a focus list of ripening / ready clusters. CANOPTICON-style living-threads vibe at Neolog scale. See prototype HTML for visual treatment.
- **Graph view** — direct navigable rendering of the substrate. New build.
- **Projects** — creative_work container surface per 7.4.16. New build.
- **Settings / System** — utility surfaces. New build.
- **Capture** — global record / upload affordance reachable from any surface. Manual backdating prompt for material without recording-date metadata.

The previous-spec surfaces *Posts page*, *Edit page*, and *Live feed (light)* are deprecated. Their content lives as card types on the Timeline.

**Cross-pipeline infrastructure:**

- **Operator profile / identity context** — new persistent store. See 8.2.2.
- **Voice profile system** — new. See 7.4.8. Library, import/export, UI for selection at materialization, ideator consumption.
- **Adjacent-insight feed (bounce)** — new. Fires during ripening. Returns commentary/frameworks (default mode) or evidentiary material (forensic mode candidate). Triggered by cluster's questions_raised.
- **Mode activation logic** — new. See 7.4.4.
- **Production engine** (section 8) — describes video_essay pipeline. Six-state model, beat decomposition, recording overlay, ffmpeg pipeline.
- **Capture surface with intent declaration** — new. Record / upload affordance that supports vlog mode, B-roll mode, voice memo, screen capture, and reference-material upload. Manual backdating prompt for material without recording-date metadata. See 4.5.8.
- **B-roll handling** — new classification logic; B-roll library separate from vlog uploads. Auto-classification at upload (no speech → B-roll candidate) plus explicit operator flagging. The operator marks B-roll manually when auto-classification is uncertain. See 4.5.8 and 9.2.
- **Visual treatment system** — new build. Cinematic short-doc engine. Operates uniformly across video_essay and creative_work generative beats.
- **Production_director and visual_treatment roles** — new Claude Skills.
- **Performance loop** — new build, lower priority.

**Claude Code's first task is the reconciliation report.** Read this document end-to-end. Compare against the actual repo. For each major area (extraction, intelligence layer, each production pipeline, each operator-facing surface), report what exists, what is partial, and what is missing. The report informs Claude Code's own sequencing decisions. No build phases prescribed in this document.

**Dependency observations** (for Claude Code's sequencing reference, not as constraints):

- Most of the production pipelines (video_essay, article, x_post, x_thread) depend on extraction → threads → connection graph → clustering. These are upstream of the production work.
- Clip pipeline is independent of clustering (operates on its own detection pass) and could ship in parallel with the analytical pipeline build.
- Creative_work pipeline depends on the generative video stack (Flux, Veo, Kling, Wan2.1 VACE) maturing and on Aldershot's production engine being in place. Architecturally specified now; detailed implementation deferred.
- The Timeline surface depends on extraction producing thread-shaped cards and on at least one production type being functional enough to produce Post / Clip / Article cards. The Timeline can ship before clustering is fully online — it just shows fewer card types in the early state.
- The Studio surface depends on clustering + cultivation + at least one production type (video_essay or article) being functional.

**The thirty-four-field extraction schema in the current codebase is the largest single blocker on getting good output.** Replacing it with the thread-based schema (and the additional clip-detection and creative-mode passes) is the work that makes everything else possible. Until extraction produces clean atomic units across all three modes (analytical threads, clip candidates, creative elements), no amount of downstream prompting will produce outputs the operator wants to ship.

---

## 15. Stack summary

For Claude Code reference:

- **Substrate, productions, beats, recordings, edits:** Cloudflare D1 (SQLite). Sequential IDs or text UUIDs. `state` enum drives Studio tab placement. Append-only on recordings (retakes are new rows, old rows flagged superseded).
- **Audio recording on phone:** native browser MediaRecorder API, captured per beat as separate WebM/MP4 files, uploaded to R2 via presigned URLs. Per-beat URI stored on the `beats` row.
- **Frontend:** Next.js 16 deployed via `@opennextjs/cloudflare`.
- **Background orchestration:** Cloudflare Workflows for async pipeline management. Cloudflare Queues for notifications and cleanup.
- **ffmpeg pipeline:** runs server-side in a Cloudflare Container worker. Stitch, trim, normalize, caption-align, render. Triggered by state transition Recording → Producing.
- **Forced alignment for captions:** `aeneas` or similar Python library — takes script text plus audio, returns word-level timings.
- **Transcription:** AssemblyAI (already integrated).
- **Voice cloning:** ElevenLabs (for cases where the operator wants the system to read instead of recording, though Neolog's primary path is operator-recorded voice).
- **Image generation:** Pluggable. Current state-of-the-art models per tier: Lo-Fi cheap fast model, Mid-Fi mid-tier, Hi-Fi best available. Pipeline is model-agnostic; what matters is prompt structure.
- **Video generation for opens/closes/key turns:** Pluggable. Reserved for select beats per Hi-Fi tier. Not used per-beat per cost.
- **Visual quality scoring:** Claude with vision input — pass the candidate image plus the beat text and the world-layer spec, return a structured score. Cheap, accurate enough.
- **Visual treatment renderer:** custom layer in the ffmpeg pipeline. Composites still images plus motion (Ken Burns / pan / fade), overlays text cards and citation chips where applicable, syncs to beat duration.
- **Caption rendering:** burn into video for shorts; sidecar VTT for long-form so platform captions can be turned off.
- **Publishing APIs:** per-platform official APIs where available, with platform-specific workers behind a unified `publish(production, platform, schedule)` interface.
- **Performance ingestion:** scheduled jobs pull metrics per platform; operator-reported values via a simple form for platforms without APIs.
- **Performance attribution to prompts:** beats are tagged with prompt-template versions at generation time. When perf tier is computed, the tag chain becomes the attribution path. Stored in a `prompt_pattern_perf` table.
- **AI roles as Claude Skills.** `production_ideator`, `production_director`, `visual_treatment`, `visual_concept`, `visual_quality`, `caption_writer`, `coherence_check`, `production_suggester` — each lives at `/skills/{role}/SKILL.md`. Each is a prompt template invoked by orchestrator code at state transitions.

---

## 16. Anti-patterns

Things Claude Code should *not* do, even if they seem reasonable in the moment:

- **Do not preserve the existing thirty-four-field extraction schema.** It is replaced by the thread-based extraction in section 6. The current schema mixes productivity-tracking, journaling, idea-capture, and entity-linking into one over-specified blob, and twenty-two of its fields are extracted but never surfaced. Replacement is full, not incremental.
- **Do not generate per-beat visual content as video by default.** Generated video is currently expensive, slow, and inconsistent. Stills + motion is better than slow expensive video for most beats. Reserve generated video for opens, closes, and a handful of tentpole turns per Hi-Fi production.
- **Do not re-transcribe audio for captions.** Forced alignment of canonical script text against recorded audio gives word-level timings without hallucination.
- **Do not build a multi-agent ideation system.** One role, one prompt, iterate the prompt. Multi-agent handoffs burn tokens and don't produce better output at this scale.
- **Do not reach for a managed video-editing API.** ffmpeg handles the operations needed. The problem shape is too specific for a managed service to fit cleanly.
- **Do not visualize beats literally.** On-the-nose visuals are the single biggest failure mode for AI-assisted video. Counterpoint or parallel; never translation.
- **Do not let the visual style anchor drift.** Cinematic short-documentary is locked. Generated visuals across a production must match the anchor; don't let the model pull toward stock-photo-realistic, illustration, or generic-AI aesthetics.
- **Do not collapse B-roll into vlogs.** B-roll is its own substrate type. Mixing them confuses extraction (B-roll isn't content) and cripples visual treatment (vlog footage isn't usable as B-roll without manual extraction).
- **Do not auto-publish without operator review.** The publish tab is operator-gated. The system can pre-stage everything; the human commits.
- **Do not introduce camera-on production paths in current scope.** Future product. Don't anticipate it in current architecture.
- **Do not fragment the doc.** This document is canonical. Sub-documents may be added later for things that need their own depth. Until then, this is the single source of truth. New design decisions go into this document, not into ad-hoc files.
- **Do not override the riff-first clustering design with "smarter" abstract clustering.** The clustering engine's primary job is recognizing riffs as they form (7.1.1) — clusters of threads with the same abstracted_topic accumulating across vlogs. A future agent who tries to make clustering more "intelligent" by surfacing hidden cross-thread connections before solving riff-recognition is solving the wrong problem first.
- **Do not sanitize voice in extraction outputs.** The single most important rule (5.7). The thread's `take` and `key_quotes` preserve operator voice — profanity, hesitations, half-formed reaches, conversational texture. The script generator reads these in their preserved form. Sanitization here means scripts come out in LinkedIn-post register. Fatal failure mode.
- **Do not force fields in extraction.** If a thread has no questions_raised, return an empty array. If a thread has no clear take, mark take as null and register as observation. The extraction prompt errs on fewer high-quality fields, not many low-quality ones. Empty arrays are acceptable.
- **Do not put the operator at the center of video essay scripts.** The operator-as-source principle (7.4.6.1) is load-bearing. The operator's vlogs identified the topic; the operator's voice colors the prose; the script is *about* the topic, not about the operator's experience of the topic. Personal-arc-style framing was removed from the form taxonomy because it kept producing vlog-shaped scripts when the operator wanted essay-shaped scripts.
- **Do not assume vlogs arrive randomly distributed.** They arrive in riffs. Architecture, extraction prompts, and clustering logic all assume riffs as the dominant input pattern (3, 6.1.1).
- **Do not let the ideator default to LLM-generic essay register.** The single most common failure mode in AI-assisted scripts. Specific anti-patterns the ideator must reject (8.2.3): aphoristic-insight-construction in LLM default style ("the discipline isn't in X, it's in Y"; "what looks like X is really Y"; "not A but B"; "dressed up as"); falsely-balanced rhetorical structures; building-to-a-thesis structure when the form is rant or probe; coined-phrase landings that summarize the essay's argument in a tweetable line; sanitization of operator profanity, hesitations, fragmentary phrasings, looping returns. If a sentence in the generated script could appear in a thousand other generic essays without surprising anyone, it does not belong.
- **Do not generate scripts from thread takes only.** The ideator must receive full transcripts of source vlogs alongside the cluster object (8.2.1). Without full transcripts, scripts come out as Greatest Hits Compilations of punchy quotes connected by generic essay tissue. The connective cadence — the way the operator builds a thought, returns, loops — lives in the transcripts.
- **Do not generate scripts without identity context.** The ideator must have access to the persistent operator profile (8.2.2) — voice signals, life arc, current life context, accumulated riffs.
- **Do not let one ideator template serve all forms.** Concept-essay, manifesto-rant, reflection, cultural-criticism, and probe forms each require different ideator behavior (8.2.4). Same model, same call, different prompt template per form. Conflating forms produces scripts that have the wrong relationship to the source material.
- **Do not produce scripts the operator must heavily edit to use.** Near-zero-friction at script approval (3) is as load-bearing as zero-friction at input. Voice preservation, verbatim ratio enforcement, form-specific prompting, and the coherence-check voice test are all in service of this principle.

---

## 17. Open questions

Conscious unknowns to resolve as work progresses. Several earlier open questions have been resolved through the extraction rewrite (5) and the clustering engine spec (6); those are removed from this list.

- **Push threshold.** The clustering engine surfaces production candidates via push notifications. The exact threshold for push (how many thread connections must converge, what take-strength score, what time-since-last-production weight) is to be tuned empirically once real clusters start surfacing. Initial implementation should err on the side of fewer pushes — better to surface a handful of strong candidates per week than many weak ones.
- **Bounce specifics.** Bounce is specified in 5 and 6.5.1 as triggered by cluster questions_raised. What allowed_domains list, what cost ceiling per cluster, what model — to be decided when the first cluster requires bounce. Likely Sonnet plus web_search with a per-cluster cost ceiling around $1-2.
- **Abstraction reliability.** Section 6.1.8 acknowledges that the abstracted_topic step is the most failure-prone part of extraction. Whether it works in practice — whether threads about different surface topics actually cluster correctly when they share abstracted forms — needs to be tested against real vlog material. Fallback is to cluster on surface-topic match only, losing cross-topic resonance but gaining reliability.
- **Thread granularity.** A vlog where the operator riffs on the YouTube algorithm for 8 minutes might extract as 1 thread or as 4 (For You page, static refresh, historical era, metric structure). Both could be right. The right granularity depends on whether sub-thread clustering produces useful resonance or just noise. To be tuned empirically.
- **B-roll vision tagging cost profile.** Auto-tagging B-roll uploads with a vision model is specified in 8.2 as cheap. Actual per-asset cost depends on model choice. To be measured during initial implementation.
- **Illustrative visual register.** Deferred per 8.7. To be revisited when generated output from real productions is available to inform the choice.
- **Voice clone use cases.** ElevenLabs integration exists for cases where the operator wants the system to read instead of recording. Primary path is operator-recorded voice (per 3, voice is the strongest attribute and the system plays to it). Voice-clone use cases — likely "letters from the past" reading old vlog material in the operator's voice, or rapid-publish fillers — to be designed when the need surfaces.
- **The vibe-coding-through-voice essay's place.** Likely opening section of the founder's-trap demo (12), but possibly a follow-up production. To be decided during ideator work on the demo.

---

## 18. Reading order for new agents

Claude Code or any future Claude session opening this document for the first time:

1. Read this document end to end before doing anything.
2. Read the CANOPTICON production engine handoff document (`/docs/canopticon-production-handoff.md` or wherever it lives) for additional detail on the production engine architecture that this document inherits and adapts.
3. Run a reconciliation pass: compare what this document specifies against what exists in the Neolog codebase. Produce a report listing per-section what exists, what is partial, what is missing.
4. Do not write new code until the reconciliation report exists and the operator has reviewed it.

---

*End of first pass. Sections marked deferred or open will be filled in after the extraction test against real vlog material. Document is iterative and expected to evolve through use.*
