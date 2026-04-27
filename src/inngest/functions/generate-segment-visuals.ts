import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadBuffer } from '@/lib/storage/r2'
import Replicate from 'replicate'

// Replicate SDK v1.4 returns FileOutput objects (not strings) and sometimes arrays.
function extractReplicateUrl(output: unknown): string | null {
  const value = Array.isArray(output) ? output[0] : output
  if (!value) return null
  const url = typeof value === 'string' ? value : String(value)
  return url.startsWith('http') ? url : null
}

type GenerateVisualsEvent = {
  name: 'studio/generate-visuals'
  data: {
    production_id: string
    user_id: string
  }
}

export const generateSegmentVisuals = inngest.createFunction(
  {
    id: 'generate-segment-visuals',
    name: 'Generate Segment Visuals',
    retries: 1,
    timeouts: { finish: '30m' },
  },
  { event: 'studio/generate-visuals' },
  async ({ event, step }) => {
    const { production_id, user_id } = event.data
    const admin = createAdminClient()
    if (!admin) throw new Error('Admin client not available')

    const replicateToken = process.env.REPLICATE_API_TOKEN
    if (!replicateToken) throw new Error('REPLICATE_API_TOKEN not set')

    const markStatus = async (status: string) => {
      await admin.from('productions').update({
        status,
        updated_at: new Date().toISOString(),
      }).eq('id', production_id)
    }

    // ── Step 1: Load production context + segment assets ──
    const context = await step.run('load-context', async () => {
      const { data: production, error: prodErr } = await admin
        .from('productions')
        .select('id, style_card_id, style_cards(register, palette, lens, film_stock)')
        .eq('id', production_id)
        .single()

      if (prodErr || !production) throw new Error('Production not found')

      const { data: segments, error: segErr } = await admin
        .from('segment_assets')
        .select('id, segment_order, segment_type, narration, visual_direction, planned_duration_seconds')
        .eq('production_id', production_id)
        .order('segment_order')

      if (segErr || !segments?.length) throw new Error('No segment assets found')

      const styleCard = (production as any).style_cards as {
        register: string | null
        palette: string | null
        lens: string | null
        film_stock: string | null
      } | null

      return { segments, styleCard }
    })

    // ── Step 2: Generate a Flux image for each segment ──
    const imageKeys = await step.run('generate-images', async () => {
      const replicate = new Replicate({ auth: replicateToken })
      const keys: Record<string, string> = {} // segment_id → R2 key

      for (const seg of context.segments) {
        const visualDir = (seg as any).visual_direction as string | null
        if (!visualDir) continue

        // Build a concise Flux prompt from visual direction + style card
        const styleHints = context.styleCard
          ? [
              context.styleCard.register ? `${context.styleCard.register} style` : '',
              context.styleCard.palette ? `color palette: ${context.styleCard.palette}` : '',
              context.styleCard.film_stock ? `shot on ${context.styleCard.film_stock}` : '',
              context.styleCard.lens ? context.styleCard.lens : '',
            ].filter(Boolean).join(', ')
          : ''

        const prompt = styleHints
          ? `${visualDir}. ${styleHints}. Cinematic still, no text, no captions.`
          : `${visualDir}. Cinematic still, no text, no captions.`

        const output = await replicate.run(
          'black-forest-labs/flux-schnell' as any,
          {
            input: {
              prompt,
              aspect_ratio: '16:9',
              num_outputs: 1,
              output_format: 'webp',
              go_fast: true,
            },
          },
        )

        const imageUrl = extractReplicateUrl(output)
        if (!imageUrl) continue

        // Download + store in R2
        const imgRes = await fetch(imageUrl)
        if (!imgRes.ok) continue
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
        const r2Key = `${user_id}/visuals/${production_id}/seg_${seg.segment_order}.webp`
        await uploadBuffer(r2Key, imgBuffer, 'image/webp')

        // Update segment_asset
        await admin.from('segment_assets').update({
          image_r2_key: r2Key,
          updated_at: new Date().toISOString(),
        }).eq('id', seg.id)

        keys[seg.id] = r2Key
      }

      return keys
    })

    // ── Step 3: Fire compose-video ──
    await step.run('fire-compose', async () => {
      await markStatus('composing')
      await inngest.send({
        name: 'studio/compose-video',
        data: { production_id, user_id },
      })
    })

    return {
      status: 'composing',
      production_id,
      imagesGenerated: Object.keys(imageKeys).length,
    }
  },
)
