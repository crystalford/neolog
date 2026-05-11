/**
 * Cloudflare Container Worker — Neolog FFmpeg service.
 *
 * Cloudflare Containers run inside a Durable Object that fronts the container
 * lifecycle. This Worker:
 *   1. Defines the FfmpegContainer Durable Object class
 *   2. Exposes a fetch() handler that proxies requests into the container
 *
 * The actual ffmpeg work lives in ./server.js inside the container.
 * The container listens on port 8080; this Worker forwards POST bodies
 * (transcode-h264 / extract-thumb / extract-audio / trim / concat) to it
 * and streams responses back to the calling Worker (the main app Worker).
 *
 * Called from the main app via Service Binding: env.FFMPEG.fetch(...)
 */

// Cloudflare Workers Containers types
// @ts-expect-error — Container is a runtime global on the Containers preview SDK
import { Container } from 'cloudflare:containers'

export class FfmpegContainer extends Container {
  // Default port the container listens on
  defaultPort = 8080

  // How long the container can sit idle before Cloudflare shuts it down.
  // ffmpeg jobs are short and bursty, so a moderate timeout balances cold
  // starts against compute cost.
  sleepAfter = '5m'

  // Optional: env vars passed into the container at start
  envVars = {
    NODE_ENV: 'production',
  }

  // Optional lifecycle hooks
  override onStart() {
    console.log('[ffmpeg-container] started')
  }

  override onError(err: unknown) {
    console.error('[ffmpeg-container] error', err)
  }
}

interface Env {
  FFMPEG_CONTAINER: DurableObjectNamespace<FfmpegContainer>
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // All container requests route through a single Durable Object instance.
    // Cloudflare's Container system will autoscale by spinning up multiple
    // backing containers under this DO as needed.
    const id = env.FFMPEG_CONTAINER.idFromName('singleton')
    const stub = env.FFMPEG_CONTAINER.get(id)
    return stub.fetch(request)
  },
}
