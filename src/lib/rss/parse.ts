export type RssItem = {
  title: string
  link: string
  published_at?: string | null
  content?: string | null
}

const stripCdata = (value: string) => value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const getTag = (block: string, tag: string) => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = block.match(regex)
  if (!match) return ''
  return decodeEntities(stripCdata(match[1]))
}

export const parseRss = (xml: string): RssItem[] => {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || []
  const entries = itemBlocks.map((block) => {
    const title = getTag(block, 'title')
    const link = getTag(block, 'link')
    const pubDate = getTag(block, 'pubDate')
    const content = getTag(block, 'content:encoded') || getTag(block, 'description')
    return { title, link, published_at: pubDate || null, content }
  })

  if (entries.length > 0) return entries

  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || []
  return entryBlocks.map((block) => {
    const title = getTag(block, 'title')
    const link =
      block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || getTag(block, 'link')
    const pubDate = getTag(block, 'published') || getTag(block, 'updated')
    const content = getTag(block, 'content') || getTag(block, 'summary')
    return { title, link, published_at: pubDate || null, content }
  })
}
