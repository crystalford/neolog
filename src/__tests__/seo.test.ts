import { generateSEO } from '@/lib/seo'

describe('generateSEO', () => {
  it('builds canonical and OpenGraph fields', () => {
    const meta = generateSEO({
      title: 'Test Post',
      description: 'A short description',
      url: '/test-post',
    })

    expect(meta.alternates?.canonical).toBe('https://neolog.ai/test-post')
    expect(meta.openGraph?.title).toBe('Test Post - Neolog')
    expect(meta.openGraph?.images?.[0]?.url).toBe('https://neolog.ai/og-default.png')
  })
})
