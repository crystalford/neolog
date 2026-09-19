// OpenNext Cloudflare adapter config.
//
// No incremental-cache override: this app has no ISR/static generation to
// speak of — every route reads D1 live. Revisit only if that changes.

import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig()
