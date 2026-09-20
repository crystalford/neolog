'use client'

/**
 * The masthead — `log.html`'s, markup and classes.
 *
 * The mark, the wordmark, the "private · only you see this" pill, and three
 * links: home · search · index. That is the entire header on every page of
 * the design package.
 *
 * ── What is gone, and why ────────────────────────────────────────────────
 *
 * An avatar with a dropdown of destinations — Chat, Inbox, Studio, a podcast
 * feed, Settings, Sign out. The design has no avatar and no dropdown. The
 * operator, 8 Sep, looking at the deployed site: *"even the user profile
 * thing looks like the old design."* He was right; it was the old design,
 * whole.
 *
 * There is one operator. An avatar identifies which of several people is
 * signed in, and answers a question nobody here has. The two things the
 * dropdown carried that still exist — settings and the way out — are in the
 * footer, which is where `log.html` puts its secondary doors.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * ⚠️ 20 Sep — `index` is out, and `recordings` is in its place.
 *
 * The design package's masthead is home · search · index on every one of its
 * pages, and this followed it. The operator, looking at `/pages`: *"what is
 * 'the index'? why is it here? its blank, useless"* — and, told what it was,
 * *"i don't know what that is so i guess remove it.. like .. the design was
 * a starting point, if we have a blank page it doesn't make sense."*
 *
 * He is right about this log. A page is made only when he names something,
 * nothing seeds them (deliberately — the log inventing pages is the log
 * deciding what is significant in his life, deleted 8 Sep), and what he puts
 * in is recordings. So the index would have stayed empty and sat in the nav
 * anyway, which is a door onto a blank room.
 *
 * `/pages` is NOT deleted — it works, it is still linked from the log's
 * footer, and the moment he names a person or a project it is where they
 * live. It is only out of the masthead.
 *
 * What took the slot is the thing he could not find when he needed it: the
 * recordings, and the bulk uploader on them. That was reachable only from a
 * page reachable only from a dropdown that no longer exists.
 */
const NAV: { label: string; href: string; on: RegExp[] }[] = [
  { label: 'home',       href: '/',      on: [/^\/$/, /^\/now/, /^\/entry\//, /^\/walk\//] },
  { label: 'search',     href: '/search', on: [/^\/search/] },
  { label: 'recordings', href: '/vlogs', on: [/^\/vlogs/, /^\/vlog\//] },
]

export function Masthead() {
  const pathname = usePathname() ?? '/'
  const here = NAV.find(i => i.on.some(rx => rx.test(pathname)))
  return (
    <header className="mh">
      <Link className="lock" href="/">
        <span className="mk">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
            <circle cx="3" cy="16" r="2.4" fill="currentColor"/>
            <circle cx="29" cy="16" r="2.4" fill="currentColor"/>
          </svg>
        </span>
        <span className="wm">neolog</span>
      </Link>

      {/* `log.html`: "home · private · only you see this" — the page's own
          name is part of the pill, so the masthead says where you are
          without a second row to say it. */}
      <span className="pv">
        {here ? `${here.label} · ` : ''}private · only you see this
      </span>

      <nav>
        {NAV.map(item => (
          <Link key={item.href} href={item.href} className={here?.href === item.href ? 'on' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
