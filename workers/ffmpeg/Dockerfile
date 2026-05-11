# Neolog FFmpeg Container Worker
#
# Cloudflare Container Worker that runs FFmpeg. Replaces Replicate/fofr/toolkit.
# Same vendor as everything else (Cloudflare), so no extra API key, no extra
# dashboard, no extra billing relationship.
#
# Exposed endpoints (HTTP, called from the main Worker):
#   POST /transcode-h264  { input_url }     -> mp4 H.264 + AAC, browser-friendly
#   POST /extract-thumb   { input_url, t }  -> jpg (base64 data URI in response)
#   POST /extract-audio   { input_url }     -> mp3
#   POST /trim            { input_url, start_s, end_s }  -> trimmed mp4
#   POST /concat          { input_urls[] }  -> concatenated mp4
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
