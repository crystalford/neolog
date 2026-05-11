-- Neolog — initial prompt seed.
-- Applied by the bootstrap workflow after db/schema.sql.
--
-- Every extraction call reads its prompt from the `prompts` table by
-- (name, is_active = 1). When iterating, insert a new version row and
-- toggle is_active. Output rows reference extraction_prompt_version so
-- attribution is preserved across iterations.
--
-- This seed sets v1 of each named prompt. The bodies are deliberately
-- iterated against real vlog material rather than perfected up front
-- (per CLAUDE.md: "iterate prompts on incoming vlogs as they arrive —
-- no gold set, no batch re-runs").

-- ─── Analytical pass ────────────────────────────────────────────────────────
-- Produces thread rows: topic, take, key_quotes, questions_raised, register,
-- strength, abstracted_topic. Voice preservation hard rule enforced in code
-- after the response returns.

INSERT OR IGNORE INTO prompts (id, name, version, model, body, is_active, notes)
VALUES (
  'p_thread_extraction_v1',
  'thread_extraction',
  'v1',
  'claude-sonnet-4-6',
  'You are extracting threads from a vlog transcript. A thread is a coherent stretch where the operator is working out one topic.

A vlog can produce ONE thread, MULTIPLE threads, or ZERO threads (if it''s just a check-in or aside). Return an empty array if nothing is thread-shaped.

For each thread you find, extract these six fields:

  topic            One specific sentence describing what this thread is about.
                   GOOD: "The YouTube For You page recommends the same five clips no matter how I refresh."
                   BAD:  "Thoughts on YouTube."

  take             The operator''s position in their own voice. The sharp version of what
                   they''re saying. Preserves voice — profanity, hesitations that carry
                   meaning, conversational texture. NEVER paraphrase into LinkedIn-essay
                   register. If the thread is purely descriptive (no position), use null.

  key_quotes       1-3 verbatim phrasings from the source. Each is an object:
                     { "text": "<exact words>", "start_time": <seconds>, "end_time": <seconds> }
                   Voice preserved. Filler words (uh, um, you know) can be lightly cleaned
                   but rephrasing is forbidden.

  questions_raised Questions the operator actually asked. Array of strings. Empty if none.

  register         One of: "riff", "observation", "argument", "story", "aside", "question".

  strength         1-5. Conservative. A thread is strength 5 only with a clear take, two or
                   three strong quotes, and developed line of thought. Most threads are 2-3.

  abstracted_topic The underlying pattern this topic represents — for cross-vlog clustering.
                   "The YouTube For You page" + "Twitter algorithm" both abstract to
                   "recommender systems failing despite explicit user signals". Be careful
                   here; this drives later cluster formation.

  transcript_span_start, transcript_span_end
                   Seconds in the source vlog where this thread is.

Voice preservation rule (mandatory):
  - DO NOT sanitize. Profanity stays. Hesitations that carry meaning stay.
  - DO NOT paraphrase into clean essay register.
  - The take and at least one key_quote MUST contain a verbatim 4+ word substring from
    the source transcript. Failed runs are rejected by the writer.

Return JSON:
{ "threads": [ { topic, take, key_quotes, questions_raised, register, strength,
                 abstracted_topic, transcript_span_start, transcript_span_end } ] }

If the vlog has nothing thread-shaped: { "threads": [] }',
  1,
  'Initial version. Iterate from incoming vlog feedback.'
);

-- ─── Clip-candidate pass ────────────────────────────────────────────────────
-- Different signal from threads. Finds delivery moments — places where the
-- operator nailed a self-contained segment cleanly.

INSERT OR IGNORE INTO prompts (id, name, version, model, body, is_active, notes)
VALUES (
  'p_clip_candidate_extraction_v1',
  'clip_candidate_extraction',
  'v1',
  'claude-sonnet-4-6',
  'You are scanning a vlog transcript for clip candidates. A clip is NOT a thread — it''s a delivery moment where the operator nailed a self-contained segment cleanly. 30-90 seconds typically.

You''re looking for the intersection of:
  delivery_clean    The operator''s speech is clear, energy is consistent, no stumbling
                    over the line they''re landing.
  take_landed       The take they''re making in this stretch is fully formed — not a
                    setup or a half-thought.
  self_contained   The segment makes sense pulled out, without the surrounding context.
  energy_right     The operator''s energy is dialed in for the content — not flat, not
                    overcooked.

For each candidate, return:
  start_time        seconds
  end_time          seconds (typically 30-90s after start)
  headline          5-8 word summary
  quote             the take, verbatim from the segment
  why_clippable    array of the four signals above this segment hits — at least 2

Be conservative. Most vlogs have 0-2 clip candidates. A vlog can have zero.
Don''t force a clip out of mediocre material.

Return JSON:
{ "clip_candidates": [ { start_time, end_time, headline, quote, why_clippable } ] }',
  1,
  'Initial version.'
);

-- ─── Creative-mode pass ────────────────────────────────────────────────────
-- Most vlogs return empty here. Only fires when the vlog contains fictional /
-- creative material destined for a project (Pack Rats, Mechanical Bride, etc).

INSERT OR IGNORE INTO prompts (id, name, version, model, body, is_active, notes)
VALUES (
  'p_creative_extraction_v1',
  'creative_extraction',
  'v1',
  'claude-sonnet-4-6',
  'You are scanning a vlog transcript for fictional or creative material — character beats, scene fragments, dialogue, themes, settings, tonal references, plot fragments.

MOST VLOGS HAVE NONE OF THIS. Return an empty array unless the operator is clearly working out creative material (not analyzing topics, not riffing on industries, not journaling about life).

For each element, return:
  element_type    one of: character_beat, scene_fragment, dialogue, theme, setting,
                  tonal_reference, plot_fragment
  content         the actual material (a beat, a piece of dialogue, a theme statement)
  register        tonal anchor (one word: e.g. "melancholic", "deadpan", "noir")
  transcript_span_start, transcript_span_end   seconds

Return JSON:
{ "creative_elements": [ { element_type, content, register,
                           transcript_span_start, transcript_span_end } ] }

If nothing creative is happening: { "creative_elements": [] }',
  1,
  'Initial version.'
);

-- ─── Entity extraction ─────────────────────────────────────────────────────
-- Runs alongside the three content passes. Linked to threads via timestamp overlap.

INSERT OR IGNORE INTO prompts (id, name, version, model, body, is_active, notes)
VALUES (
  'p_entity_extraction_v1',
  'entity_extraction',
  'v1',
  'claude-sonnet-4-6',
  'Extract named entities from this vlog transcript. Seven types:

  person       real human beings the operator names
  place        cities, regions, specific locations
  project      named projects the operator references (Neolog, Drophead, CANOPTICON, etc.)
  tool         software / hardware named explicitly (Claude, FFmpeg, DJI, etc.)
  concept      named concepts / frameworks / terms the operator is engaging with
  theme        recurring abstract subjects (loneliness, gig economy, AI labor, etc.)
  reference    books, podcasts, articles, films cited by name

For each mention, return:
  name              canonical name of the entity
  entity_type       one of the seven above
  mention_text      the exact phrase used in the transcript
  mention_time      seconds offset where mentioned
  confidence        0-1, your confidence this is a real reference

Dedupe within the response. If the operator mentions "Mark Carney" five times, return
one entity with mention_count or list mentions separately — return one mention per
occurrence so the join in entity_mentions captures the surface phrasings.

Return JSON:
{ "entities": [ { name, entity_type, mentions: [ { mention_text, mention_time, confidence } ] } ] }',
  1,
  'Initial version.'
);
