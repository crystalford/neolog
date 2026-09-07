/**
 * Documents — every made thing, in one shape.
 *
 * `writing.html`: "a document is a document · **kind and who-made-it are
 * fields**". An essay, a report, a repository, a produced video, a
 * voice-over, a deck, a design and an export differ in those two fields and
 * in what the body points at. They do not differ enough to be eight tables.
 *
 * ── Whole. Never split. ──────────────────────────────────────────────────
 *
 * This is the rule that makes a document a different thing from a paste.
 *
 * `src/lib/split-note.ts` splits a recollection INTO dated entries, because
 * that is what a recollection is for — the document stays and the entries
 * point back into it. A finished piece of writing is the opposite: it was
 * made to be read whole, and cutting it into lines destroys the thing. So
 * nothing in this file calls the splitter, and a document shows on the feed
 * as ONE entry saying it was made.
 *
 * ── Above the fence ──────────────────────────────────────────────────────
 *
 * "A document you made yourself is the one kind of made thing that crosses
 * to public untouched — no reading, no reduction, no draft. The log's only
 * mark on it is the date and the drafts."
 *
 * So publishing a document does not run it through anything. `made_by` is
 * disclosed on the page and travels into the export, which is the whole of
 * the log's claim about it.
 *
 * A letter the log drafted in his voice is a different thing and stays below
 * the fence (`letters.html`). Nothing here drafts.
 */

import { findMany, findOne } from './d1'
import type { D1Database } from '@cloudflare/workers-types'

/** The eight kinds `writing.html` names, and nothing else until one is needed. */
export const DOC_KINDS = [
  'essay', 'report', 'code', 'produced_video', 'voice_over', 'deck', 'design', 'export',
] as const
export type DocKind = typeof DOC_KINDS[number]

export const DOC_WORDS: Record<DocKind, { name: string; body: string }> = {
  essay:          { name: 'an essay',          body: 'the text' },
  report:         { name: 'a report',          body: 'the text' },
  code:           { name: 'a repository',      body: 'the README' },
  produced_video: { name: 'a produced video',  body: 'the video' },
  voice_over:     { name: 'a voice-over',      body: 'the audio and its transcript' },
  deck:           { name: 'a deck',            body: 'the slides' },
  design:         { name: 'a design',          body: 'the files' },
  export:         { name: 'an export',         body: 'the document' },
}

/**
 * Who made it — a field on the row, disclosed on the page and in the file.
 *
 * `writing.html` lists exactly these on its table of made things, and the
 * distinctions are not decorative: "Claude drafted · you kept" is a
 * different claim from "you, with Claude Code", and both are different from
 * "you". The log never guesses which; it is set when the document is made.
 */
export const MADE_BY = ['operator', 'operator_with_log', 'log_drafted_kept', 'log'] as const
export type MadeBy = typeof MADE_BY[number]

export const MADE_BY_WORDS: Record<MadeBy, string> = {
  operator: 'you',
  operator_with_log: 'you, with the log',
  log_drafted_kept: 'the log drafted it, you kept it',
  log: 'the log',
}

export function asKind(v: string | null | undefined): DocKind {
  return (DOC_KINDS as readonly string[]).includes(v || '') ? (v as DocKind) : 'essay'
}
export function asMadeBy(v: string | null | undefined): MadeBy {
  // Unknown resolves to the log, not to him. Claiming he wrote something is
  // the wrong direction to be wrong in — the same shape as every other
  // default in this repo.
  return (MADE_BY as readonly string[]).includes(v || '') ? (v as MadeBy) : 'log'
}

/** Words, counted the way a writer counts them. */
export function wordCount(body: string | null | undefined): number {
  const t = (body || '').trim()
  return t ? t.split(/\s+/).length : 0
}

/**
 * The one line a document shows as on the feed.
 *
 * SPEC §1: every line is a sentence with a subject doing something. A title
 * on its own is not one, so the line says what he did with it and the title
 * sits inside the sentence.
 */
export function documentSentence(kind: DocKind, title: string, madeBy: MadeBy): string {
  const t = title.trim() || 'something'
  if (madeBy === 'operator') return `Wrote ${DOC_WORDS[kind].name}, “${t}”.`
  if (madeBy === 'operator_with_log') return `Made ${DOC_WORDS[kind].name}, “${t}”, with the log.`
  if (madeBy === 'log_drafted_kept') return `Kept ${DOC_WORDS[kind].name} the log drafted, “${t}”.`
  return `The log made ${DOC_WORDS[kind].name}, “${t}”.`
}

export interface DocumentRow {
  id: string
  kind: string
  title: string
  body: string | null
  body_url: string | null
  made_by: string
  status: string
  word_count: number
  draft_count: number
  page_id: string | null
  entry_id: string | null
  visibility: string
  published_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface Draft {
  id: string; n: number; body: string | null
  word_count: number; note: string | null; created_at: string
}

export async function loadDocument(
  db: D1Database,
  operatorId: string,
  id: string,
): Promise<{ document: DocumentRow; drafts: Draft[] } | null> {
  const document = await findOne<DocumentRow>(
    db,
    `SELECT id, kind, title, body, body_url, made_by, status, word_count,
            draft_count, page_id, entry_id, visibility, published_at,
            finished_at, created_at, updated_at
       FROM documents
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operatorId,
  )
  if (!document) return null

  // Newest first — the current draft is the one at the top, and every one
  // below it is still there.
  const drafts = await findMany<Draft>(
    db,
    `SELECT id, n, body, word_count, note, created_at
       FROM document_drafts
      WHERE document_id = ? AND operator_id = ?
      ORDER BY n DESC
      LIMIT 100`,
    id, operatorId,
  )
  return { document, drafts }
}
