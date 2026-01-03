/**
 * Footnotes Parser
 * 
 * Supports markdown-style footnotes:
 * - Inline reference: [^1] or [^note]
 * - Definition: [^1]: This is the footnote content
 * 
 * Also supports inline footnotes:
 * - ^[This is an inline footnote]
 */

type Footnote = {
  id: string
  content: string
  index: number
}

export function parseFootnotes(html: string): { html: string; footnotes: Footnote[] } {
  const footnotes: Footnote[] = []
  let footnoteIndex = 0

  // First pass: collect all footnote definitions
  const definitionPattern = /\[\^([^\]]+)\]:\s*([\s\S]+?)(?=\n\[\^|\n\n|$)/g
  const definitions = new Map<string, string>()
  
  let match
  while ((match = definitionPattern.exec(html)) !== null) {
    definitions.set(match[1], match[2].trim())
  }

  // Remove footnote definitions from content
  let processedHtml = html.replace(definitionPattern, '')

  // Second pass: replace inline references with superscript links
  const referencePattern = /\[\^([^\]]+)\]/g
  processedHtml = processedHtml.replace(referencePattern, (_, id) => {
    footnoteIndex++
    const content = definitions.get(id) || `[Missing footnote: ${id}]`
    
    footnotes.push({
      id,
      content,
      index: footnoteIndex,
    })

    return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}">[${footnoteIndex}]</a></sup>`
  })

  // Third pass: handle inline footnotes ^[content]
  const inlinePattern = /\^\[([^\]]+)\]/g
  processedHtml = processedHtml.replace(inlinePattern, (_, content) => {
    footnoteIndex++
    const id = `inline-${footnoteIndex}`
    
    footnotes.push({
      id,
      content,
      index: footnoteIndex,
    })

    return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}">[${footnoteIndex}]</a></sup>`
  })

  return { html: processedHtml, footnotes }
}

export function renderFootnotes(footnotes: Footnote[]): string {
  if (footnotes.length === 0) return ''

  const items = footnotes.map(fn => `
    <li id="fn-${fn.id}" class="footnote-item">
      <p>
        ${fn.content}
        <a href="#fnref-${fn.id}" class="footnote-backref" title="Back to reference">↩</a>
      </p>
    </li>
  `).join('')

  return `
    <section class="footnotes">
      <hr class="footnotes-sep" />
      <ol class="footnotes-list">
        ${items}
      </ol>
    </section>
  `
}

/**
 * Process content with footnotes and return complete HTML
 */
export function processFootnotes(html: string): string {
  const { html: processedHtml, footnotes } = parseFootnotes(html)
  return processedHtml + renderFootnotes(footnotes)
}

/**
 * CSS for footnotes (add to globals.css)
 */
export const footnoteStyles = `
  .footnote-ref {
    font-size: 0.75em;
    vertical-align: super;
    line-height: 0;
  }
  
  .footnote-ref a {
    color: var(--accent);
    text-decoration: none;
  }
  
  .footnote-ref a:hover {
    text-decoration: underline;
  }
  
  .footnotes {
    margin-top: 3rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .footnotes-sep {
    border: none;
    border-top: 1px solid var(--border-light);
    margin-bottom: 1.5rem;
  }
  
  .footnotes-list {
    padding-left: 1.5rem;
    margin: 0;
  }
  
  .footnote-item {
    margin-bottom: 0.5rem;
  }
  
  .footnote-item p {
    margin: 0;
  }
  
  .footnote-backref {
    margin-left: 0.25rem;
    color: var(--accent);
    text-decoration: none;
  }
  
  .footnote-backref:hover {
    text-decoration: underline;
  }
`
