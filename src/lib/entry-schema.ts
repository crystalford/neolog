/**
 * An entry, readable as data — in the page's own source, never as a second
 * feed.
 *
 * `footage.html` puts this on every entry: "Also readable as data:
 * SocialMediaPosting — both dates, the author, and who wrote the line. *in
 * this page's source, not a separate feed*."
 *
 * That parenthesis is the design. SPEC §0.1 forbids a second authored feed,
 * and a schema block generated from a different query than the one the page
 * rendered IS a second feed — one that can disagree with what is on screen.
 * So this function takes the entry the page already has and describes it.
 * Nothing is fetched, nothing is looked up, and a field the entry does not
 * carry is simply absent rather than filled in.
 *
 * ── The two things it must get right ─────────────────────────────────────
 *
 * **Both dates.** `dateCreated` is when it HAPPENED; `datePublished` is when
 * it entered the log. Collapsing them would throw away the distinction the
 * whole product is built on, and a consumer reading one date would silently
 * get the wrong one.
 *
 * **Who wrote the line.** `author` is the operator only when he wrote it. A
 * line the log composed is attributed to the log, by name, in the data —
 * the same rule the feed follows on screen. A machine that cites this must
 * be able to tell which it has.
 *
 * A date the log had to guess is marked with a `_neolog.date_precision`
 * extension rather than being emitted as though it were known. There is no
 * standard field for "this is approximately right", and emitting an exact
 * ISO timestamp for a year-only guess would be a lie in a format designed to
 * be trusted.
 */

/** The type each kind is, in schema.org's vocabulary. */
const TYPE_FOR_KIND: Record<string, string> = {
  happened: 'Event',
  said: 'SocialMediaPosting',
  seen: 'Photograph',
  made: 'CreativeWork',
  read: 'CreativeWork',
  paperwork: 'CreativeWork',
  ideas: 'Claim',
}

export interface SchemaEntry {
  id: string
  text: string
  detail: string | null
  happened_at: string
  logged_at: string
  date_precision: string
  kind: string
  visibility: string
  author: string
  mime: string | null
  duration_seconds: number | null
  media_url: string | null
  link_url: string | null
  transcript: string | null
}

export function entrySchema(
  e: SchemaEntry,
  opts: { origin?: string; operatorName?: string | null } = {},
): Record<string, unknown> | null {
  // Only what is public is described. A private or held entry has no
  // business in a block whose entire purpose is being read by someone else.
  if (e.visibility !== 'public') return null

  const origin = opts.origin || ''
  const url = `${origin}/entry/${e.id}`
  const written = e.author === 'operator'
    ? (opts.operatorName || 'the operator')
    : 'the log'

  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': TYPE_FOR_KIND[e.kind] || 'CreativeWork',
    '@id': url,
    url,
    name: e.text,
    // The two times, kept apart.
    dateCreated: e.happened_at,
    datePublished: e.logged_at,
    author: { '@type': e.author === 'operator' ? 'Person' : 'Organization', name: written },
    inLanguage: 'en',
  }

  if (e.detail) out.description = e.detail
  // The transcript is the words themselves, which is what a citing machine
  // actually wants. Capped, because a schema block is not a delivery
  // mechanism for an hour of speech.
  if (e.transcript) out.text = e.transcript.slice(0, 5000)
  if (e.link_url) out.sameAs = e.link_url

  if (e.kind === 'seen' && e.media_url) out.contentUrl = e.media_url
  if (e.duration_seconds && e.duration_seconds > 0) {
    out.duration = `PT${Math.round(e.duration_seconds)}S`
    if ((e.mime || '').startsWith('audio/')) out['@type'] = 'AudioObject'
    else if ((e.mime || '').startsWith('video/')) out['@type'] = 'VideoObject'
    if (e.media_url) out.contentUrl = e.media_url
  }

  // An Event's date is the thing it is about, so schema.org's own field
  // carries it rather than being duplicated into a description.
  if (e.kind === 'happened') out.startDate = e.happened_at

  // No standard field says "this date is a guess". Rather than emit a
  // confident timestamp for one, the precision travels in a namespaced
  // extension and a reader can act on it.
  if (e.date_precision && e.date_precision !== 'exact') {
    out._neolog = { date_precision: e.date_precision, written_by: written }
  } else {
    out._neolog = { written_by: written }
  }

  return out
}
