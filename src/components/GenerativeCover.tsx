'use client'

/**
 * Generative Cover Component
 *
 * Displays a deterministic, shader-generated cover image for a post.
 * The visual is unique to each post and changes if the content changes.
 */

import { useEffect, useState } from 'react'
import { hashString, hashToParams, getShaderPattern, generateCoverDataUrl } from '@/lib/shaders'

interface GenerativeCoverProps {
  /**
   * Unique identifier for the post (used to generate consistent visuals)
   * Typically: post.id + post.title + post.content.slice(0, 100)
   */
  contentSeed: string

  /** Width in pixels */
  width?: number

  /** Height in pixels */
  height?: number

  /** Optional title to overlay */
  title?: string

  /** Optional author to overlay */
  author?: string

  /** Show pattern name (for debugging) */
  showPatternName?: boolean

  /** CSS class */
  className?: string
}

export function GenerativeCover({
  contentSeed,
  width = 1200,
  height = 630,
  title,
  author,
  showPatternName = false,
  className = '',
}: GenerativeCoverProps) {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [pattern, setPattern] = useState<string>('')

  useEffect(() => {
    const hash = hashString(contentSeed)
    const params = hashToParams(hash)
    const patternName = getShaderPattern(params.pattern)

    setPattern(patternName)

    // Generate cover image
    const url = generateCoverDataUrl(contentSeed, {
      width,
      height,
      title,
      author,
    })

    setDataUrl(url)
  }, [contentSeed, width, height, title, author])

  if (!dataUrl) {
    return (
      <div
        className={`bg-gray-200 animate-pulse ${className}`}
        style={{ width, height }}
      />
    )
  }

  return (
    <div className={`relative ${className}`}>
      <img
        src={dataUrl}
        alt={title || 'Generative cover'}
        width={width}
        height={height}
        className="w-full h-full object-cover"
      />
      {showPatternName && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          {pattern}
        </div>
      )}
    </div>
  )
}

/**
 * Hook to get generative cover data URL
 */
export function useGenerativeCover(contentSeed: string, options?: {
  width?: number
  height?: number
  title?: string
  author?: string
}) {
  const [dataUrl, setDataUrl] = useState<string>('')

  useEffect(() => {
    const url = generateCoverDataUrl(contentSeed, options)
    setDataUrl(url)
  }, [contentSeed, options])

  return dataUrl
}
