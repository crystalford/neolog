#!/usr/bin/env node
/**
 * How far each page has drifted from the design it is supposed to be.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * On 8 Sep the operator looked at the deployed site and said it still looked
 * like the old one. It did. The home page and the feed had been built close
 * to the package; every other page had been written in a vocabulary that
 * RESEMBLED it — plausible class names, numbers re-derived rather than taken
 * — and nothing in the repo could tell the two apart. `tsc` cannot. A build
 * cannot. Reading the CSS cannot, because it looks right.
 *
 * So this compares, per page, two things:
 *
 *   the stylesheet   every rule the design defines, against the rule I wrote
 *                    for it. A value that disagrees is reported with both.
 *   the markup       every class the design's own markup uses, against the
 *                    classes my page renders — following the components it
 *                    imports, since LogRow and Rail carry design classes too.
 *
 * ── The budgets ──────────────────────────────────────────────────────────
 *
 * `PAGES` below carries a per-page ceiling for unused design classes. The
 * number is what that page is at today, not what it should be: this check
 * exists to stop drift, and every page's real target is zero. Lowering one
 * of these numbers is the work; raising one needs a reason in the commit.
 *
 * The design itself is vendored in `design/` — the package lived in a
 * scratch directory that does not survive a session, which would have made
 * every number here unreproducible by the next one.
 *
 * Run: node scripts/check-design.mjs [page]
 */

import { readFileSync, existsSync } from 'node:fs'

/** page in design/ → the route file that must match it → today's ceiling. */
const PAGES = [
  // 3 → 0 on 9 Sep.
  // ⚠️ `.priv` was RENDERING and reported as unbuilt: `LogRow` set the tag's
  // class from `t.tone`, a variable, and this check reads only literals. It
  // goes through a map indexed inside the className now — the idiom /pages
  // already uses for its five kinds.
  // ⚠️ `.ch` — "in a chain" — was genuinely missing, and with it the only
  // sign on the feed that an entry is a turn on a route. `/api/v2/log` marks
  // a row that led from something or that something led from, in ONE query
  // over the window's ids rather than one per row. A REFLECTION's led_from
  // does not count: SPEC §1 says a later thought never becomes a second
  // event, so it is a layer, not a turn.
  // `.a` gives every open question its two answers, not just the one at the
  // top — "don't remember" is a complete answer and the rest were listed
  // with no way to say it. The design's third button is "Talk it out",
  // which is the offer and stays below the fence.
  ['log',        'src/app/(app)/page.tsx',              0],
  ['entry',      'src/app/(app)/entry/[id]/page.tsx',   0],
  ['headings',   'src/app/(app)/pages/page.tsx',         0],
  // 12 → 10 on 9 Sep. `person.html` puts the page's own open question at the
  // top of its rail in a warm-bordered card (`.rc warm` + `.a`), and it is
  // the one recall question that is ABOUT this page: the log named it, and
  // this is where he can see what is under the name before answering.
  // Nothing new is asked because a page was opened — recall's ceiling of
  // three open questions governs. The design's third button is "Talk it
  // out", which is the offer and stays below the fence.
  // The remaining ten are recorded: `.acts .also .foot .rule` are the design
  // page explaining its own mechanic, and `.d .how .auto .first .sh .pl` are
  // that page's own mention-row shape — this page renders the feed's rows,
  // because SPEC §3 says nothing is designed twice.
  ['person',     'src/app/(app)/page/[id]/page.tsx',    10],
  // 7 → 1 on 9 Sep. The hit was `.pt` wrapping the meta — the design's shape
  // inverted, so the date, the provenance and the passage number all took
  // quoted-text styling. `.d fz` is the one that mattered: a date the log had
  // to guess must not look like one it knows, on the surface whose whole
  // discipline is pointing at things.
  // ⚠️ `.thin` is the one that stays, and it is a refusal. It is a NAMED
  // untranscribed file listed under the query as one that "might be relevant
  // — the batch page guessed it could mention it". To name one, the log has
  // to decide which unread recording bears on this question, and it cannot:
  // it has not read any of them. That is the fence /footage draws in the same
  // words. The half of that row that IS a fact — how many recordings the
  // search could not look inside — is built, as a count.
  // ⚠️ `.tabs` is built with TWO of the design's three. "By relevance" is
  // the log having an opinion about which of his own words matter most.
  ['search',     'src/app/(app)/search/page.tsx',       1],
  // ⚠️ Five of its six are this CHECKER being wrong, not the page. `s1 s2
  // s3 q some` are the coverage strip's density and mark classes, and they
  // are COMPUTED — `const cls = n > hi ? 's3' : …` — so the regex above
  // cannot see them. They render, and check-design-render.mjs proves it:
  // /month is pixel-identical to the design. Do not contort the page into
  // literals to satisfy this number.
  // `.a` — "Talk it out later", a button under the month's paragraph
  // suggesting he record something about the month — is the offer, and the
  // offer is below the fence. §0 rule 2: the log is quiet.
  ['month',      'src/app/(app)/month/[ym]/page.tsx',   6],
  // 4 → 1 on 9 Sep. ⚠️ The year headings were `.idxband`, which is /pages'
  // index band — a page taking another page's furniture. onthisday.html has
  // its own: `.yr` is the block and `.y` the year, and `.yr` is a two-column
  // grid, so with the rows as direct children a year with two entries put
  // the second one back in the year column. `.ph` is the day's pictures,
  // beside the line rather than described in it; a held row is sent no URL.
  // ⚠️ `.m` — "from memory · ±3 months" — is structurally impossible here
  // and stays. This page selects `date_precision IN ('exact','day')`,
  // because a guessed day has no business on the one surface whose whole
  // discipline is not saying.
  ['onthisday',  'src/app/(app)/onthisday/page.tsx',     1],
  // 5 → 0 on 9 Sep. `clear.html`'s phone (`.ph` holding a `.scr`) had every
  // rule in globals.css since the page was built and was rendered by
  // nothing — the page put a `.big` line in the main column instead, so the
  // surface whose whole job is to say "these are safe to delete" said it in
  // prose beside a list.
  ['clear',      'src/app/(app)/clear/page.tsx',        0],
  // 2 → 0 on 9 Sep. ⚠️ `.in` is where triage.html puts the card's padding
  // (`.card .in{padding:16px 20px}`) so the picture can run to the card's
  // edge while the words do not — without it the words sat against the
  // border. `.rule` is the closing note in the rail, and it is the page's
  // whole disposition: nothing is blocked on this, there is no badge, and
  // skipping it costs nothing.
  ['triage',     'src/app/(app)/triage/page.tsx',       0],
  // takeout.html — "everything out, and the bill" — is this page.
  // export.html is a RENDERED EXPORT DOCUMENT ("Building neolog — exported
  // from the log"): what the Markdown looks like, not a route.
  // 6 → 0 on 9 Sep. ⚠️ The bill rendered the quantity and the rate as one
  // run-on span, and then borrowed /pages' index row (`.idxrow .nm .kd .sp
  // .ct`) for its total — a different table on a different page. Every line
  // says which rate it used so the arithmetic can be checked by hand, and a
  // quantity in its own column is what makes that possible at a glance.
  // The download block gained `.out`, without which `.big`, `.sub` and `.go`
  // matched no rule at all: every one of them is scoped under it.
  ['takeout',    'src/app/(app)/export/page.tsx',       0],
  // 5 → 3 on 9 Sep: a term now carries `.t` (its name with the date beside
  // it) and `.c` (first said … · where it was said). This page stated its
  // facts and gave no way to check one, on a product where every other
  // surface walks back to the moment.
  // ⚠️ The last three need data this product does not keep. `.meta` is the
  // provenance line on a stated POSITION, and there is no position kind —
  // `PAGE_KINDS` has eight and none is one. `.sa`/`.same` are external
  // identity links (github · wikidata · linkedin) with no column, no input,
  // and a purpose — being found by machines — that sits badly against §0
  // rule 7, "you never write something down because it would look good in
  // public".
  // 3 → 1 on 9 Sep. `.same`/`.sa` is "where else to find me — so a machine
  // knows these are all one person", and it is `sameAs` in this page's
  // Person block, the one field that turns a page about a person into a
  // claim checkable somewhere else. `operator.same_as_json`, typed in
  // Settings: nothing is looked up and there is no connector.
  // ⚠️ The design also lists the places he has NOT linked as gaps to fill,
  // which is the log telling him to go and make accounts — an offer. What is
  // missing is said once, as a state, not as a to-do list.
  // ⚠️ `.meta` stays. It is the dated provenance under a "What I think"
  // quote, and deciding which of his sentences are his POSITIONS is the log
  // deciding what is significant in his life — the refusal that removed page
  // seeding from `entities`. This page shows what the log can STATE.
  ['dossier',    'src/app/(app)/facts/page.tsx',         1],
  // Its last five are .was (the struck previous wording of a changed
  // claim) and .eg (an example of a machine rephrasing a line) — both need
  // data this product does not keep.
  // 5 → 2 on 9 Sep. The card rendered the summary as `.more`, which in the
  // design is the LINK at the end of `.m` — so the paragraph took the
  // styling of a navigation affordance. It is `.n` now, with `.m` carrying
  // the date and kind and `.w` carrying where the sentence came from.
  // The last two are the recorded pair below.
  ['source',     'src/app/(app)/glossary/page.tsx',      2],
  // Its last four — .long, .sq, .th, .tree — are the prose answer and the
  // fanned-out sub-questions. Both are a model writing in his voice on a
  // surface that presents itself as a record, which §0 rule 3 forbids, so
  // this page cannot and should not reach zero. /search is where a written
  // answer lives, and it citation-checks every sentence first.
  ['asks',       'src/app/(app)/asks/page.tsx',          4],
  // 3 → 0 on 9 Sep. ⚠️ `.n` is the ROW — a 200px + 1fr grid — and it was on
  // the figure, under a `.num` wrapper no stylesheet defines. So the row had
  // no grid and the number carried the row's padding. `.big` is the figure.
  // `.fresh` says when these were counted, and says the true thing rather
  // than the design's: counted on this request, not recounted nightly.
  // `.q` — "quote with source" — puts the figure AND the rule it was counted
  // by on the clipboard. The whole point of this page is that a number never
  // travels without its rule, and copying the number alone is how that is
  // lost.
  ['numbers',    'src/app/(app)/numbers/page.tsx',       0],
  // Five of its remaining eight must STAY missing: mic, opts and or are
  // the composer, and yl/yrs are the coverage bar. SPEC §3 — "Not on the
  // public side: the coverage bar (the operator's instrument; it advertises
  // the gaps), questions, the composer." public-log.html draws them; §0
  // wins over a page.
  // ⚠️ All eight are SPEC §3, and it is one refusal rather than three. "Not
  // on the public side: the coverage bar (the operator's instrument; it
  // advertises the gaps), questions, the composer." `mic opts or` are the
  // composer and the answering control, `yl yrs` the coverage bar, and
  // `a d p` are the open-questions rail's own actions — the questions
  // block, which is the same clause. public-log.html draws all of it; §0
  // wins over a page.
  ['public-log', 'src/app/(app)/public/page.tsx',       8],
  // 9 → 7 on 9 Sep: the page was FETCHING `vision_description` and
  // `frame_note` and rendering neither, so the frame index — "find a clip by
  // what was in front of the camera" — was invisible on the recording's own
  // page. It now shows both, marked, plus `.state` (who can see it).
  // ⚠️ The remaining 7 (`player frame big go bar2 line2 tm2`) are the
  // design's 420px MOCK player and its transport chrome. This page plays the
  // real recording in a `<video>`; there is nothing to build.
  ['vlog',       'src/app/(app)/vlog/[id]/page.tsx',    7],
  // 5 → 0 on 9 Sep. ⚠️ The shelf collapsed `made_by`'s four values into two
  // colours, so a thing the LOG made and a thing he made WITH a model looked
  // identical — on the page whose whole point is who made each thing. The
  // detail page's meta row rendered as `.stamp`, another page's class, so
  // ten `writing.css` rules never reached it, and the body had no `.in`, so
  // it ran the full width of the frame instead of a 720px measure.
  ['writing',    'src/app/(app)/writing/page.tsx',      0],
  // writing.html's title is "an essay you wrote" — it covers the mechanic
  // AND one document, so the detail page is measured against it too.
  ['writing',    'src/app/(app)/writing/[id]/page.tsx', 0],
  // 7 → 1 on 9 Sep. ⚠️ The page had a SECOND `.grid > main` nested inside the
  // first, so it rendered two rails and put the three piles inside a
  // two-column grid that was already the 708 column. And `.paper` was being
  // used as a container with `.im` as the card — the design's shapes
  // inverted. It now renders `screenshots.html`'s own card (`.shot` / `.im` /
  // `.txt` / `.k` / `<q>` / `.v` / `.go`, with `.junk` on the offered pile)
  // and §2's paperwork rows off `kind = 'paperwork'`, which is where `.d fz`
  // earns its keep: a scanned invoice dated "Mar 2005" must not look like a
  // screenshot dated to the day.
  // ⚠️ `.n` is the one that stays, and it cannot be built alone: on this page
  // it appears ONLY inside `.st`, the numbered walkthrough section that is in
  // PACKAGE_FURNITURE because rendering it would be the log explaining itself
  // under the feature. The badge without the step is nothing.
  ['screenshots','src/app/(app)/screenshots/page.tsx',  1],
  ['messages',   'src/app/(app)/messages/page.tsx',     2],
  // messages.html covers the whole mechanic — the list AND one thread — so
  // the thread page is measured against it too; most of its classes live
  // there.
  // 9 → 7 on 9 Sep: the publish preview gained `.k` (whose consent state is
  // being previewed, and what it is) and `.f` (why it reads strangely). The
  // preview was a second copy of the thread with lines missing and nothing
  // on screen saying why — on the one surface that is half somebody else's.
  // 7 → 2 on 9 Sep. The list page opens on `messages.html`'s own `.top`,
  // which says why this kind works differently before it shows a thread. The
  // sides pair took `.a`/`.b` — steel for his half, ochre for theirs, which
  // is the page's whole argument in two colours. The consent rows took the
  // design's `.k`/`.x`/`.s` shape, with `.no` as a dash on every state
  // nobody is at: an empty cell reads as unrendered, a dash is a fact.
  // ⚠️ And the publish preview is now ONE LINE (`.l`), not a second copy of
  // the thread with rows missing. It answers "what would publishing do to
  // them", and the answer is a shape — his sentences running on, their turns
  // as bracketed absences.
  // ⚠️ `.veil` is refused. In the design it collapses a run of their
  // messages as "3 messages about Leif's own situation — kept, not shown",
  // which requires the log to read another person's words and decide what
  // they are ABOUT. That is §0 rule 3 with a real person on the other end of
  // it. Their words are kept whole here and marked as theirs.
  // `.n` is the `.st` badge, as on screenshots.
  ['messages',   'src/app/(app)/messages/[id]/page.tsx', 2],
  // 10 → 0 on 9 Sep, and two of them were class collisions of the kind this
  // file's table already records.
  // ⚠️ `.route` is the design's BOX — it wraps the header and every step and
  // draws the border round the whole walk. It was on the little label line
  // inside `.hd`, so the route had no frame and a caption had one; the label
  // is `.k` now. ⚠️ `.own` is a steel-bordered SECTION, and it was on the
  // right-hand column of the `.prov` comparison, so one column rendered
  // inside a gradient box. It is the section the design puts it in: what
  // this route made, one row per page a turn named, carrying the turn it
  // came out of — real rows, off the walk already loaded.
  // ⚠️ `.turn` was BUILT and unreadable. The step's className was three
  // template literals joined with `+`, and the checker's regex wants the
  // backtick right after `className={` — so the one class this file has
  // warned about since 8 Sep reported as unbuilt while rendering correctly.
  // One literal now: the same string, formatted so the check can read it.
  ['walk',       'src/app/(app)/walk/[id]/page.tsx',     0],
  // 1 → 0 on 9 Sep: `.pulse`, the teal line that crosses the slab once when
  // a note goes in. On the one screen with no feed to show the new row, that
  // is the receipt — §0 rule 6, one line saying what happened, then silence.
  ['now',        'src/app/(app)/now/page.tsx',           0],
  ['connections','src/app/(app)/ways-in/page.tsx',      10],
  // wrong.html is three sections and only the middle one is product. §1's
  // five worked cases and §3's hard case are `.case` articles with invented
  // dates, invented entries and live-looking buttons — the design teaching
  // the mechanic. Rendering them would put fabricated records on the one
  // surface whose whole point is that its records are real. §2, "the log of
  // it", is the page: `.rec .r .d .w .k .o .me .it .rate .rules`.
  //
  // The 15: twelve are that `.case` family (case two said l x fix t a b gh
  // cost kind); `.body` is the 148px indent under a `.st` header this page
  // does not render; `.n` is that header's step number, counted because it
  // is a link or a dash on other pages and this check matches by class; and
  // `.up` is the trend colour on `.rate` — "↓ 2.1× wrong attaches, compared
  // with the first week", which is the log reading its own numbers out loud
  // (§0 rule 2). None of the fifteen can go down without building something
  // the product refuses.
  ['wrong',      'src/app/(app)/corrections/page.tsx',  15],
]

/**
 * Surfaces with no design page, and why. `everything.html` and
 * `footage.html` in the package are ENTRY EXAMPLES — their titles are
 * "Every entry is one sentence that stands on its own" and "Started
 * vlogging. About four hundred recordings" — even though SPEC §3 names
 * everything.html as the door to the machine layer and §2 describes
 * footage. The package's index and its files disagree, so those two
 * surfaces are built from the prose and cannot be scored against a drawing
 * that is of something else.
 */
const NO_DESIGN_PAGE = {
  // Files in the package that are NOT product surfaces, recorded so nobody
  // points a route at one. Three of them cost real time this session.
  '(export.html)':     'a rendered export document — /export is takeout.html',
  '(everything.html)': 'an entry example, despite SPEC §3 naming it the machine-layer door',
  '(footage.html)':    'an entry example, despite SPEC §2 describing footage',
  '(portal.html)':     'a flat map of the package\'s own HTML files, not a product page',
  '(index.html)':      'the package\'s designed hub, same',
  '/everything': 'built from SPEC §3 prose — everything.html is an entry example and portal.html is a map of the package',
  '/footage':    'built from SPEC §2 prose — footage.html is an entry example',
  '/ready': 'no page in the package', '/share': 'no page in the package',
  '/settings': 'no page in the package', '/vlogs': 'vlog.html is one recording, not the list',
}

/**
 * The frame every page carries — masthead, footer, crumb, the grid. Not
 * drift: `Shell` renders it once for all of them.
 *
 * ⚠️ `r2` is here because it IS `r`. Nine pages in the package — the ones
 * where `.r` already means a ROW — call the footer's right-hand link group
 * `.r2` instead, and `plain.css` gives the two the same rule
 * (`.ft .r2{display:flex;gap:18px}`). Shell renders `.r`, which is correct
 * on every page; charging those nine for a class that is the same element
 * under a second name is the checker being wrong about what it measured.
 */
const SHELL = new Set(['page','wrap','mh','lock','mk','wm','pv','back','crumb','ft','r','r2','sep','on','logpage','grid','main','rail'])

/**
 * The design package talking about itself, on nearly every page — and never
 * product. Counting these as drift charged twenty-odd surfaces for markup
 * that would be a bug if it shipped.
 *
 * ⚠️ Two entries only, and both were read before being put here. This is not
 * a place to send a class that is merely hard to build: a class belongs here
 * when rendering it in the product would be WRONG, not when it is unfinished.
 */
const PACKAGE_FURNITURE = new Set([
  // "A page from the spec — one mechanic, shown. The product itself is the
  // log and the expanded entry." A banner on 25 of the 74 pages telling the
  // reader they are looking at an illustration. Shipping it would be the
  // product announcing it is a mock-up.
  'specnote',
  // The principles block at the foot of a spec page, restating the rule the
  // page demonstrates — "Two owners, one entry", "Forwarded, never pulled".
  // On 24 pages. The product ENFORCES those rules in code; printing them
  // under the feature would be the log explaining itself, which is the
  // opposite of §0 rule 2.
  'rules',
  // The numbered walkthrough section, on 19 of the 74 pages — "1 a thread
  // arrives", "1 read, not looked at", "2 who wrote it" — each wrapping an
  // <h2> and a paragraph that talk the reader through the mechanic step by
  // step. Its own words give it away: "This is the whole design. Not a
  // checkbox you tick once…" The product does not number its features and
  // narrate them; that is the log explaining itself (§0 rule 2).
  //
  // ⚠️ `.n`, the number badge inside it, is NOT here. It is the step number
  // on those pages and a link or a dash on others, and this check matches by
  // class rather than by context — excluding it globally would hide real
  // gaps on the pages that use it for something else.
  'st',
])

function classesInMarkup(html) {
  const out = new Set()
  for (const m of html.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c)
  return out
}

/** My page's classes, plus every component it renders. */
/**
 * ⚠️ Only class names written as LITERALS are seen. A page that computes one
 * — `const band = n > x ? 's3' : 's2'`, then `className={band}` — reads as
 * not using it. `/month`'s density cells and its year strip are built that
 * way, so `s1 s2 s3 q some` sit in its budget while rendering perfectly;
 * `check-design-render.mjs` is what proves they do. Do not contort a page
 * into literals to satisfy this regex.
 */
function classesInPage(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return new Set()
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  const out = new Set()
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g))
    for (const c of (m[1] || m[2] || '').split(/[\s${}?:'"()]+/))
      if (c && !/^[A-Z]/.test(c) && !c.startsWith('pg-')) out.add(c)

  // A class picked from a lookup — `className={KIND_CLASS[p.kind]}` — is not
  // a literal, so the pass above cannot see it. `/pages` maps five kinds to
  // `.job .proj .subj .per .place` that way and read as using none of them.
  //
  // Only maps that are actually INDEXED inside a className are read, and only
  // their string values. That matters: `'job'` is both a design class and a
  // value of `pages.kind`, so scanning every quoted string in the file would
  // count a data value as a class and hide a real gap. Narrowing it to maps
  // the markup indexes keeps the failure direction right.
  const indexed = new Set(
    [...src.matchAll(/className=\{[^}]*?\b([A-Z][A-Z0-9_]*)\s*\[/g)].map(m => m[1]),
  )
  for (const name of indexed) {
    const decl = new RegExp(`const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src)
    if (!decl) continue
    for (const v of decl[1].matchAll(/:\s*'([a-z0-9 _-]+)'/g))
      for (const c of v[1].split(/\s+/)) if (c) out.add(c)
  }
  for (const m of src.matchAll(/from '@\/components\/([\w/-]+)'/g))
    for (const ext of ['.tsx', '.ts'])
      for (const c of classesInPage(`src/components/${m[1]}${ext}`, seen)) out.add(c)
  return out
}

const only = process.argv[2]
const rows = []
let over = 0

// One row per DESIGN page, not per route. `messages.html` covers the list and
// the thread, `writing.html` the shelf and the piece — SPEC §3, "one design,
// two views: nothing is designed twice". Two rows for one page printed the
// same number twice once the measure became the union.
const byDesign = new Map()
for (const [page, file, budget] of PAGES) {
  if (!byDesign.has(page)) byDesign.set(page, { files: [], budget })
  byDesign.get(page).files.push(file)
  // Where two routes carried different budgets, the shared one is the lower:
  // a budget is a debt, and the union cannot owe more than its smaller half.
  byDesign.get(page).budget = Math.min(byDesign.get(page).budget, budget)
}

for (const [page, { files, budget }] of byDesign) {
  if (only && page !== only) continue
  const design = `design/markup/${page}.html`
  if (!existsSync(design)) { console.error(`  design/markup/${page}.html missing`); over++; continue }
  for (const f of files) {
    if (!existsSync(f)) { console.error(`  ${f} missing — did a route move?`); over++ }
  }

  const used = classesInMarkup(readFileSync(design, 'utf8'))
  // ⚠️ One design page can cover TWO routes — SPEC §3, "one design, two
  // views: nothing is designed twice". `messages.html` is the list and the
  // thread; `writing.html` is the shelf and the piece. Measuring each route
  // against the whole page separately charged the list for the thread's
  // classes and the thread for the list's, so both carried debt for markup
  // that exists in the other half. The measure is the union.
  const mine = new Set()
  for (const f of files) for (const c of classesInPage(f)) mine.add(c)
  const missing = [...used]
    .filter(c => !mine.has(c) && !SHELL.has(c) && !PACKAGE_FURNITURE.has(c))
    .sort()
  rows.push({ page, files, n: missing.length, budget, missing })
  if (missing.length > budget) over++
}

const w = Math.max(...rows.map(r => r.page.length))
for (const r of rows) {
  const flag = r.n > r.budget ? '  DRIFTED' : r.n < r.budget ? '  ↓ lower the budget' : ''
  console.log(`  ${r.page.padEnd(w)}  ${String(r.n).padStart(3)} / ${String(r.budget).padEnd(3)} unused${flag}`)
  // Naming the classes is the whole point when you are working a budget
  // down: a count says a page has drifted, the list says where to start.
  if (r.n > r.budget || only) console.log(`      ${r.missing.join(' ')}`)
}
console.log(`\n${rows.length} pages measured against design/. ${Object.keys(NO_DESIGN_PAGE).length} surfaces have no design page (listed in this file, with why).`)

if (over) {
  console.error(`\n${over} page${over === 1 ? '' : 's'} drifted further from the design than its budget allows.`)
  console.error('Every budget here is a debt, not a target — the real number is zero.')
  process.exit(1)
}
console.log('No page has drifted.')
