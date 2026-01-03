import { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/',
          '/settings',
          '/dashboard',
          '/analytics',
          '/earnings',
          '/tiers',
          '/boost',
          '/subscribers',
          '/notifications',
          '/write',
          '/onboarding',
          '/saved',
          '/history',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
