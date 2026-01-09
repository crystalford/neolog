/**
 * ePub Export Library
 *
 * Generates properly formatted ePub 3.0 books from Neolog publications.
 *
 * Features:
 * - Export entire publication history as a book
 * - Automatic table of contents
 * - Chapter organization from series/tags
 * - Embedded metadata (author, cover, ISBN)
 * - Preserve images, formatting, code blocks
 */

import JSZip from 'jszip'
import { marked } from 'marked'

export interface EpubPost {
  id: string
  title: string
  slug: string
  content: string
  html_content?: string
  published_at: string
  reading_time_minutes?: number
  series?: {
    title: string
    slug: string
  } | null
}

export interface EpubAuthor {
  display_name: string
  username: string
  bio?: string
  website?: string
  avatar_url?: string
}

export interface EpubMetadata {
  title: string
  author: EpubAuthor
  language?: string
  publisher?: string
  description?: string
  coverImageUrl?: string
  identifier?: string // UUID or ISBN
  pubDate?: string
}

export interface EpubOptions {
  includeImages?: boolean
  groupBySeries?: boolean
  includeTOC?: boolean
}

/**
 * Generate ePub 3.0 book from posts
 */
export async function generateEpub(
  posts: EpubPost[],
  metadata: EpubMetadata,
  options: EpubOptions = {}
): Promise<Blob> {
  const {
    includeImages = true,
    groupBySeries = true,
    includeTOC = true,
  } = options

  const zip = new JSZip()

  // Required ePub structure
  zip.file('mimetype', 'application/epub+zip')

  // META-INF folder
  const metaInf = zip.folder('META-INF')!
  metaInf.file('container.xml', getContainerXml())

  // OEBPS folder (content)
  const oebps = zip.folder('OEBPS')!

  // Content files
  const chapters: Array<{ id: string; title: string; filename: string; content: string }> = []

  // Group posts by series if enabled
  const organizedPosts = groupBySeries ? groupPostsBySeries(posts) : { 'All Posts': posts }

  let chapterIndex = 1
  for (const [groupTitle, groupPosts] of Object.entries(organizedPosts)) {
    for (const post of groupPosts) {
      const filename = `chapter-${chapterIndex}.xhtml`

      // Use html_content if available, otherwise convert markdown
      // marked() returns a Promise in newer versions, so we need to await it
      const html = post.html_content || (await marked(post.content || ''))

      // Simple HTML cleanup for ePub compatibility (already sanitized in DB)
      const cleanedHtml = sanitizeForEpub(html)

      const chapterContent = getChapterXhtml(post.title, cleanedHtml)

      chapters.push({
        id: `chapter-${chapterIndex}`,
        title: post.title,
        filename,
        content: chapterContent,
      })

      oebps.file(filename, chapterContent)
      chapterIndex++
    }
  }

  // CSS
  oebps.file('styles.css', getEpubCss())

  // Navigation document (EPUB 3)
  if (includeTOC) {
    oebps.file('nav.xhtml', getNavXhtml(chapters, metadata))
  }

  // NCX (for EPUB 2 compatibility)
  oebps.file('toc.ncx', getTocNcx(chapters, metadata))

  // Package document (OPF)
  oebps.file('content.opf', getContentOpf(chapters, metadata, includeTOC))

  // Cover page
  oebps.file('cover.xhtml', getCoverXhtml(metadata))

  // Generate ZIP as blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })

  return blob
}

/**
 * Group posts by series
 */
function groupPostsBySeries(posts: EpubPost[]): Record<string, EpubPost[]> {
  const grouped: Record<string, EpubPost[]> = {}

  for (const post of posts) {
    const key = post.series?.title || 'Uncategorized'
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(post)
  }

  return grouped
}

/**
 * Generate container.xml
 */
function getContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
}

/**
 * Generate content.opf (package document)
 */
function getContentOpf(
  chapters: Array<{ id: string; title: string; filename: string }>,
  metadata: EpubMetadata,
  includeTOC: boolean
): string {
  const identifier = metadata.identifier || `neolog-${metadata.author.username}-${Date.now()}`
  const pubDate = metadata.pubDate || new Date().toISOString().split('T')[0]

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${identifier}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author.display_name)}</dc:creator>
    <dc:language>${metadata.language || 'en'}</dc:language>
    <dc:date>${pubDate}</dc:date>
    <dc:publisher>${metadata.publisher || 'Neolog'}</dc:publisher>
    ${metadata.description ? `<dc:description>${escapeXml(metadata.description)}</dc:description>` : ''}
    <meta property="dcterms:modified">${new Date().toISOString()}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${chapters.map(ch => `<item id="${ch.id}" href="${ch.filename}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover"/>
    ${chapters.map(ch => `<itemref idref="${ch.id}"/>`).join('\n    ')}
  </spine>
</package>`
}

/**
 * Generate nav.xhtml (EPUB 3 navigation)
 */
function getNavXhtml(
  chapters: Array<{ id: string; title: string; filename: string }>,
  metadata: EpubMetadata
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${chapters.map(ch => `<li><a href="${ch.filename}">${escapeXml(ch.title)}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`
}

/**
 * Generate toc.ncx (EPUB 2 compatibility)
 */
function getTocNcx(
  chapters: Array<{ id: string; title: string; filename: string }>,
  metadata: EpubMetadata
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${metadata.identifier || 'neolog'}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)}</text>
  </docTitle>
  <navMap>
    ${chapters.map((ch, i) => `
    <navPoint id="${ch.id}" playOrder="${i + 1}">
      <navLabel>
        <text>${escapeXml(ch.title)}</text>
      </navLabel>
      <content src="${ch.filename}"/>
    </navPoint>`).join('')}
  </navMap>
</ncx>`
}

/**
 * Generate chapter XHTML
 */
function getChapterXhtml(title: string, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  ${content}
</body>
</html>`
}

/**
 * Generate cover page
 */
function getCoverXhtml(metadata: EpubMetadata): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Cover</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body class="cover">
  <div class="cover-content">
    <h1 class="cover-title">${escapeXml(metadata.title)}</h1>
    <p class="cover-author">by ${escapeXml(metadata.author.display_name)}</p>
    ${metadata.description ? `<p class="cover-description">${escapeXml(metadata.description)}</p>` : ''}
    <p class="cover-publisher">Published with Neolog</p>
  </div>
</body>
</html>`
}

/**
 * Generate ePub CSS
 */
function getEpubCss(): string {
  return `
/* Neolog ePub Styles */

body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.1em;
  line-height: 1.6;
  margin: 1em;
  color: #333;
}

h1, h2, h3, h4, h5, h6 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: bold;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

h1 { font-size: 2em; }
h2 { font-size: 1.6em; }
h3 { font-size: 1.3em; }

p {
  margin: 1em 0;
  text-align: justify;
}

a {
  color: #0066cc;
  text-decoration: none;
}

code {
  font-family: "Courier New", monospace;
  background: #f5f5f5;
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

pre {
  background: #f5f5f5;
  padding: 1em;
  overflow-x: auto;
  border-radius: 5px;
  margin: 1em 0;
}

pre code {
  background: none;
  padding: 0;
}

blockquote {
  margin: 1em 2em;
  padding-left: 1em;
  border-left: 3px solid #ccc;
  font-style: italic;
  color: #666;
}

ul, ol {
  margin: 1em 0;
  padding-left: 2em;
}

li {
  margin: 0.5em 0;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
}

/* Cover page styles */
body.cover {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
  margin: 0;
}

.cover-content {
  padding: 2em;
}

.cover-title {
  font-size: 3em;
  margin-bottom: 0.5em;
  font-weight: bold;
}

.cover-author {
  font-size: 1.5em;
  color: #666;
  margin-bottom: 2em;
}

.cover-description {
  font-size: 1.1em;
  color: #888;
  max-width: 500px;
  margin: 2em auto;
}

.cover-publisher {
  font-size: 0.9em;
  color: #aaa;
  margin-top: 3em;
}

/* Table styles */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5em;
  text-align: left;
}

th {
  background: #f5f5f5;
  font-weight: bold;
}
`
}

/**
 * Simple HTML sanitization for ePub
 * Removes potentially problematic tags while keeping safe formatting
 */
function sanitizeForEpub(html: string): string {
  // Remove script tags
  let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  // Remove style tags (inline styles in CSS file instead)
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  // Remove event handlers (onclick, onerror, etc)
  cleaned = cleaned.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  // Remove iframe (not supported in ePub)
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  return cleaned
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Helper to download blob as file
 */
export function downloadEpub(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
