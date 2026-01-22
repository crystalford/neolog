import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    const hostname = request.headers.get('host') || ''

    // Skip middleware for localhost and neolog.com domains
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.endsWith('.neolog.com') || hostname === 'neolog.com') {
        return NextResponse.next()
    }

    // This is a custom domain - rewrite to publication route
    // We'll handle the publication lookup in the page component
    const url = request.nextUrl.clone()
    url.searchParams.set('customDomain', hostname)

    return NextResponse.rewrite(url)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}
