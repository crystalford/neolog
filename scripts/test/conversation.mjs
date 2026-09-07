#!/usr/bin/env node
/**
 * Tests for conversation splitting.
 *
 * The failure that matters: a false positive splits the operator's own long
 * paragraph into turns that were never turns, and then attributes a model's
 * sentence to him. So detection is tested for what it must REFUSE as much as
 * for what it must catch.
 */
import { looksLikeConversation, splitTurns, operatorTurns } from '../../src/lib/conversation.ts'

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : (fail++, console.error('  FAIL ' + n)) }
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b))

const convo = `
You: I've been thinking about why note apps never worked for me, and I think it's that they assume you already know what you're filing.
Claude: That's a useful distinction. Filing assumes a taxonomy you don't have yet.
You: Right, and the thing is I keep having the same thoughts over and over with no outlet for them at all.
Claude: Recurring thoughts with no outlet is a sharper statement of the problem than anything in the brief.
`.trim()

ok('a real conversation is detected', looksLikeConversation(convo))

const longOwnWriting = 'I want to write about 2008. '.repeat(40)
ok('his own long writing is not a conversation', !looksLikeConversation(longOwnWriting))
ok('a short note is not a conversation', !looksLikeConversation('You: hi\nClaude: hello'))

const quoted = 'I was reading something today and it said:\n\nClaude: this is a quote I liked\n\n' + 'and then I thought about it for a while. '.repeat(20)
ok('one quoted label inside his own writing is not a conversation', !looksLikeConversation(quoted))

const turns = splitTurns(convo)
eq('four turns', turns.length, 4)
eq('the first turn is his', turns[0].who, 'operator')
eq('the second is the other side', turns[1].who, 'other')

const mine = operatorTurns(turns)
eq('only his turns are extracted', mine.length, 2)
ok('no model sentence is extracted', !mine.join(' ').includes('useful distinction'))
ok('his words survive verbatim', mine[1].includes('no outlet for them at all'))

// Multi-paragraph turns: an unlabelled line continues the turn above it.
const multi = `
You: First line of my thought.
And a second paragraph of the same thought.
Claude: A reply.
`.trim()
const mt = splitTurns(multi)
eq('a continued turn stays one turn', mt.length, 2)
ok('both paragraphs are kept', mt[0].text.includes('second paragraph'))

// Short acknowledgements do not become entries.
const acks = splitTurns('You: yes do that\nClaude: done\nYou: ok\nClaude: ok')
eq('short acknowledgements are not entries', operatorTurns(acks).length, 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
