/**
 * Process footnotes in content
 * Supports markdown-style footnotes: [^1] and [^1]: Definition
 */

export function processFootnotes(html: string): string {
  if (!html) return ''

  // Map to store footnote definitions
  const footnotes = new Map<string, string>()
  let footnoteIndex = 0
  const footnoteOrder: string[] = []

  // First pass: collect all footnote definitions
  const definitionPattern = /\[\^([^\]]+)\]:\s*([\s\S]+?)(?=\n\[\^|\n\n|$)/g
  const definitions = new Map<string, string>()
  
  let match
  while ((match = definitionPattern.exec(html)) !== null) {
    definitions.set(match[1], match[2].trim())
  }

  // Remove definitions from content
  let content = html.replace(/\[\^([^\]]+)\]:\s*([\s\S]+?)(?=\n\[\^|\n\n|$)/g, '')

  // Second pass: replace inline references with superscript links
  content = content.replace(/\[\^([^\]]+)\]/g, (_, id) => {
    if (!footnoteOrder.includes(id)) {
      footnoteOrder.push(id)
    }
    const index = footnoteOrder.indexOf(id) + 1
    const definition = definitions.get(id) || ''
    footnotes.set(id, definition)
    
    return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}" data-footnote-ref aria-describedby="footnote-label">[${index}]</a></sup>`
  })

  // If there are footnotes, add the footnotes section
  if (footnotes.size > 0) {
    content += `
      <section class="footnotes mt-12 pt-8 border-t border-[var(--border-light)]" data-footnotes>
        <h2 id="footnote-label" class="sr-only">Footnotes</h2>
        <ol class="list-decimal list-inside space-y-2 text-sm text-[var(--text-secondary)]">
    `
    
    footnoteOrder.forEach((id, index) => {
      const definition = footnotes.get(id) || ''
      content += `
        <li id="fn-${id}" class="footnote-item">
          ${definition}
          <a href="#fnref-${id}" class="footnote-backref ml-2 text-[var(--accent)]" aria-label="Back to reference ${index + 1}">back</a>
        </li>
      `
    })
    
    content += `
        </ol>
      </section>
    `
  }

  return content
}

/**
 * Extract footnotes without rendering
 */
export function extractFootnotes(content: string): Map<string, string> {
  const footnotes = new Map<string, string>()
  const pattern = /\[\^([^\]]+)\]:\s*([\s\S]+?)(?=\n\[\^|\n\n|$)/g
  
  let match
  while ((match = pattern.exec(content)) !== null) {
    footnotes.set(match[1], match[2].trim())
  }
  
  return footnotes
}

/**
 * Count footnotes in content
 */
export function countFootnotes(content: string): number {
  const refs = content.match(/\[\^[^\]]+\](?!:)/g)
  return refs ? new Set(refs).size : 0
}

