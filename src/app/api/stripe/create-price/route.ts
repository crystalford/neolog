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

    const { tierId, name, priceCents } = await request.json()

    // Get user's Stripe account
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, username, display_name')
      .eq('id', session.user.id)
      .single()

    // Create or get product for this creator
    let productId: string

    const { data: existingTier } = await supabase
      .from('subscription_tiers')
      .select('stripe_price_id')
      .eq('creator_id', session.user.id)
      .not('stripe_price_id', 'is', null)
      .limit(1)
      .single()

    if (existingTier?.stripe_price_id) {
      // Get product from existing price
      const existingPrice = await stripe.prices.retrieve(existingTier.stripe_price_id)
      productId = existingPrice.product as string
    } else {
      // Create new product for this creator
      const product = await stripe.products.create({
        name: `${profile?.display_name || profile?.username}'s Subscriptions`,
        metadata: { creator_id: session.user.id },
      })
      productId = product.id
    }

    // Create price
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: priceCents,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        tier_id: tierId,
        creator_id: session.user.id,
      },
    })

    return NextResponse.json({ priceId: price.id })
  } catch (error) {
    console.error('Create price error:', error)
    return NextResponse.json({ error: 'Failed to create price' }, { status: 500 })
  }
}
