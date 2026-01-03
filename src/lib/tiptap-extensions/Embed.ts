import { Node, mergeAttributes } from '@tiptap/core'

export interface EmbedOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      setEmbed: (options: { url: string; type?: 'youtube' | 'twitter' | 'codepen' | 'generic' }) => ReturnType
    }
  }
}

export const Embed = Node.create<EmbedOptions>({
  name: 'embed',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      url: {
        default: null,
      },
      type: {
        default: 'generic',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-embed-url]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { url, type } = node.attrs

    // Extract embed ID based on type
    let embedHTML = ''

    if (type === 'youtube') {
      const videoId = extractYouTubeId(url)
      if (videoId) {
        embedHTML = `
          <div class="aspect-video">
            <iframe
              src="https://www.youtube.com/embed/${videoId}"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              class="w-full h-full rounded-lg"
            ></iframe>
          </div>
        `
      }
    } else if (type === 'twitter') {
      embedHTML = `
        <div class="twitter-embed">
          <blockquote class="twitter-tweet">
            <a href="${url}">View Tweet</a>
          </blockquote>
        </div>
      `
    } else if (type === 'codepen') {
      const penId = extractCodePenId(url)
      if (penId) {
        embedHTML = `
          <div class="aspect-video">
            <iframe
              src="https://codepen.io/embed/${penId}?default-tab=result"
              frameborder="0"
              allowfullscreen
              class="w-full h-full rounded-lg"
            ></iframe>
          </div>
        `
      }
    } else {
      embedHTML = `
        <div class="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] hover:underline">
            ${url}
          </a>
        </div>
      `
    }

    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-embed-url': url,
        'data-embed-type': type,
        class: 'embed-wrapper my-6',
      }),
      ['div', { innerHTML: embedHTML }],
    ]
  },

  addCommands() {
    return {
      setEmbed:
        options =>
        ({ commands }) => {
          // Detect embed type from URL
          let type = options.type || 'generic'
          if (!options.type) {
            if (options.url.includes('youtube.com') || options.url.includes('youtu.be')) {
              type = 'youtube'
            } else if (options.url.includes('twitter.com') || options.url.includes('x.com')) {
              type = 'twitter'
            } else if (options.url.includes('codepen.io')) {
              type = 'codepen'
            }
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              url: options.url,
              type,
            },
          })
        },
    }
  },
})

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?]+)/,
    /youtu\.be\/([^?]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

function extractCodePenId(url: string): string | null {
  const match = url.match(/codepen\.io\/([^\/]+)\/pen\/([^\/]+)/)
  if (match) return `${match[1]}/${match[2]}`
  return null
}
