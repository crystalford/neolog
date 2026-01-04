import { NextRequest, NextResponse } from 'next/server'

const RESERVED = new Set([
  'api',
  '_next',
  'dashboard',
  'auth',
  'explore',
  'visuals',
  'privacy',
  'tos',
  'search',
  'tags',
  'tag',
  'unsubscribe',
  'admin',
  'earnings',
  'curators',
  'onboarding',
])

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (searchParams.get('format') !== 'json') {
    return NextResponse.next()
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return NextResponse.next()
  if (RESERVED.has(segments[0])) return NextResponse.next()

  if (segments.length === 1) {
    const url = request.nextUrl.clone()
    url.pathname = '/api/agent/user'
    url.search = `?username=${segments[0]}`
    return NextResponse.rewrite(url)
  }

  if (segments.length === 2) {
    if (['feed', 'topics', 'newsletters'].includes(segments[1])) {
      return NextResponse.next()
    }
    const url = request.nextUrl.clone()
    url.pathname = '/api/agent/post'
    url.search = `?username=${segments[0]}&slug=${segments[1]}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
