'use client'

/**
 * SEO Analyzer Component
 *
 * Real-time SEO analysis and suggestions for content.
 * This is Neolog's core differentiator vs Ghost/Substack.
 */

import { useEffect, useState } from 'react'
import { analyzeSEO, type SEOAnalysis } from '@/lib/seo-scoring'
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  FileText,
  Image as ImageIcon,
  Link2,
  Eye,
  Hash,
} from 'lucide-react'

interface SEOAnalyzerProps {
  title: string
  description: string
  content: string
  className?: string
}

export function SEOAnalyzer({ title, description, content, className = '' }: SEOAnalyzerProps) {
  const [analysis, setAnalysis] = useState<SEOAnalysis | null>(null)

  useEffect(() => {
    // Debounce analysis
    const timer = setTimeout(() => {
      const result = analyzeSEO(title, description, content)
      setAnalysis(result)
    }, 500)

    return () => clearTimeout(timer)
  }, [title, description, content])

  if (!analysis) {
    return (
      <div className={`rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={18} className="text-[var(--accent)]" />
          <h3 className="font-semibold">SEO Analyzer</h3>
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">Analyzing...</p>
      </div>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle2 size={16} className="text-green-600" />
    if (score >= 60) return <AlertTriangle size={16} className="text-yellow-600" />
    return <AlertCircle size={16} className="text-red-600" />
  }

  return (
    <div className={`rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4 ${className}`}>
      {/* Header with overall score */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-[var(--accent)]" />
            <h3 className="font-semibold">SEO Score</h3>
          </div>
          <div className={`text-2xl font-bold ${getScoreColor(analysis.score)}`}>
            {analysis.score}/100
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              analysis.score >= 80
                ? 'bg-green-600'
                : analysis.score >= 60
                ? 'bg-yellow-600'
                : 'bg-red-600'
            }`}
            style={{ width: `${analysis.score}%` }}
          />
        </div>
      </div>

      {/* Word count */}
      <div className="flex items-center gap-2 mb-4 text-sm text-[var(--text-secondary)]">
        <FileText size={14} />
        <span>{analysis.wordCount} words</span>
      </div>

      {/* Detailed metrics */}
      <div className="space-y-3 mb-4">
        {/* Title */}
        <div className="flex items-start gap-2">
          {getScoreIcon(analysis.title.score)}
          <div className="flex-1 text-sm">
            <div className="font-medium">Title: {analysis.title.length} chars</div>
            {analysis.title.suggestion && (
              <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                {analysis.title.suggestion}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="flex items-start gap-2">
          {getScoreIcon(analysis.description.score)}
          <div className="flex-1 text-sm">
            <div className="font-medium">Description: {analysis.description.length} chars</div>
            {analysis.description.suggestion && (
              <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                {analysis.description.suggestion}
              </div>
            )}
          </div>
        </div>

        {/* Readability */}
        <div className="flex items-start gap-2">
          {getScoreIcon(analysis.readability.score)}
          <div className="flex-1 text-sm">
            <div className="font-medium">
              <Eye size={12} className="inline mr-1" />
              Readability: {analysis.readability.grade}
            </div>
            {analysis.readability.suggestion && (
              <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                {analysis.readability.suggestion}
              </div>
            )}
          </div>
        </div>

        {/* Headings */}
        <div className="flex items-start gap-2">
          {getScoreIcon(analysis.headings.score)}
          <div className="flex-1 text-sm">
            <div className="font-medium">
              Headings: H1({analysis.headings.h1Count}) H2({analysis.headings.h2Count}) H3(
              {analysis.headings.h3Count})
            </div>
            {analysis.headings.suggestion && (
              <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                {analysis.headings.suggestion}
              </div>
            )}
          </div>
        </div>

        {/* Images */}
        {analysis.images.total > 0 && (
          <div className="flex items-start gap-2">
            {getScoreIcon(analysis.images.score)}
            <div className="flex-1 text-sm">
              <div className="font-medium">
                <ImageIcon size={12} className="inline mr-1" />
                Images: {analysis.images.withAlt}/{analysis.images.total} with alt text
              </div>
              {analysis.images.suggestion && (
                <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                  {analysis.images.suggestion}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Internal Links */}
        <div className="flex items-start gap-2">
          {getScoreIcon(analysis.internalLinks.score)}
          <div className="flex-1 text-sm">
            <div className="font-medium">
              <Link2 size={12} className="inline mr-1" />
              Internal links: {analysis.internalLinks.count}
            </div>
            {analysis.internalLinks.suggestion && (
              <div className="text-[var(--text-tertiary)] text-xs mt-0.5">
                {analysis.internalLinks.suggestion}
              </div>
            )}
          </div>
        </div>

        {/* Top Keywords */}
        {analysis.keywords.topKeywords.length > 0 && (
          <div className="flex items-start gap-2">
            <Hash size={16} className="text-[var(--text-tertiary)]" />
            <div className="flex-1 text-sm">
              <div className="font-medium">Top keywords:</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {analysis.keywords.topKeywords.slice(0, 5).map(kw => (
                  <span
                    key={kw.word}
                    className="text-xs bg-[var(--bg-tertiary)] px-2 py-0.5 rounded"
                  >
                    {kw.word} ({kw.count})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Traffic prediction */}
      <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
        <div className="text-sm">
          <div className="flex items-center gap-2 font-medium mb-1">
            <TrendingUp size={14} className="text-[var(--accent)]" />
            <span>Traffic Prediction</span>
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {analysis.score >= 80 ? (
              <span className="text-green-600 font-medium">High potential</span>
            ) : analysis.score >= 60 ? (
              <span className="text-yellow-600 font-medium">Good potential</span>
            ) : (
              <span className="text-[var(--text-secondary)]">Needs optimization</span>
            )}
            {' - '}
            Based on SEO score, readability, and content length ({analysis.wordCount} words)
          </div>
        </div>
      </div>

      {/* Top suggestions */}
      {analysis.suggestions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
          <div className="text-sm font-medium mb-2">Quick Wins:</div>
          <ul className="space-y-1">
            {analysis.suggestions.slice(0, 3).map((suggestion, i) => (
              <li key={i} className="text-xs text-[var(--text-secondary)] pl-4 relative">
                <span className="absolute left-0">-</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Compact SEO Badge (for inline display)
 */
export function SEOBadge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-200'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-red-100 text-red-800 border-red-200'
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getColor()}`}
    >
      <TrendingUp size={12} />
      SEO: {score}/100
    </span>
  )
}
