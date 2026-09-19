#!/usr/bin/env node
/**
 * Whisper hallucinates a short filler phrase ("Thank you.", "Thanks for
 * watching.", "Bye.") on near-silent or non-speech audio, instead of
 * returning nothing — a known failure mode, not an edge case invented here.
 * Found live: a silent, slow-motion DJI clip came back with real per-word
 * timings for "Thank you." repeated 26 times, and the pipeline wrote it
 * straight onto the log as something the operator said.
 *
 * `stepAudioExtract`'s no-audio check only catches an input with NO audio
 * STREAM at all (`ffprobe`'s stream count) — a clip whose mic picked up
 * nothing but wind or near-silence still has a stream, so it reaches
 * Whisper, and Whisper invents words with real-looking timings attached,
 * because it is still confidently guessing. `hasRealTranscript()` only
 * checks that word-timing rows EXIST; nothing before this line ever asked
 * whether the words looked real.
 *
 * `looksLikeHallucinatedLoop()` in `workers/pipeline/src/index.ts` closes
 * that hole: the SAME short phrase (1-4 words), repeated back-to-back,
 * covering most of the transcript. Real speech essentially never repeats an
 * identical short phrase five-plus times running, so this is a
 * high-precision signal, not a guess about content. `stepTranscribe` still
 * records `transcript_text` (the audit trail — never silently), but skips
 * the `transcript_words` INSERT entirely when this fires: that is the only
 * table `read-recording.ts` and the vlog page's transcript panel ever read,
 * so refusing to write it is enough to stop a fabricated word from ever
 * reaching an entry or a screen.
 *
 * The real implementation lives in `workers/pipeline/src/index.ts`, which
 * reaches Cloudflare Worker types this script cannot load directly — this
 * file re-implements the same pure function and asserts the real source
 * still matches its shape at the bottom, the way `split-note.mjs` already
 * does for `findAnchor`.
 *
 * Run: node scripts/test/hallucination-guard.mjs
 */

import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : (fail++, console.error('  FAIL ' + n)) }

// ── The pure function, re-implemented ────────────────────────────────────

function looksLikeHallucinatedLoop(words) {
  const tokens = words
    .map(w => w.word.toLowerCase().replace(/[^a-z']/g, ''))
    .filter(Boolean)
  if (tokens.length < 8) return false

  for (let n = 1; n <= 4; n++) {
    const chunkCount = Math.floor(tokens.length / n)
    if (chunkCount < 5) continue
    const counts = new Map()
    for (let i = 0; i < chunkCount; i++) {
      const key = tokens.slice(i * n, i * n + n).join(' ')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const maxCount = Math.max(...counts.values())
    if (maxCount >= 5 && (maxCount * n) / tokens.length >= 0.6) return true
  }
  return false
}

const w = word => ({ word })
const words = arr => arr.map(w)
const repeat = (phrase, times) => words(Array.from({ length: times }, () => phrase).flat())

console.log('the hallucination guard: a repeated filler phrase is not a transcript\n')

// ── The real case that found this ────────────────────────────────────────
{
  // "Thank you." x26 — the actual DJI clip, 52 words, 100% one phrase.
  const thankYou = repeat(['Thank', 'you.'], 26)
  ok('26x "Thank you." (the real incident) is flagged', looksLikeHallucinatedLoop(thankYou))
}

// ── Single-word loops ─────────────────────────────────────────────────────
{
  ok('a single word repeated 8 times is flagged',
    looksLikeHallucinatedLoop(words(Array(8).fill('Bye.'))))
  ok('a single word repeated only 3 times is not flagged (too little signal)',
    !looksLikeHallucinatedLoop(words(['Okay.', 'Okay.', 'Okay.', 'so', 'anyway', 'we', 'went', 'out'])))
}

// ── Real speech does not trip this ───────────────────────────────────────
{
  const realSpeech = words(
    ('and so that you know looking at that kind of phenomenon you know develop '
    + 'and expand is what i am tracking and that is what the whole idea behind '
    + 'this thing really was supposed to capture in the first place honestly')
      .split(' '),
  )
  ok('a genuine, varied sentence is not flagged', !looksLikeHallucinatedLoop(realSpeech))
}
{
  // Counting: no repeats at all.
  const counting = words('one two three four five six seven eight nine ten'.split(' '))
  ok('counting up with no repeats is not flagged', !looksLikeHallucinatedLoop(counting))
}
{
  // A short clip — below the minimum token floor regardless of content.
  const tooShort = words(['Thank', 'you.', 'Thank', 'you.'])
  ok('fewer than 8 words is never flagged, even if repetitive', !looksLikeHallucinatedLoop(tooShort))
}
{
  // A real phrase said a normal handful of times, mixed with other words —
  // below the 60% coverage floor, so it reads as speech, not a loop.
  const mixed = words(
    'thank you so much for coming out today thank you for listening thank you all really means a lot to me you know'
      .split(' '),
  )
  ok('a phrase said a few times inside real speech is not flagged', !looksLikeHallucinatedLoop(mixed))
}

// ── Boundary: the actual thresholds, not a rounded approximation ─────────
{
  // n=1, 5 reps, 5/8 tokens = 62.5% >= 60% — flagged.
  const atFloor = words(['Bye.', 'Bye.', 'Bye.', 'Bye.', 'Bye.', 'ok', 'thanks', 'now'])
  ok('exactly 5 reps clearing the 60% coverage floor is flagged', looksLikeHallucinatedLoop(atFloor))
  // n=1, 4 reps, 4/8 = 50% < 60% AND below the 5-rep floor — not flagged.
  // (last word deliberately distinct after normalization from "Bye.")
  const belowFloor = words(['Bye.', 'Bye.', 'Bye.', 'Bye.', 'ok', 'thanks', 'now', 'later'])
  ok('4 reps (below the 5-rep floor) is not flagged', !looksLikeHallucinatedLoop(belowFloor))
}

// ── The source still matches this shape ──────────────────────────────────
{
  const src = readFileSync('workers/pipeline/src/index.ts', 'utf8')
  ok('looksLikeHallucinatedLoop exists', src.includes('function looksLikeHallucinatedLoop'))
  ok('checks n-grams from 1 to 4 words', /for \(let n = 1; n <= 4; n\+\+\)/.test(src))
  ok('requires at least 5 repetitions', /maxCount >= 5/.test(src))
  ok('requires at least 60% coverage', /0\.6/.test(src))
  ok('stepTranscribe calls the guard before writing transcript_words',
    /hallucinated = looksLikeHallucinatedLoop\(allWords\)/.test(src))
  ok('the transcript_words INSERT is gated on !hallucinated',
    /allWords\.length > 0 && !hallucinated/.test(src))
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
