/**
 * AI Writing Assistant Utilities
 *
 * Helper functions for smart writing features like auto-generating
 * meta descriptions, suggesting titles, and finding related posts.
 */

/**
 * Generate a concise meta description from content
 * Extracts the first meaningful paragraph and trims to 120-160 chars
 */
export function generateMetaDescription(content: string, title: string = ''): string {
  // Remove HTML tags and markdown formatting
  let plain = content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/#{1,6}\s/g, '') // Remove markdown headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()

  // If content is empty, use title
  if (!plain) {
    if (title) {
      return `Read about ${title.toLowerCase()} and discover insights, tips, and best practices.`
    }
    return ''
  }

  // Find the first substantial paragraph (at least 40 chars)
  const paragraphs = plain.split(/\n+/).filter(p => p.trim().length >= 40)
  let description = paragraphs[0] || plain

  // Trim to optimal length (120-160 characters)
  if (description.length > 160) {
    description = description.substring(0, 157).trim() + '...'
  } else if (description.length < 120 && paragraphs[1]) {
    // Try to add more context from second paragraph
    const extra = ' ' + paragraphs[1]
    if ((description + extra).length <= 160) {
      description += extra
    } else {
      const remaining = 157 - description.length
      description += extra.substring(0, remaining).trim() + '...'
    }
  }

  return description
}

/**
 * Suggest alternative titles based on SEO best practices
 * Returns an array of title variations optimized for different goals
 */
export function suggestTitles(currentTitle: string, content: string): string[] {
  const suggestions: string[] = []

  if (!currentTitle || currentTitle.length < 10) {
    return [
      'Make it descriptive (50-60 chars)',
      'Include your main keyword',
      'Make it compelling and clickable'
    ]
  }

  const titleLength = currentTitle.length
  const words = currentTitle.split(' ')

  // SEO length optimization
  if (titleLength < 40) {
    suggestions.push(`Add context: "${currentTitle} - A Complete Guide"`)
  } else if (titleLength > 65) {
    const shortened = words.slice(0, Math.floor(words.length * 0.7)).join(' ')
    suggestions.push(`Shorten for SEO: "${shortened}"`)
  }

  // Number-based variations (perform well)
  if (!/\d/.test(currentTitle)) {
    suggestions.push(`Add specificity: "7 ${currentTitle}" or "${currentTitle}: 5 Key Points"`)
  }

  // Question format (high engagement)
  if (!currentTitle.includes('?') && !currentTitle.startsWith('How') && !currentTitle.startsWith('What')) {
    suggestions.push(`Ask a question: "How to ${currentTitle}"`)
  }

  // Power words
  const powerWords = ['Ultimate', 'Essential', 'Complete', 'Definitive', 'Proven']
  const hasPowerWord = powerWords.some(w => currentTitle.includes(w))
  if (!hasPowerWord && suggestions.length < 3) {
    suggestions.push(`Add impact: "The Ultimate Guide to ${currentTitle}"`)
  }

  return suggestions.slice(0, 3)
}

/**
 * Find related posts that could be internally linked
 * Based on shared keywords and tags
 */
export async function findRelatedPosts(
  currentContent: string,
  currentTitle: string,
  authorId: string,
  supabaseClient: any,
  excludePostId?: string
): Promise<Array<{ id: string; title: string; slug: string; relevance: string }>> {
  // Extract keywords from current content (words > 4 chars, excluding common words)
  const commonWords = new Set(['this', 'that', 'with', 'from', 'have', 'your', 'more', 'about', 'here', 'when', 'where', 'which', 'there', 'their', 'would', 'could', 'should'])

  const plain = currentTitle + ' ' + currentContent.replace(/<[^>]*>/g, ' ').toLowerCase()
  const words = plain.split(/\s+/)
    .filter((w: string) => w.length > 4 && !commonWords.has(w))
    .filter((w: string) => /^[a-z]+$/.test(w)) // Only letters

  // Count word frequency
  const wordFreq = new Map<string, number>()
  words.forEach((w: string) => wordFreq.set(w, (wordFreq.get(w) || 0) + 1))

  // Get top 10 keywords
  const topKeywords = Array.from(wordFreq.entries())
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]: [string, number]) => word)

  if (topKeywords.length === 0) {
    return []
  }

  // Query for posts with similar keywords in title/content
  let query = supabaseClient
    .from('posts')
    .select('id, title, slug, content')
    .eq('author_id', authorId)
    .eq('status', 'published')
    .limit(20)

  if (excludePostId) {
    query = query.neq('id', excludePostId)
  }

  const { data: posts } = await query

  if (!posts || posts.length === 0) {
    return []
  }

  // Score each post by keyword overlap
  const scored = posts.map((post: any) => {
    const postText = (post.title + ' ' + (post.content || '')).toLowerCase()
    const matches = topKeywords.filter((kw: string) => postText.includes(kw))

    let relevanceText = ''
    if (matches.length > 0) {
      relevanceText = `Shares "${matches[0]}"${matches.length > 1 ? ` and ${matches.length - 1} more keywords` : ''}`
    }

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      score: matches.length,
      relevance: relevanceText
    }
  })

  // Return top 5 matches
  return scored
    .filter((p: any) => p.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5)
}

/**
 * Identify complex sentences that could be simplified
 * Returns array of sentences with high readability scores (difficult to read)
 */
export function findComplexSentences(content: string): Array<{ sentence: string; issue: string }> {
  const plain = content.replace(/<[^>]*>/g, ' ').trim()
  const sentences = plain.split(/[.!?]+/).filter((s: string) => s.trim().length > 0)

  const complex: Array<{ sentence: string; issue: string }> = []

  sentences.forEach((sentence: string) => {
    const words = sentence.trim().split(/\s+/)
    const wordCount = words.length

    // Too long (20+ words)
    if (wordCount > 20) {
      complex.push({
        sentence: sentence.trim(),
        issue: `Long sentence (${wordCount} words). Consider breaking into 2-3 shorter sentences.`
      })
      return
    }

    // Passive voice indicators
    const passiveIndicators = ['was', 'were', 'been', 'being', 'is', 'are', 'am']
    const pastParticiples = words.filter((w: string) => w.endsWith('ed') || w.endsWith('en'))
    const hasPassive = passiveIndicators.some((pi: string) => sentence.includes(` ${pi} `)) && pastParticiples.length > 0

    if (hasPassive && wordCount > 12) {
      complex.push({
        sentence: sentence.trim(),
        issue: 'Possible passive voice. Consider active voice for clarity.'
      })
      return
    }

    // Complex words (3+ syllables)
    const complexWords = words.filter((w: string) => {
      const syllables = w.match(/[aeiouy]+/g)?.length || 0
      return syllables >= 3
    })

    if (complexWords.length / wordCount > 0.3) {
      complex.push({
        sentence: sentence.trim(),
        issue: 'Many complex words. Simplify where possible.'
      })
    }
  })

  return complex.slice(0, 5) // Return top 5 most complex
}
