/**
 * Cloudflare Container Worker — Neolog FFmpeg service.
 *
 * Cloudflare Containers run inside a Durable Object that fronts the container
 * lifecycle. This Worker:
 *   1. Defines the FfmpegContainer Durable Object class (extends Container)
 *   2. Exposes a fetch() handler that proxies requests into the container
 *
 * The actual ffmpeg work lives in ../server.js inside the container image.
 * The container listens on port 8080; this Worker forwards requests
 * (transcode-h264 / extract-thumb / extract-audio / trim / concat) to it
 * and streams responses back to the calling Worker (the main app Worker).
 *
 * Called from the main app via Service Binding: env.FFMPEG.fetch(...)
 */

import { Container } from '@cloudflare/containers'

// Use `any` for the base class so TypeScript doesn't complain about override
// modifiers and DurableObjectBranded constraints while Container types are
// still preview. The deployed runtime resolves Container correctly.
const ContainerBase: any = Container

export class FfmpegContainer extends ContainerBase {
  defaultPort = 8080
  sleepAfter = '5m'
  envVars = { NODE_ENV: 'production' }

  onStart() { console.log('[ffmpeg-container] started') }
  onError(err: unknown) { console.error('[ffmpeg-container] error', err) }

  // Override fetch so every incoming request first forces a real liveness
  // check via startAndWaitForPorts(). The default Container.fetch() trusts a
  // cached `this.container.running` flag that goes stale if the underlying
  // container died while the Durable Object survived — producing the dreaded
  // "The container is not running, consider calling start()" error from
  // tcpPort.fetch(). startAndWaitForPorts() is idempotent (no-op when already
  // running) and pings the actual port, so it self-heals stale state.
  async fetch(request: Request) {
    // PASSIVE liveness probe — MUST NOT boot the container.
    //
    // The routine health pill (Masthead, every 60s while a tab is open) used
    // to hit /boot-info, which boots the container. With sleepAfter=5m and a
    // 60s poll, the container never slept → Container Memory billed 24/7
    // (~$0.7/day) just to answer "are you alive?". A health check that wakes
    // a sleeping container is self-defeating. This path reports the current
    // running state WITHOUT calling startAndWaitForPorts(), so monitoring is
    // free and the container is allowed to scale to zero when idle. Real work
    // paths (transcode, extract-*, render) still boot on demand below.
    const url = new URL(request.url)
    if (url.pathname === '/__alive') {
      let running = false
      try {
        const self = this as any
        running = !!(self.ctx?.container?.running ?? self.container?.running)
      } catch { /* default false → "idle" */ }
      return new Response(
        JSON.stringify({ ok: true, running, state: running ? 'running' : 'idle', probe: 'passive' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    try {
      await this.startAndWaitForPorts()
    } catch (err) {
      return new Response(
        `ffmpeg container failed to start: ${err instanceof Error ? err.message : String(err)}`,
        { status: 503 },
      )
    }
    return this.containerFetch(request)
  }
}

interface Env {
  FFMPEG_CONTAINER: DurableObjectNamespace
}

// DurableObjectNamespace shape from the Workers runtime
type DurableObjectNamespace = {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): { fetch(req: Request): Promise<Response> }
}
type DurableObjectId = { toString(): string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.FFMPEG_CONTAINER.idFromName('singleton')
    const stub = env.FFMPEG_CONTAINER.get(id)
    return stub.fetch(request)
  },
}
