# Neolog FFmpeg Container Worker
#
# Cloudflare Container Worker that runs FFmpeg. Replaces Replicate/fofr/toolkit.
# Same vendor as everything else (Cloudflare), so no extra API key, no extra
# dashboard, no extra billing relationship.
#
# Exposed endpoints (HTTP, called from the main Worker). Five, and that is
# all of them — every one has a caller:
#   POST /transcode-h264   { input_url }     -> mp4 H.264 + AAC, for playback
#   POST /extract-thumb    { input_url, t }  -> jpg (base64 data URI)
#   POST /extract-thumb-mini-transcode       -> the cascade's second tier
#   POST /extract-audio    { input_url }     -> mp3, for Whisper
#   POST /concat-audio     { input_urls[] }  -> one mp3 out of the chunks
#
# Seven more were removed on 9 Sep — /trim, /concat, /extract-audio-segment,
# /extract-video-segment, /render-video-essay, /ken-burns, /images-to-video.
# They were the production engine: cut a clip, stitch a video essay, pan a
# photo into a motion shot. That product went on 8 Sep and nothing has called
# them since, but they were 520 of this file's 1,240 lines and they were
# DEPLOYED — running code for a product that does not exist.
#
# The container reads input from a presigned R2 GET URL (no body upload).
# It returns the output as the HTTP response body (the main Worker streams
# it back into R2). This keeps the container stateless.
#
# Built on Alpine + ffmpeg static (small image, fast cold start).

FROM alpine:3.21

# ffmpeg + ca-certificates (for HTTPS fetches from R2) + curl (for debugging)
RUN apk add --no-cache \
    ffmpeg \
    ca-certificates \
    curl \
    nodejs \
    npm

WORKDIR /app

# Copy the tiny HTTP server (Node, no framework — just listen + spawn ffmpeg)
COPY package.json server.js ./

# No external deps. Node 22's built-in fetch and http modules cover everything.
# No npm install needed; if you add deps later, add an npm ci step here.

EXPOSE 8080

# Keep the container PID 1 so signals propagate
ENV NODE_ENV=production
CMD ["node", "server.js"]
