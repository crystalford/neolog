import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, username, email:id')
      .eq('id', session.user.id)
      .single()

    let accountId = profile?.stripe_account_id

    // Create Connect account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: session.user.email,
        metadata: { supabase_user_id: session.user.id },
        capabilities: {
          transfers: { requested: true },
        },
      })
      accountId = account.id

      await supabase
        .from('profiles')
        .update({ stripe_account_id: accountId })
        .eq('id', session.user.id)
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/earnings?refresh=true`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/earnings?connected=true`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error) {
    console.error('Connect error:', error)
    return NextResponse.json({ error: 'Failed to create account link' }, { status: 500 })
  }
}

// Check account status
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ connected: false, enabled: false })
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id)
    const enabled = account.charges_enabled && account.payouts_enabled

    // Update profile if status changed
    await supabase
      .from('profiles')
      .update({ stripe_account_enabled: enabled })
      .eq('id', session.user.id)

    return NextResponse.json({ 
      connected: true, 
      enabled,
      details_submitted: account.details_submitted,
    })
  } catch (error) {
    console.error('Connect status error:', error)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
