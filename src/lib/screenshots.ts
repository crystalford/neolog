/**
 * Screenshots — pictures that are really text, sorted by what the text says.
 *
 * `screenshots.html`: "A screenshot isn't a photo. It's text you wanted to
 * keep for a second — a message, a receipt, a map, a tweet, a thing to buy.
 * So the log reads the text, dates it, and sorts it into three piles."
 *
 * ── Why this is regexes and not a model ──────────────────────────────────
 *
 * The vision pass has already read the words (`log-intake.ts`, `reads`). What
 * is left is a question about the TEXT, not about him: does it contain a
 * currency amount next to the word "order"? does it have two labelled
 * speakers? does it say "arriving" next to a time? Those are facts, checkable
 * by anyone, and a regex that finds them asserts nothing.
 *
 * A model asked "is this worth keeping?" would answer with an opinion about
 * his life, which is what §0 rule 3 forbids and §0 rule 2 forbids commenting
 * on. So the sort is mechanical, and — the load-bearing part —
 *
 * ── Junk is offered, never decided ───────────────────────────────────────
 *
 * "the log groups them and offers to bury them in one go. Buried is
 * reversible; it never deletes." Nothing in this file buries anything. It
 * returns a pile and the reason it put the row there, in words he can check
 * against the picture. The burying is a button he presses.
 *
 * When nothing matches, the pile is `keep` — the middle one. Being wrong
 * towards keeping is the only safe direction here, the same way being wrong
 * towards private is the safe direction on the hold-back check.
 */

/** The three piles, in the order the page shows them. */
export type Pile = 'something' | 'keep' | 'convenience'

/** What the text turned out to be, when it is one of the recognised shapes. */
export type ScreenshotKind = 'receipt' | 'message' | 'directions' | 'code' | 'unknown'

export interface Sorted {
  pile: Pile
  kind: ScreenshotKind
  /** Why it is in that pile, as a fact about the text he can check. */
  why: string
  /** `paperwork` for a receipt; `read` for someone else's words; else null. */
  entry_kind: 'paperwork' | 'read' | null
  /** what · who · when · how much — only the ones the text actually carries. */
  facts: { what?: string; who?: string; when?: string; amount?: string }
}

const MONEY = /(?:[$£€]\s?\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*\.\d{2}\s?(?:USD|CAD|GBP|EUR)\b)/i
const RECEIPT_WORDS = /\b(receipt|invoice|order\s*#?|paid|subtotal|total|payment|charged|renewal)\b/i
const DIRECTIONS = /\b(arriving|via\s+[A-Z]|\d+\s*min\b|km\b|fastest route|depart)\b/
const ONE_TIME = /\b(verification code|one[- ]time|otp|security code|your code is|do not share)\b/i
/**
 * A speaker label: a NAME, then a colon. One to three capitalised tokens.
 *
 * The looseness that would be convenient here is the bug. `[\w .'-]{0,30}`
 * also matches "one thing:" at the head of his own sentence, and filing his
 * writing as somebody else's words is the worst outcome this file has. A
 * name is capitalised; a phrase he wrote usually is not.
 */
const SPEAKER = /^([A-Z][\w'\u2019-]*(?: [A-Z][\w'\u2019.-]*){0,2})\s*[:>]\s+(\S.*)$/

/**
 * Sort one screenshot's read text.
 *
 * Order matters and is not arbitrary: **someone else's words are checked
 * before anything else**, because a screenshot of a message is the one
 * outcome with another person in it, and mis-sorting it into "convenience"
 * would offer to bury their words on a heuristic. Receipts next, because a
 * receipt often quotes an amount that a message would not. Convenience last,
 * and only on a positive match — never as the fallback.
 */
export function sortScreenshot(read: string | null): Sorted {
  const text = (read || '').trim()
  if (!text) {
    return {
      pile: 'keep', kind: 'unknown', entry_kind: null, facts: {},
      why: 'No words were read out of this one.',
    }
  }

  // Someone else's words. A named speaker, and a real message behind the
  // colon rather than a two-word fragment.
  const spoken = text.split('\n')
    .map(l => SPEAKER.exec(l.trim()))
    .find(m => !!m && m[2].split(/\s+/).length >= 4)
  if (spoken) {
    const who = spoken[1]
    return {
      pile: 'something',
      kind: 'message',
      entry_kind: 'read',
      why: `${who} is named in it, so these are someone else's words.`,
      facts: { who, what: 'a message' },
    }
  }

  if (MONEY.test(text) && RECEIPT_WORDS.test(text)) {
    const amount = MONEY.exec(text)?.[0]?.trim()
    // The vendor is the first line that is not the amount — a receipt puts
    // it there. Taken as-is; nothing is looked up or corrected.
    const who = text.split('\n').map(l => l.trim()).find(l => l && !MONEY.test(l))?.slice(0, 60)
    return {
      pile: 'something',
      kind: 'receipt',
      entry_kind: 'paperwork',
      why: `It carries ${amount} next to a word a receipt uses.`,
      facts: { what: 'a receipt', amount, who },
    }
  }

  if (ONE_TIME.test(text)) {
    return {
      pile: 'convenience', kind: 'code', entry_kind: null, facts: {},
      why: 'It reads like a one-time code, which stops meaning anything within minutes.',
    }
  }

  if (DIRECTIONS.test(text)) {
    return {
      pile: 'convenience', kind: 'directions', entry_kind: null, facts: {},
      why: 'It reads like directions — a route and a time of arrival.',
    }
  }

  // Nothing recognised. The middle pile, always — never the bury pile.
  return {
    pile: 'keep', kind: 'unknown', entry_kind: null, facts: {},
    why: 'The log does not recognise what this is, so it is keeping it.',
  }
}

/** The words a pile is called on screen, and what the pile means. */
export const PILE_WORDS: Record<Pile, { name: string; what: string }> = {
  something: {
    name: 'really something',
    what: 'A receipt, a message, a fact. The picture is kept; what it says is what goes on the log.',
  },
  keep: {
    name: 'kept',
    what: 'The log does not recognise these, so they stay exactly as they are.',
  },
  convenience: {
    name: "a moment's convenience",
    what: 'Directions, a code, a thing you wanted for a second. Offered for burying, in one go. Buried is reversible.',
  },
}
