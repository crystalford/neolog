import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Confirm email subscription
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  
  if (!token) {
    return NextResponse.redirect(new URL('/?error=invalid_token', request.url))
  }

  const supabase = createClient()
  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.redirect(new URL('/?error=server_misconfigured', request.url))
  }

  // Find subscriber with this token
  const { data: subscriber, error: findError } = await admin
    .from('email_subscribers')
    .select('id, creator_id, confirmed, confirmation_token')
    .eq('confirmation_token', token)
    .single()

  if (findError || !subscriber) {
    return NextResponse.redirect(new URL('/?error=invalid_token', request.url))
  }

  const { data: creator } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', subscriber.creator_id)
    .single()

  // Already confirmed?
  if (subscriber.confirmed) {
    const creatorUsername = creator?.username || ''
    return NextResponse.redirect(new URL(`/${creatorUsername}?confirmed=already`, request.url))
  }

  // Confirm the subscription
  const { error: updateError } = await admin
    .from('email_subscribers')
    .update({
      status: 'active',
      confirmed: true,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', subscriber.id)

  if (updateError) {
    return NextResponse.redirect(new URL('/?error=confirmation_failed', request.url))
  }

  // Redirect to creator's profile with success message
  const creatorUsername = creator?.username || ''
  return NextResponse.redirect(new URL(`/${creatorUsername}?confirmed=success`, request.url))
}

// Unsubscribe
export async function DELETE(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Find and unsubscribe
  const { error } = await admin
    .from('email_subscribers')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: new Date().toISOString(),
    })
    .eq('unsubscribe_token', token)

  if (error) {
    return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
