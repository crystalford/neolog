/**
 * /landing redirects to /. The canon merges Timeline + Landing — both
 * authed FYP and unauthed public landing are served at `/` (the
 * Timeline page detects 401 from /api/v2/timeline and renders public
 * mode). The middleware already redirects /landing → / at the edge;
 * this is the in-app belt-and-suspenders fallback.
 */

import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default function LandingRedirect() {
  redirect('/')
}
