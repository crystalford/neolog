/**
 * ActivityPub Publication Actor Endpoint
 *
 * Returns ActivityPub Actor (Organization) object for a publication.
 *
 * GET /api/activitypub/publications/:slug
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicationActor } from '@/lib/activitypub'
import { getOrCreatePublicationKeys } from '@/lib/activitypub-publication-keys'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params
  const admin = createAdminClient()

  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }

  const { data: publication, error } = await admin
    .from('publications')
    .select('id, slug, name, description, logo_url, website_url, twitter_url, github_url, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !publication || !publication.is_active) {
    return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
  }

  let publicKeyPem = ''
  try {
    const keys = await getOrCreatePublicationKeys(publication.id)
    publicKeyPem = keys.publicKeyPem
  } catch {
    return NextResponse.json({ error: 'Failed to initialize actor keys' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const actor = createPublicationActor(
    {
      slug: publication.slug,
      name: publication.name,
      description: publication.description,
      logo_url: publication.logo_url,
      website_url: publication.website_url,
      twitter_url: publication.twitter_url,
      github_url: publication.github_url,
      public_key_pem: publicKeyPem,
    },
    appUrl
  )

  return NextResponse.json(actor, {
    headers: {
      'Content-Type': 'application/activity+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
