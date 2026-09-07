#!/usr/bin/env node
/**
 * Tests for the screenshot sort (src/lib/screenshots.ts, inlined).
 *
 * The sort decides which pile a picture lands in, and one of those piles is
 * offered for burying in bulk. Two things must never happen:
 *
 *   another person's words must never land in the bury pile
 *   nothing unrecognised may land in the bury pile either — the fallback is
 *   always the middle pile, because being wrong towards keeping is the only
 *   safe direction
 *
 * Run: node scripts/test/screenshots.mjs
 */

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

const MONEY = /(?:[$£€]\s?\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*\.\d{2}\s?(?:USD|CAD|GBP|EUR)\b)/i
const RECEIPT_WORDS = /\b(receipt|invoice|order\s*#?|paid|subtotal|total|payment|charged|renewal)\b/i
const DIRECTIONS = /\b(arriving|via\s+[A-Z]|\d+\s*min\b|km\b|fastest route|depart)\b/
const ONE_TIME = /\b(verification code|one[- ]time|otp|security code|your code is|do not share)\b/i
const SPEAKER = /^([A-Z][\w'\u2019-]*(?: [A-Z][\w'\u2019.-]*){0,2})\s*[:>]\s+(\S.*)$/

function sortScreenshot(read) {
  const text = (read || '').trim()
  if (!text) return { pile: 'keep', kind: 'unknown', entry_kind: null, facts: {}, why: 'No words were read out of this one.' }
  const spoken = text.split('\n').map(l => SPEAKER.exec(l.trim())).find(m => !!m && m[2].split(/\s+/).length >= 4)
  if (spoken) {
    const who = spoken[1]
    return { pile: 'something', kind: 'message', entry_kind: 'read', why: `${who} is named in it, so these are someone else's words.`, facts: { who, what: 'a message' } }
  }
  if (MONEY.test(text) && RECEIPT_WORDS.test(text)) {
    const amount = MONEY.exec(text)?.[0]?.trim()
    const who = text.split('\n').map(l => l.trim()).find(l => l && !MONEY.test(l))?.slice(0, 60)
    return { pile: 'something', kind: 'receipt', entry_kind: 'paperwork', why: `It carries ${amount} next to a word a receipt uses.`, facts: { what: 'a receipt', amount, who } }
  }
  if (ONE_TIME.test(text)) return { pile: 'convenience', kind: 'code', entry_kind: null, facts: {}, why: 'It reads like a one-time code, which stops meaning anything within minutes.' }
  if (DIRECTIONS.test(text)) return { pile: 'convenience', kind: 'directions', entry_kind: null, facts: {}, why: 'It reads like directions — a route and a time of arrival.' }
  return { pile: 'keep', kind: 'unknown', entry_kind: null, facts: {}, why: 'The log does not recognise what this is, so it is keeping it.' }
}

console.log('screenshots: three piles, and only one of them is offered for burying')

// The three from the design's own example.
{
  const r = sortScreenshot('Namecheap\nOrder #8841022\nancaster.co · 1 year\n$12.98\nPaid')
  check('a receipt is really something', r.pile, 'something')
  check('and it is paperwork', r.entry_kind, 'paperwork')
  check('the amount is taken from the text', r.facts.amount, '$12.98')
  check('the vendor is the first line that is not the amount', r.facts.who, 'Namecheap')
  ok('the reason is checkable against the picture', r.why.includes('$12.98'))
}
{
  const r = sortScreenshot('Leif: Remember when we pitched Ancaster in like 2007? Different company then obviously.')
  check("someone's message is really something", r.pile, 'something')
  check('it is filed as arriving from outside', r.entry_kind, 'read')
  check('and it names who said it', r.facts.who, 'Leif')
}
{
  const r = sortScreenshot('Maps\n14 min · via Wellington St\nArriving 9:31')
  check("directions are a moment's convenience", r.pile, 'convenience')
  check('nothing is made of them', r.entry_kind, null)
}

// The refusals.
{
  check('a one-time code is convenience', sortScreenshot('Your code is 448210. Do not share it.').pile, 'convenience')
}
{
  // Unrecognised text NEVER lands in the bury pile.
  const r = sortScreenshot('a thing I want to remember about the shape of the argument')
  check('unrecognised text is kept, not offered for burying', r.pile, 'keep')
}
{
  check('an empty read is kept', sortScreenshot('').pile, 'keep')
  check('a null read is kept', sortScreenshot(null).pile, 'keep')
}
{
  // A message that also mentions a distance must not become "directions".
  // Someone's words are checked FIRST, and that ordering is the guarantee.
  const r = sortScreenshot("Leif: it's about 14 min from here, arriving around 9:31 I reckon")
  check("a message about a journey is still a message", r.kind, 'message')
  ok('and so is not offered for burying', r.pile !== 'convenience')
}
{
  // A receipt whose text happens to mention minutes.
  const r = sortScreenshot('Uber\nTotal $24.10 Paid\n14 min trip')
  check('a receipt that mentions minutes is still a receipt', r.kind, 'receipt')
  ok('and is not offered for burying', r.pile !== 'convenience')
}
{
  // An amount with no receipt word is not a receipt — a screenshot of a
  // price is not proof of a purchase.
  const r = sortScreenshot('the ticket was $80 which felt like a lot at the time')
  check('a bare amount is not a receipt', r.kind, 'unknown')
  check('and it is kept', r.pile, 'keep')
}
{
  // A colon inside his own sentence must not make it someone else's words.
  const r = sortScreenshot('one thing: nobody reads the terms')
  ok('a short colon phrase is not a message', r.kind !== 'message')
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
