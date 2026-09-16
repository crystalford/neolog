#!/usr/bin/env node
/**
 * Tests for correspondence — the one kind on the log with someone else in
 * it (src/lib/correspondence.ts, inlined, same as the other suites here).
 *
 * Two decisions, and both of them are about a person who is not a user of
 * this product and cannot correct it:
 *
 *   the split      decides which side each message is on. Wrong here files
 *                  another person's sentence as something HE said, behind
 *                  author='operator'.
 *   the public view decides what a stranger sees under each of the four
 *                  consent states. Wrong here publishes words nobody agreed
 *                  to publish.
 *
 * Every ambiguous case must resolve towards private. That is what most of
 * these assertions check.
 *
 * Run: node scripts/test/correspondence.mjs
 */

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

// ── inlined from src/lib/correspondence.ts ───────────────────────────────
const CONSENT_STATES = ['kept_private', 'named_not_quoted', 'quotable', 'not_on_the_log']
const asConsent = v => (CONSENT_STATES.includes(v || '') ? v : 'kept_private')

const SPEAKER_LINE = new RegExp(
  '^(?:\\[(?<br>[^\\]]{3,40})\\]\\s*)?' +
  '(?<who>[A-Za-z][\\w .\'’-]{0,40}?)' +
  '(?:\\s*<[^>]+>)?' +
  '\\s*(?:[:—-]\\s*|\\s{2,})' +
  '(?<ts>(?:\\d{1,2}[:.]\\d{2}(?:\\s*[ap]m)?|\\d{1,2} \\w{3,9}(?: \\d{4})?(?:,? \\d{1,2}[:.]\\d{2})?))?' +
  '\\s*(?<rest>.*)$',
  'i',
)
const SELF = /^(you|me|myself)$/i

function splitThread(text, mine) {
  const out = []
  let current = null
  const mineLower = (mine || '').trim().toLowerCase()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { if (current) current.text += '\n'; continue }
    const m = SPEAKER_LINE.exec(line)
    const who = m?.groups?.who?.trim() || ''
    const opensMessage = !!who && (!!m?.groups?.ts || !!(m?.groups?.rest || '').trim() || !!m?.groups?.br)
    if (opensMessage) {
      if (current && current.text.trim()) out.push(current)
      const isMine = SELF.test(who) || (!!mineLower && who.toLowerCase() === mineLower)
      current = {
        side: isMine ? 'operator' : 'other',
        speaker: who,
        text: (m.groups.rest || '').trim(),
        sent_at_raw: (m.groups.ts || m.groups.br || '').trim() || null,
      }
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line
    }
  }
  if (current && current.text.trim()) out.push(current)
  return out.map(x => ({ ...x, text: x.text.trim() })).filter(x => x.text.length > 0)
}

const speakersIn = msgs => {
  const seen = []
  for (const m of msgs) if (!seen.includes(m.speaker)) seen.push(m.speaker)
  return seen
}

function looksLikeCorrespondence(text) {
  if (text.length < 120) return false
  const msgs = splitThread(text)
  if (msgs.length < 4) return false
  const sp = speakersIn(msgs)
  if (sp.length !== 2) return false
  const counts = sp.map(s => msgs.filter(m => m.speaker === s).length)
  return Math.min(...counts) >= 2
}

function publicView(messages, consent) {
  if (consent === 'not_on_the_log') return []
  return messages.map(m => {
    if (m.side === 'operator') return { id: m.id, side: m.side, speaker: m.speaker, text: m.text, sent_at: m.sent_at, withheld: null }
    if (consent === 'quotable') return { id: m.id, side: m.side, speaker: m.speaker, text: m.text, sent_at: m.sent_at, withheld: null }
    return {
      id: m.id, side: m.side,
      speaker: consent === 'named_not_quoted' ? m.speaker : null,
      text: null, sent_at: m.sent_at,
      withheld: consent === 'named_not_quoted' ? `${m.speaker || 'They'} replied` : 'They replied',
    }
  })
}

console.log('correspondence: the one kind with someone else in it')

// ── The default is the most private state, from every direction ──────────
check('an unknown value is kept_private', asConsent('public'), 'kept_private')
check('null is kept_private', asConsent(null), 'kept_private')
check('undefined is kept_private', asConsent(undefined), 'kept_private')
check('an empty string is kept_private', asConsent(''), 'kept_private')
check('a near-miss is kept_private', asConsent('quoteable'), 'kept_private')
check('a real state survives', asConsent('quotable'), 'quotable')

// ── The split ────────────────────────────────────────────────────────────
const THREAD = `You  27 Aug 22:14
Got the job. Ancaster. Start Monday.

Leif  22:19
Ha. Eighteen years. Told you you'd go back.

You  22:20
You did. Repeatedly.

Leif  22:31
Remember when we pitched Ancaster in like 2007?
Different company then obviously.`

{
  const m = splitThread(THREAD)
  check('every message is found', m.length, 4)
  check('the sides alternate correctly', m.map(x => x.side), ['operator', 'other', 'operator', 'other'])
  check('a wrapped line stays in its own message',
    m[3].text, "Remember when we pitched Ancaster in like 2007?\nDifferent company then obviously.")
  check('the time comes from the paste', m[1].sent_at_raw, '22:19')
  check('both speakers are named', speakersIn(m), ['You', 'Leif'])
}

// The dangerous case: a thread labelled by NAME on both sides. Without
// being told which name is his, nothing may be attributed to him.
const BY_NAME = THREAD.replace(/^You /gm, 'Chris ')
{
  const blind = splitThread(BY_NAME)
  ok('with no name given, nothing is attributed to the operator',
    blind.every(m => m.side === 'other'))
  const told = splitThread(BY_NAME, 'Chris')
  check('once told which name is his, his side is his',
    told.map(x => x.side), ['operator', 'other', 'operator', 'other'])
  ok('and being told does not move the other person',
    told.filter(m => m.speaker === 'Leif').every(m => m.side === 'other'))
}

// A colon inside his own prose must not become a speaker.
{
  const prose = `I keep coming back to one thing: nobody reads the terms.
They click through and act surprised. That is the whole shape of it.
Two things follow from that, and the second one matters more.`
  ok('prose with a colon is not correspondence', !looksLikeCorrespondence(prose))
}

// Three speakers is a group thread; the two-owner model does not hold, so
// it is not treated as correspondence rather than being guessed at.
{
  const group = THREAD + `\n\nSam  22:40\nI was there for that one actually, it was the year after.\n\nSam  22:41\nOr close to it anyway, give or take.`
  ok('a three-way thread is not treated as two-owner', !looksLikeCorrespondence(group))
}

ok('a real two-sided thread is correspondence', looksLikeCorrespondence(THREAD))
ok('one exchange is not enough', !looksLikeCorrespondence('You: hi\nLeif: hello'))

// ── The public view ──────────────────────────────────────────────────────
const STORED = [
  { id: '1', side: 'operator', speaker: 'You', text: 'Got the job.', sent_at: 'a' },
  { id: '2', side: 'other', speaker: 'Leif', text: "Told you you'd go back.", sent_at: 'b' },
  { id: '3', side: 'operator', speaker: 'You', text: 'You did. Repeatedly.', sent_at: 'c' },
]

{
  const v = publicView(STORED, 'kept_private')
  check('at the default his words are shown', v[0].text, 'Got the job.')
  check('at the default their words are not', v[1].text, null)
  check('and their name is not given either', v[1].speaker, null)
  check('the absence is a row, not a deletion', v.length, 3)
  check('the absence says what it is', v[1].withheld, 'They replied')
}
{
  const v = publicView(STORED, 'named_not_quoted')
  check('named-not-quoted gives the name', v[1].speaker, 'Leif')
  check('named-not-quoted still withholds the words', v[1].text, null)
  check('and says who replied', v[1].withheld, 'Leif replied')
}
{
  const v = publicView(STORED, 'quotable')
  check('quotable shows their words', v[1].text, "Told you you'd go back.")
  check('quotable withholds nothing', v[1].withheld, null)
}
{
  check('removed publishes nothing at all', publicView(STORED, 'not_on_the_log'), [])
  // His side alone would read as a monologue he delivered. That is a worse
  // misrepresentation than showing nothing.
  ok('removed does not fall back to his side alone',
    publicView(STORED, 'not_on_the_log').length === 0)
}
{
  // A state that got into the column somehow must not open the gate.
  const v = publicView(STORED, asConsent('yes'))
  check('a junk consent value withholds', v[1].text, null)
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
