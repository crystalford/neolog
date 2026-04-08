export const runtime = 'edge'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { finishJobRun, startJobRun } from '@/lib/jobRuns'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let runId: string | null = null
  let finalStatus: 'success' | 'error' = 'error'
  let finalMeta: Record<string, any> = {}
  let finalErrorMessage: string | undefined = undefined

  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const { creatorId, postId, amountCents, message, isAnonymous } = await request.json().catch(() => ({}))

    finalMeta = {
      from_user_id: session?.user?.id || null,
      to_user_id: typeof creatorId === 'string' ? creatorId : null,
      post_id: typeof postId === 'string' ? postId : null,
      amount_cents: typeof amountCents === 'number' ? amountCents : null,
      is_anonymous: Boolean(isAnonymous),
      has_message: Boolean(message && String(message).trim()),
    }
    try {
      const run = await startJobRun('stripe.tip.create_intent', finalMeta)
      runId = run.id
    } catch {
      // best-effort
    }

    if (amountCents < 100) {
      finalErrorMessage = 'Minimum tip is $1'
      return NextResponse.json({ error: 'Minimum tip is $1' }, { status: 400 })
    }

    // Get creator's Stripe account
    const { data: creator } = await supabase
      .from('profiles')
      .select('username, stripe_account_id')
      .eq('id', creatorId)
      .single()

    if (!creator) {
      finalErrorMessage = 'Creator not found'
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    }

    // Calculate fees (10% platform fee)
    const platformFee = Math.round(amountCents * 0.1)

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      application_fee_amount: platformFee,
      transfer_data: creator.stripe_account_id ? {
        destination: creator.stripe_account_id,
      } : undefined,
      metadata: {
        type: 'tip',
        from_user_id: session?.user?.id || 'anonymous',
        to_user_id: creatorId,
        post_id: postId || '',
        message: message || '',
        is_anonymous: String(isAnonymous || false),
      },
    })

    finalStatus = 'success'
    finalMeta = { ...finalMeta, stripe_payment_intent_id: paymentIntent.id }
    return NextResponse.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error) {
    console.error('Tip error:', error)
    finalErrorMessage = 'Failed to create tip'
    return NextResponse.json({ error: 'Failed to create tip' }, { status: 500 })
  } finally {
    try {
      if (runId) {
        await finishJobRun(
          runId,
          finalStatus,
          { duration_ms: Date.now() - startedAt, ...finalMeta },
          finalErrorMessage,
        )
      }
    } catch {
      // best-effort
    }
  }
}
