import { createClient } from '@supabase/supabase-js'
import { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Only the main home/intelligence landing page for now
  // We can add dynamic routes for synthesized intelligence logs later
  return [
    { 
      url: BASE_URL, 
      lastModified: new Date(), 
      changeFrequency: 'daily' as const, 
      priority: 1 
    },
  ]
}
