'use client'

/**
 * /console — the operator's chat surface.
 *
 * This route now renders the same Chat experience as /chat. The prior
 * "dashboard" version of Console (greeting + metric tiles + activity
 * stream) is replaced by the chat assistant per operator decision —
 * Console is where you talk to the system, not where you stare at
 * counters.
 *
 * /chat still works as an alias so prior bookmarks keep loading.
 */

export const runtime = 'edge'

import ChatPage from '../chat/page'

export default function ConsoleAsChat() {
  return <ChatPage />
}
