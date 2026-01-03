// Rich embed parser - converts URLs to embeddable iframes

type EmbedConfig = {
  pattern: RegExp
  transform: (match: RegExpMatchArray) => string
}

const embedConfigs: EmbedConfig[] = [
  // YouTube
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    transform: (match) => `
      <div class="embed-container aspect-video my-6 rounded-xl overflow-hidden">
        <iframe 
          src="https://www.youtube.com/embed/${match[1]}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
  // Vimeo
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/,
    transform: (match) => `
      <div class="embed-container aspect-video my-6 rounded-xl overflow-hidden">
        <iframe 
          src="https://player.vimeo.com/video/${match[1]}" 
          frameborder="0" 
          allow="autoplay; fullscreen; picture-in-picture" 
          allowfullscreen
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
  // Twitter/X
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/,
    transform: (match) => `
      <div class="embed-container my-6" data-tweet-id="${match[2]}">
        <blockquote class="twitter-tweet" data-dnt="true">
          <a href="https://twitter.com/${match[1]}/status/${match[2]}">Loading tweet...</a>
        </blockquote>
      </div>
    `,
  },
  // CodePen
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?codepen\.io\/([^\/]+)\/(?:pen|full)\/([a-zA-Z0-9]+)/,
    transform: (match) => `
      <div class="embed-container my-6 rounded-xl overflow-hidden" style="height: 400px;">
        <iframe 
          src="https://codepen.io/${match[1]}/embed/${match[2]}?default-tab=result&theme-id=dark" 
          frameborder="0"
          loading="lazy"
          allowtransparency="true"
          allowfullscreen="true"
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
  // CodeSandbox
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?codesandbox\.io\/(?:s|embed)\/([a-zA-Z0-9-]+)/,
    transform: (match) => `
      <div class="embed-container my-6 rounded-xl overflow-hidden" style="height: 500px;">
        <iframe 
          src="https://codesandbox.io/embed/${match[1]}?fontsize=14&hidenavigation=1&theme=dark" 
          frameborder="0"
          loading="lazy"
          allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
  // Spotify Track
  {
    pattern: /(?:https?:\/\/)?(?:open\.)?spotify\.com\/track\/([a-zA-Z0-9]+)/,
    transform: (match) => `
      <div class="embed-container my-6 rounded-xl overflow-hidden" style="height: 152px;">
        <iframe 
          src="https://open.spotify.com/embed/track/${match[1]}" 
          frameborder="0"
          allow="encrypted-media"
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
  // Spotify Playlist
  {
    pattern: /(?:https?:\/\/)?(?:open\.)?spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    transform: (match) => `
      <div class="embed-container my-6 rounded-xl overflow-hidden" style="height: 380px;">
        <iframe 
          src="https://open.spotify.com/embed/playlist/${match[1]}" 
          frameborder="0"
          allow="encrypted-media"
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
  // GitHub Gist
  {
    pattern: /(?:https?:\/\/)?gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/,
    transform: (match) => `
      <div class="embed-container my-6" data-gist-id="${match[2]}">
        <script src="https://gist.github.com/${match[1]}/${match[2]}.js"></script>
      </div>
    `,
  },
  // Loom
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?loom\.com\/share\/([a-f0-9]+)/,
    transform: (match) => `
      <div class="embed-container aspect-video my-6 rounded-xl overflow-hidden">
        <iframe 
          src="https://www.loom.com/embed/${match[1]}" 
          frameborder="0" 
          allowfullscreen
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
  // Figma
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?figma\.com\/(file|proto)\/([a-zA-Z0-9]+)/,
    transform: (match) => `
      <div class="embed-container my-6 rounded-xl overflow-hidden" style="height: 450px;">
        <iframe 
          src="https://www.figma.com/embed?embed_host=neolog&url=https://www.figma.com/${match[1]}/${match[2]}" 
          frameborder="0"
          allowfullscreen
          class="w-full h-full"
        ></iframe>
      </div>
    `,
  },
]

/**
 * Process content and replace embed URLs with iframe embeds
 */
export function processEmbeds(html: string): string {
  let processed = html

  // Find standalone URLs (not already in links or iframes)
  // Look for URLs that are on their own line or in <p> tags
  for (const config of embedConfigs) {
    // Match URLs that are either standalone or wrapped in <p> tags
    const standalonePattern = new RegExp(
      `<p>\\s*(${config.pattern.source})\\s*<\\/p>`,
      'gi'
    )
    
    processed = processed.replace(standalonePattern, (_, url) => {
      const match = url.match(config.pattern)
      if (match) {
        return config.transform(match)
      }
      return _
    })
  }

  return processed
}

/**
 * Check if URL is embeddable
 */
export function isEmbeddableUrl(url: string): boolean {
  return embedConfigs.some(config => config.pattern.test(url))
}

/**
 * Get embed HTML for a URL
 */
export function getEmbedHtml(url: string): string | null {
  for (const config of embedConfigs) {
    const match = url.match(config.pattern)
    if (match) {
      return config.transform(match)
    }
  }
  return null
}
