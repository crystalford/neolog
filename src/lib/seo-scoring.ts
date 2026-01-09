/**
 * SEO Scoring Utilities
 *
 * Analyzes content for SEO optimization and provides actionable suggestions.
 */

export interface SEOAnalysis {
  score: number // 0-100
  title: {
    length: number
    score: number
    optimal: boolean
    suggestion?: string
  }
  description: {
    length: number
    score: number
    optimal: boolean
    suggestion?: string
  }
  readability: {
    score: number // Flesch Reading Ease
    grade: string
    optimal: boolean
    suggestion?: string
  }
  headings: {
    h1Count: number
    h2Count: number
    h3Count: number
    hierarchy: boolean
    score: number
    suggestion?: string
  }
  images: {
    total: number
    withAlt: number
    withoutAlt: number
    score: number
    suggestion?: string
  }
  keywords: {
    density: number
    score: number
    topKeywords: Array<{ word: string; count: number }>
    suggestion?: string
  }
  internalLinks: {
    count: number
    score: number
    suggestion?: string
  }
  wordCount: number
  suggestions: string[]
}

/**
 * Analyze title for SEO
 */
export function analyzeTitle(title: string): SEOAnalysis['title'] {
  const length = title.length

  let score = 100
  let suggestion: string | undefined

  if (length < 30) {
    score = 40
    suggestion = `Title too short (${length} chars). Aim for 50-60 characters for better SEO.`
  } else if (length < 50) {
    score = 70
    suggestion = `Title could be longer (${length} chars). Optimal: 50-60 characters.`
  } else if (length <= 60) {
    score = 100
    suggestion = undefined
  } else if (length <= 70) {
    score = 85
    suggestion = `Title slightly long (${length} chars). May get truncated in search results.`
  } else {
    score = 60
    suggestion = `Title too long (${length} chars). Will be truncated in search results. Keep under 60.`
  }

  return {
    length,
    score,
    optimal: length >= 50 && length <= 60,
    suggestion,
  }
}

/**
 * Analyze meta description
 */
export function analyzeDescription(description: string): SEOAnalysis['description'] {
  const length = description.length

  let score = 100
  let suggestion: string | undefined

  if (length === 0) {
    score = 0
    suggestion = 'Missing meta description. Add 120-160 characters describing your post.'
  } else if (length < 70) {
    score = 40
    suggestion = `Description too short (${length} chars). Aim for 120-160 characters.`
  } else if (length < 120) {
    score = 70
    suggestion = `Description could be longer (${length} chars). Optimal: 120-160 characters.`
  } else if (length <= 160) {
    score = 100
    suggestion = undefined
  } else if (length <= 180) {
    score = 85
    suggestion = `Description slightly long (${length} chars). May get truncated.`
  } else {
    score = 60
    suggestion = `Description too long (${length} chars). Will be truncated. Keep under 160.`
  }

  return {
    length,
    score,
    optimal: length >= 120 && length <= 160,
    suggestion,
  }
}

/**
 * Calculate Flesch Reading Ease score
 * Higher = easier to read
 * 90-100: Very easy (5th grade)
 * 80-89: Easy (6th grade)
 * 70-79: Fairly easy (7th grade)
 * 60-69: Standard (8th-9th grade)
 * 50-59: Fairly difficult (10th-12th grade)
 * 30-49: Difficult (college)
 * 0-29: Very difficult (college graduate)
 */
export function calculateReadability(text: string): SEOAnalysis['readability'] {
  // Remove HTML tags
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  // Count sentences (. ! ? followed by space or end)
  const sentences = plainText.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const sentenceCount = sentences.length || 1

  // Count words
  const words = plainText.split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length || 1

  // Count syllables (rough approximation)
  const syllableCount = words.reduce((count, word) => {
    return count + countSyllables(word)
  }, 0)

  // Flesch Reading Ease = 206.835 - 1.015 × (words/sentences) - 84.6 × (syllables/words)
  const avgWordsPerSentence = wordCount / sentenceCount
  const avgSyllablesPerWord = syllableCount / wordCount

  const fleschScore = Math.max(
    0,
    Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)
  )

  let grade = ''
  let optimal = false
  let suggestion: string | undefined
  let score = 50

  if (fleschScore >= 70) {
    grade = '7th grade'
    optimal = true
    score = 100
  } else if (fleschScore >= 60) {
    grade = '8th-9th grade'
    optimal = true
    score = 90
    suggestion = 'Good readability. Consider simplifying complex sentences.'
  } else if (fleschScore >= 50) {
    grade = '10th-12th grade'
    score = 70
    suggestion = 'Fairly difficult. Try shorter sentences and simpler words.'
  } else if (fleschScore >= 30) {
    grade = 'College'
    score = 50
    suggestion = 'Difficult to read. Break up long sentences and use simpler language.'
  } else {
    grade = 'Graduate'
    score = 30
    suggestion = 'Very difficult. Most readers will struggle. Simplify significantly.'
  }

  return {
    score: Math.round(fleschScore),
    grade,
    optimal,
    suggestion,
  }
}

/**
 * Count syllables in a word (approximation)
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '')
  if (word.length <= 3) return 1

  // Count vowel groups
  const vowels = word.match(/[aeiouy]+/g)
  let syllables = vowels ? vowels.length : 1

  // Subtract silent 'e'
  if (word.endsWith('e')) syllables--

  // At least 1 syllable
  return Math.max(1, syllables)
}

/**
 * Analyze heading structure
 */
export function analyzeHeadings(html: string): SEOAnalysis['headings'] {
  const h1Count = (html.match(/<h1[^>]*>/gi) || []).length
  const h2Count = (html.match(/<h2[^>]*>/gi) || []).length
  const h3Count = (html.match(/<h3[^>]*>/gi) || []).length

  let score = 100
  let suggestion: string | undefined
  let hierarchy = true

  if (h1Count === 0) {
    score = 40
    suggestion = 'Missing H1 heading. Add a main heading (title).'
    hierarchy = false
  } else if (h1Count > 1) {
    score = 60
    suggestion = 'Multiple H1 headings found. Use only one H1 per page.'
    hierarchy = false
  } else if (h2Count === 0 && h3Count > 0) {
    score = 70
    suggestion = 'H3 used without H2. Maintain proper heading hierarchy (H1 → H2 → H3).'
    hierarchy = false
  } else if (h2Count === 0) {
    score = 80
    suggestion = 'No H2 headings. Consider adding subheadings to structure your content.'
  }

  return {
    h1Count,
    h2Count,
    h3Count,
    hierarchy,
    score,
    suggestion,
  }
}

/**
 * Analyze images
 */
export function analyzeImages(html: string): SEOAnalysis['images'] {
  const imgTags = html.match(/<img[^>]*>/gi) || []
  const total = imgTags.length

  const withAlt = imgTags.filter(tag => /alt\s*=\s*["'][^"']+["']/i.test(tag)).length
  const withoutAlt = total - withAlt

  let score = total === 0 ? 100 : Math.round((withAlt / total) * 100)
  let suggestion: string | undefined

  if (withoutAlt > 0) {
    suggestion = `${withoutAlt} image${withoutAlt > 1 ? 's' : ''} missing alt text. Add descriptive alt text for SEO and accessibility.`
  }

  return {
    total,
    withAlt,
    withoutAlt,
    score,
    suggestion,
  }
}

/**
 * Analyze keywords
 */
export function analyzeKeywords(text: string): SEOAnalysis['keywords'] {
  const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase()
  const words = plainText.split(/\s+/).filter(w => w.length > 3) // Only words > 3 chars

  const wordFreq = new Map<string, number>()
  words.forEach(word => {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
  })

  const topKeywords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }))

  const totalWords = words.length || 1
  const topKeywordCount = topKeywords[0]?.count || 0
  const density = (topKeywordCount / totalWords) * 100

  let score = 100
  let suggestion: string | undefined

  if (density > 5) {
    score = 60
    suggestion = `Keyword "${topKeywords[0]?.word}" appears too often (${density.toFixed(1)}%). Risk of keyword stuffing.`
  } else if (density < 1) {
    score = 80
    suggestion = 'Consider focusing on a main keyword/topic (1-3% density).'
  }

  return {
    density,
    score,
    topKeywords,
    suggestion,
  }
}

/**
 * Analyze internal links
 */
export function analyzeInternalLinks(html: string): SEOAnalysis['internalLinks'] {
  const linkMatches = html.match(/<a[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi) || []
  const count = linkMatches.length

  let score = 100
  let suggestion: string | undefined

  if (count === 0) {
    score = 60
    suggestion = 'No internal links found. Link to related posts to improve SEO.'
  } else if (count < 2) {
    score = 80
    suggestion = 'Add more internal links to related content (aim for 2-5).'
  }

  return {
    count,
    score,
    suggestion,
  }
}

/**
 * Perform complete SEO analysis
 */
export function analyzeSEO(
  title: string,
  description: string,
  content: string
): SEOAnalysis {
  const titleAnalysis = analyzeTitle(title)
  const descAnalysis = analyzeDescription(description)
  const readabilityAnalysis = calculateReadability(content)
  const headingsAnalysis = analyzeHeadings(content)
  const imagesAnalysis = analyzeImages(content)
  const keywordsAnalysis = analyzeKeywords(content)
  const linksAnalysis = analyzeInternalLinks(content)

  // Count words
  const plainText = content.replace(/<[^>]*>/g, ' ')
  const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    (titleAnalysis.score * 0.2 +
      descAnalysis.score * 0.15 +
      readabilityAnalysis.score * 0.15 +
      headingsAnalysis.score * 0.15 +
      imagesAnalysis.score * 0.15 +
      keywordsAnalysis.score * 0.1 +
      linksAnalysis.score * 0.1) /
      1.0
  )

  // Compile all suggestions
  const suggestions = [
    titleAnalysis.suggestion,
    descAnalysis.suggestion,
    readabilityAnalysis.suggestion,
    headingsAnalysis.suggestion,
    imagesAnalysis.suggestion,
    keywordsAnalysis.suggestion,
    linksAnalysis.suggestion,
  ].filter((s): s is string => s !== undefined)

  return {
    score: overallScore,
    title: titleAnalysis,
    description: descAnalysis,
    readability: readabilityAnalysis,
    headings: headingsAnalysis,
    images: imagesAnalysis,
    keywords: keywordsAnalysis,
    internalLinks: linksAnalysis,
    wordCount,
    suggestions,
  }
}
