/**
 * Correspondence — the one kind on the log with someone else in it.
 *
 * `messages.html`: "Everything else here is yours to keep and yours to
 * publish. A conversation isn't — half the words belong to the other person.
 * So this kind works differently from every other: **your side is yours;
 * their side is kept, attached to them, and never crosses to public on your
 * say-so alone.**"
 *
 * ── The three rules, and where each one is enforced ──────────────────────
 *
 * **Forwarded, never pulled.** The log does not read an inbox. A thread
 * arrives because he pasted it. There is no connector here and there is not
 * going to be one: "every conversation on it is one you chose to bring in,
 * because every one has another person in it." The absence of an ingest
 * connector IS the enforcement.
 *
 * **Two owners, one thread.** His messages become entries under the normal
 * rules. Theirs never do — `splitThread` marks the side, and only the
 * operator side is ever handed to the entry writer. An entry carries
 * `author='operator'`; putting another person's sentence behind that flag is
 * the same category of lie as putting a model's there, and this repo already
 * fixed that once in relog.
 *
 * **Their yes is a fact, not a checkbox.** The state lives on their page
 * with the date it was given and how, and `publicView` below is the only
 * thing that decides what a stranger sees. Every surface calls it; none of
 * them re-implements the rule.
 *
 * ── Being wrong towards private ──────────────────────────────────────────
 *
 * The default is the most private state and it is applied without asking,
 * because there is nobody here to ask — the person whose words these are is
 * not a user of this product. Every unknown value, every parse failure and
 * every missing page resolves to `kept_private`, not to the last state seen.
 */

import { findMany, findOne } from './d1'
import type { D1Database } from '@cloudflare/workers-types'

/** The four states, most private first. The order is the ladder. */
export const CONSENT_STATES = [
  'kept_private',      // the default. Their words are visible only to him.
  'named_not_quoted',  // "mention me, don't quote me."
  'quotable',          // they said yes, and the log has the yes.
  'not_on_the_log',    // they asked to be removed. Buried, not deleted.
] as const
export type Consent = typeof CONSENT_STATES[number]

export const CONSENT_WORDS: Record<Consent, { name: string; what: string }> = {
  kept_private: {
    name: 'Kept, private',
    what: 'Their words are on your log, attached to them, and visible only to you. Nothing they said appears on any public page, in any quote, or in an export you share.',
  },
  named_not_quoted: {
    name: 'Named, not quoted',
    what: 'A public page can say the conversation happened, and use your side. Their words appear as an absence. Their name is theirs to give; their sentences are not.',
  },
  quotable: {
    name: 'Quotable',
    what: 'Their words can be quoted publicly, with their name. Revoking this pulls the quotes.',
  },
  not_on_the_log: {
    name: 'Not on the log',
    what: 'They asked to be removed. Their words are buried so your side still makes sense to you, and their page shows only that they asked not to be here.',
  },
}

/** Anything unrecognised is the most private state. Never the last one seen. */
export function asConsent(v: string | null | undefined): Consent {
  return (CONSENT_STATES as readonly string[]).includes(v || '')
    ? (v as Consent)
    : 'kept_private'
}

// ── Reading a forwarded thread ───────────────────────────────────────────

export interface ParsedMessage {
  side: 'operator' | 'other'
  speaker: string
  text: string
  /** From the paste itself. Null when the paste carried no clock. */
  sent_at_raw: string | null
}

/**
 * A line that opens a message: a speaker, then optionally a time.
 *
 * Covers what the phone and mail clients actually produce when a thread is
 * shared — "Leif  22:19", "You  27 Aug 22:14", "[27/08/2026, 22:19] Leif:",
 * "Leif Nissen <leif@…> wrote:". Deliberately not clever: an unmatched line
 * continues the message above it, which is what a wrapped message looks like.
 */
const SPEAKER_LINE = new RegExp(
  '^(?:\\[(?<br>[^\\]]{3,40})\\]\\s*)?' +          // [27/08/2026, 22:19]
  '(?<who>[A-Za-z][\\w .\'’-]{0,40}?)' +           // Leif · Leif Nissen · You
  '(?:\\s*<[^>]+>)?' +                             // <leif@example.com>
  '\\s*(?:[:—-]\\s*|\\s{2,})' +                    // a colon, a dash, or a gap
  '(?<ts>(?:\\d{1,2}[:.]\\d{2}(?:\\s*[ap]m)?|\\d{1,2} \\w{3,9}(?: \\d{4})?(?:,? \\d{1,2}[:.]\\d{2})?))?' +
  '\\s*(?<rest>.*)$',
  'i',
)

/** The labels a forwarded thread uses for the person doing the forwarding. */
const SELF = /^(you|me|myself)$/i

/**
 * Split a forwarded thread into messages, and say which side each is on.
 *
 * `mine` names the label that is his when the paste does not say "You" — a
 * thread exported from a phone often labels both sides by name. It is passed
 * in rather than guessed, because guessing wrong assigns another person's
 * sentence to him.
 */
export function splitThread(text: string, mine?: string | null): ParsedMessage[] {
  const out: ParsedMessage[] = []
  let current: ParsedMessage | null = null
  const mineLower = (mine || '').trim().toLowerCase()

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      if (current) current.text += '\n'
      continue
    }
    const m = SPEAKER_LINE.exec(line)
    const who = m?.groups?.who?.trim() || ''
    // A speaker line has to actually name someone AND leave a message or a
    // time behind it. Otherwise it is a sentence that happens to have a
    // colon in it, and it belongs to the message above.
    const opensMessage = !!who && (!!m?.groups?.ts || !!(m?.groups?.rest || '').trim() || !!m?.groups?.br)

    if (opensMessage) {
      if (current && current.text.trim()) out.push(current)
      const isMine = SELF.test(who) || (!!mineLower && who.toLowerCase() === mineLower)
      current = {
        side: isMine ? 'operator' : 'other',
        speaker: who,
        text: (m!.groups!.rest || '').trim(),
        sent_at_raw: (m!.groups!.ts || m!.groups!.br || '').trim() || null,
      }
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line
    }
  }
  if (current && current.text.trim()) out.push(current)

  return out.map(x => ({ ...x, text: x.text.trim() })).filter(x => x.text.length > 0)
}

/** The distinct speakers, so he can say which one is him before anything is written. */
export function speakersIn(messages: ParsedMessage[]): string[] {
  const seen: string[] = []
  for (const m of messages) if (!seen.includes(m.speaker)) seen.push(m.speaker)
  return seen
}

/**
 * Is this a conversation with a PERSON, as opposed to prose or a model
 * session? Conservative for the same reason `looksLikeConversation` is: a
 * false positive here files his own writing as somebody else's words.
 */
export function looksLikeCorrespondence(text: string): boolean {
  if (text.length < 120) return false
  const msgs = splitThread(text)
  if (msgs.length < 4) return false
  const speakers = speakersIn(msgs)
  // Two sides, and neither side is one stray line.
  if (speakers.length !== 2) return false
  const counts = speakers.map(s => msgs.filter(m => m.speaker === s).length)
  return Math.min(...counts) >= 2
}

// ── What a stranger sees ─────────────────────────────────────────────────

export interface StoredMessage {
  id: string
  side: 'operator' | 'other'
  speaker: string | null
  text: string
  sent_at: string | null
  sent_at_source: string
  position: number
  entry_id: string | null
}

export interface PublicMessage {
  id: string
  side: 'operator' | 'other'
  speaker: string | null
  /** Null when their words are withheld — the row is an absence, not a gap. */
  text: string | null
  sent_at: string | null
  /** What the reader is told in place of the words. */
  withheld: string | null
}

/**
 * The public shape of a thread, under one person's consent.
 *
 * This is the only place the four states turn into what is shown, and every
 * surface calls it. `messages.html` is explicit about the result at the
 * default: "Your words, his absences. The shape of a conversation with none
 * of his content. It reads a little strange — **that's correct.** The
 * strangeness is his privacy, made visible instead of quietly overridden."
 *
 * So an absence is a row, not a deletion. Removing their turns entirely
 * would produce a monologue that reads as though he said all of it, which
 * is a worse misrepresentation than a visible blank.
 */
export function publicView(messages: StoredMessage[], consent: Consent): PublicMessage[] {
  if (consent === 'not_on_the_log') {
    // Their words are buried. His side alone is not a conversation, and
    // presenting it as one would imply their half. Nothing is public.
    return []
  }
  return messages.map(m => {
    if (m.side === 'operator') {
      return { id: m.id, side: m.side, speaker: m.speaker, text: m.text, sent_at: m.sent_at, withheld: null }
    }
    if (consent === 'quotable') {
      return { id: m.id, side: m.side, speaker: m.speaker, text: m.text, sent_at: m.sent_at, withheld: null }
    }
    return {
      id: m.id,
      side: m.side,
      speaker: consent === 'named_not_quoted' ? m.speaker : null,
      text: null,
      sent_at: m.sent_at,
      withheld: consent === 'named_not_quoted'
        ? `${m.speaker || 'They'} replied`
        : 'They replied',
    }
  })
}

// ── Reading it back ──────────────────────────────────────────────────────

export interface ThreadRow {
  id: string
  person_page_id: string | null
  person_name: string
  medium: string
  started_at: string | null
  ended_at: string | null
  message_count: number
  created_at: string
}

/** One thread with its messages, and the consent that governs it. */
export async function loadThread(
  db: D1Database,
  operatorId: string,
  threadId: string,
): Promise<{ thread: ThreadRow; messages: StoredMessage[]; consent: Consent; consent_at: string | null; consent_note: string | null } | null> {
  const thread = await findOne<ThreadRow>(
    db,
    `SELECT id, person_page_id, person_name, medium, started_at, ended_at,
            message_count, created_at
       FROM correspondence
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    threadId, operatorId,
  )
  if (!thread) return null

  const [messages, page] = await Promise.all([
    findMany<StoredMessage>(
      db,
      `SELECT id, side, speaker, text, sent_at, sent_at_source, position, entry_id
         FROM correspondence_messages
        WHERE thread_id = ? AND operator_id = ?
        ORDER BY position ASC
        LIMIT 1000`,
      threadId, operatorId,
    ),
    thread.person_page_id
      ? findOne<{ consent: string | null; consent_at: string | null; consent_note: string | null }>(
          db,
          `SELECT consent, consent_at, consent_note FROM pages
            WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
          thread.person_page_id, operatorId,
        )
      : Promise.resolve(null),
  ])

  // No page, no answer, a value nobody recognises — all the same state.
  return {
    thread,
    messages,
    consent: asConsent(page?.consent),
    consent_at: page?.consent_at ?? null,
    consent_note: page?.consent_note ?? null,
  }
}
