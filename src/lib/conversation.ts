/**
 * A conversation, handled.
 *
 * `session.html`: a real Claude session arrives as one paste. The log keeps
 * it whole and splits it — "nine entries with **your words and Claude's kept
 * apart**".
 *
 * The operator asked for this directly: *"I was thinking it would be great
 * if I could export my Claude sessions."* A conversation is a large part of
 * where his thinking actually happens, and until now it could only go in as
 * one undifferentiated wall of text.
 *
 * ── Whose words become entries ───────────────────────────────────────────
 *
 * Only his. This is the same consent rule `audio.html` states for a
 * two-voice recording — "Only my half becomes entries; the other person did
 * not agree to be logged" — and it is doubly right here, because an entry
 * carries `author='operator'` and the log must never put a model's sentence
 * behind that flag.
 *
 * The whole conversation is kept as one entry, so nothing is lost and the
 * assistant's half is still there to read. What is *extracted* is only what
 * he typed.
 *
 * ── The date ─────────────────────────────────────────────────────────────
 *
 * SPEC §11: "A source that carries no clock gets a date and no time. Chat
 * transcripts are the common case; Claude does not stamp its messages. The
 * log records `happened_at` to the day, marks it approximate... and never
 * fills in a plausible time or falls back to the paste time."
 */

export interface Turn {
  who: 'operator' | 'other'
  text: string
}

/** Speaker labels a pasted conversation actually uses, in the wild. */
const OPERATOR_LABELS = /^(you|me|user|human|prompt|q)\s*[:>]\s*/i
const OTHER_LABELS = /^(claude|assistant|ai|chatgpt|gpt|model|bot|a)\s*[:>]\s*/i

/**
 * Does this look like a pasted conversation rather than something he wrote?
 *
 * Deliberately conservative: a false positive splits his own long paragraph
 * into turns that were never turns, which is worse than missing one. Two
 * independent signals are required — labelled speakers AND both sides
 * present.
 */
export function looksLikeConversation(text: string): boolean {
  if (text.length < 400) return false
  const lines = text.split('\n')
  let mine = 0, theirs = 0
  for (const l of lines) {
    const t = l.trim()
    if (!t) continue
    if (OPERATOR_LABELS.test(t)) mine++
    else if (OTHER_LABELS.test(t)) theirs++
  }
  // Both halves, and enough of them that it is a conversation rather than a
  // quoted line inside something he wrote.
  return mine >= 2 && theirs >= 2
}

/**
 * Split it into turns. Unlabelled lines continue the turn above them, which
 * is how pasted conversations actually look — a speaker label, then several
 * paragraphs under it.
 */
export function splitTurns(text: string): Turn[] {
  const turns: Turn[] = []
  let current: Turn | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      if (current) current.text += '\n'
      continue
    }
    const mine = OPERATOR_LABELS.exec(line)
    const theirs = mine ? null : OTHER_LABELS.exec(line)

    if (mine || theirs) {
      if (current) turns.push(current)
      current = {
        who: mine ? 'operator' : 'other',
        text: line.slice((mine || theirs)![0].length).trim(),
      }
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line
    }
  }
  if (current) turns.push(current)

  return turns
    .map(t => ({ ...t, text: t.text.trim() }))
    .filter(t => t.text.length > 0)
}

/**
 * The turns of his worth putting on the log as entries of their own.
 *
 * Mechanical, not a judgement: long enough to stand alone as a line, and not
 * an instruction to the model. The log is not deciding which of his thoughts
 * mattered — it is declining to make an entry out of "yes do that".
 */
export function operatorTurns(turns: Turn[], minWords = 12): string[] {
  return turns
    .filter(t => t.who === 'operator')
    .map(t => t.text.replace(/\s+/g, ' ').trim())
    .filter(t => t.split(' ').length >= minWords)
}

/** "Talked with Claude · 28,400 words · 34 turns" — facts, not a summary. */
export function conversationSentence(text: string, turns: Turn[]): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const n = turns.length
  return `Pasted a conversation — ${words.toLocaleString('en-GB')} words, ${n} ${n === 1 ? 'turn' : 'turns'}.`
}

/**
 * Is this a document rather than something he typed?
 *
 * SPEC §1 on documents: "**A document is a made thing with a body**: a
 * report, a spec, a deck, a repository, a dataset, an export... **Artifacts
 * from AI sessions arrive as documents.** A report Claude drafted from the
 * operator's questions is kept as exactly that — model's words, operator's
 * questions and keeping."
 *
 * This matters because of who the words belong to. A short paste is plainly
 * him typing. A two-thousand-word report pasted in is very often something
 * he KEPT rather than something he WROTE — and storing it under
 * `author='operator'` would put a model's prose behind his name, which is
 * the same failure relog had with unverified quotes.
 *
 * The log cannot know who wrote a pasted document, and it must not ask at
 * the moment of input. So it does not claim: the entry's line becomes the
 * log's ("Kept a document"), the body is kept whole, and he can say it is
 * his in one tap afterwards. Being wrong towards "the log wrote this line"
 * is the only direction that is safe, because it under-claims rather than
 * over-claims.
 */
export function looksLikeDocument(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  // Long enough that it is unlikely to be typed into a compose box in one
  // go. Length alone is never enough — his own memory of 2008 is long too —
  // so structure is required as well, and that is what actually separates a
  // document from his writing.
  if (words < 400) return false
  // Structure a person does not usually type into a compose box in one go.
  const hasHeadings = /^#{1,6}\s+\S/m.test(text)
  const hasNumberedSections = (text.match(/^\s*\d+[.)]\s+\S/gm) || []).length >= 4
  const hasBullets = (text.match(/^\s*[-*•]\s+\S/gm) || []).length >= 6
  return hasHeadings || hasNumberedSections || hasBullets
}

/** "Kept a document — 2,400 words." Facts, never a summary of it. */
export function documentSentence(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  // A markdown title, when the document carries one. His own words if so.
  const heading = text.match(/^#{1,3}\s+(.{3,90})$/m)?.[1]?.trim()
  const size = `${words.toLocaleString('en-GB')} words`
  return heading ? `Kept a document: ${heading} — ${size}.` : `Kept a document — ${size}.`
}
