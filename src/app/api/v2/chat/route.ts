/**
 * /api/v2/chat — the chatbot surface.
 *
 *   POST   /api/v2/chat               Send a message in a thread (creates one
 *                                     if `thread_id` is omitted). Runs the
 *                                     tool loop server-side and returns the
 *                                     full assistant turn (final text + any
 *                                     tool calls + their results).
 *   GET    /api/v2/chat?thread_id=…   Load thread + message history.
 *   GET    /api/v2/chat               List operator's threads.
 *   DELETE /api/v2/chat?thread_id=…   Soft-delete a thread.
 *
 * Model selection: body.model = 'kimi' (default, Workers AI Kimi K2.6) |
 * 'claude' (Anthropic Sonnet 4.6, requires ANTHROPIC_API_KEY).
 *
 * Tool calls are looped server-side up to TOOL_LIMIT iterations. The full
 * assistant turn — including intermediate tool_use + tool_result messages —
 * is persisted to chat_messages so the next request can replay it.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import {
  callChat,
  type ChatMessage,
  type ChatModelKey,
  type ChatToolCall,
  type ChatContentPart,
} from '@/lib/llm'
import { availableTools, runTool, TOOL_LIMIT } from '@/lib/chat-tools'
import { getSetting, SETTING_KEYS } from '@/lib/operator-settings'
import type { Ai, D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: Ai
  ANTHROPIC_API_KEY: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const SYSTEM_PROMPT = `You are Neolog's in-app assistant. You help the operator (who you are talking to) explore their own vlog archive, develop ideas into productions, draft posts and articles, and ingest reference material.

Style:
- Direct, conversational, no marketing voice.
- Be specific. If you can pull data with tools, do it; don't speculate when you can look.
- Quote the operator's own words when relevant — they have a distinct voice; preserve it verbatim, including profanity and fragmentary phrasing.
- When the operator asks "what have I been saying about X", use search_vlogs and list_recent_threads to actually find out.
- When asked to draft something, write it out fully. Don't ask "should I draft this?" — just draft it. If they want changes, they'll say so.

You have tools (search_vlogs, get_vlog, list_recent_threads, get_thread, list_clusters, get_cluster, save_note, draft_x_post). Use them eagerly. The operator pays for tokens, not for tool calls — every tool call is essentially free, so prefer doing the lookup over guessing.

Never invent vlog ids, thread ids, or cluster ids. Always get them from a tool first.`

// ─── POST: send a message ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const body = await req.json().catch(() => null) as
    | {
        thread_id?: string
        model?: ChatModelKey
        message: string
        images?: string[]  // presigned R2 URLs or data URIs
      }
    | null

  if (!body?.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const db = getDb(env)

  // Resolve model: explicit request value > operator default > 'llama70b'.
  // Llama 3.3 70B is the new default — dense text model, better writing
  // quality than Scout, cheaper than Kimi K2.6, no Anthropic billing.
  let model: ChatModelKey
  if (body.model === 'scout' || body.model === 'kimi' || body.model === 'llama70b' || body.model === 'claude') {
    model = body.model
  } else {
    const pref = await getSetting(db, operator.id, SETTING_KEYS.CHAT_DEFAULT_MODEL)
    model = (pref === 'kimi' || pref === 'claude' || pref === 'scout' || pref === 'llama70b') ? pref : 'llama70b'
  }

  // ── Resolve / create thread ───────────────────────────────────────────────
  let threadId = body.thread_id
  if (threadId) {
    const exists = await findOne<{ id: string }>(
      db,
      'SELECT id FROM chat_threads WHERE id = ? AND operator_id = ? AND deleted_at IS NULL',
      threadId, operator.id,
    )
    if (!exists) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }
  } else {
    threadId = ulid()
    const title = body.message.slice(0, 80).replace(/\s+/g, ' ').trim()
    await run(
      db,
      'INSERT INTO chat_threads (id, operator_id, title, model) VALUES (?, ?, ?, ?)',
      threadId, operator.id, title, model,
    )
  }

  // ── Persist the user message ──────────────────────────────────────────────
  const userMsgId = ulid()
  const userContent: ChatContentPart[] | string =
    body.images && body.images.length > 0
      ? [
          { type: 'text', text: body.message } as ChatContentPart,
          ...body.images.map(url => ({ type: 'image_url', image_url: { url } } as ChatContentPart)),
        ]
      : body.message
  await run(
    db,
    `INSERT INTO chat_messages (id, thread_id, operator_id, role, content, content_json)
     VALUES (?, ?, ?, 'user', ?, ?)`,
    userMsgId, threadId, operator.id,
    typeof userContent === 'string' ? userContent : null,
    typeof userContent === 'string' ? null : JSON.stringify(userContent),
  )

  // ── Load full history for context ─────────────────────────────────────────
  const history = await loadHistory(db, threadId, operator.id)

  // ── Tool loop ─────────────────────────────────────────────────────────────
  let messages: ChatMessage[] = history
  let assistantText = ''
  let totalInput = 0
  let totalOutput = 0
  const toolCalls: { name: string; arguments: any; result: any }[] = []

  for (let i = 0; i < TOOL_LIMIT; i++) {
    let resp
    try {
      resp = await callChat(env, {
        model,
        system: SYSTEM_PROMPT,
        messages,
        tools: availableTools(),
        maxTokens: 4096,
      })
    } catch (err: any) {
      // Persist the error as an assistant turn so the operator sees something.
      const errMsg = `LLM call failed: ${err?.message || String(err)}`
      const aid = ulid()
      await run(
        db,
        `INSERT INTO chat_messages (id, thread_id, operator_id, role, content, model)
         VALUES (?, ?, ?, 'assistant', ?, ?)`,
        aid, threadId, operator.id, errMsg, model,
      )
      return NextResponse.json({ error: errMsg, thread_id: threadId }, { status: 502 })
    }
    totalInput += resp.inputTokens
    totalOutput += resp.outputTokens

    if (!resp.tool_calls.length) {
      assistantText = resp.text
      break
    }

    // Append assistant turn with the tool calls
    messages.push({
      role: 'assistant',
      content: resp.text || '',
      tool_calls: resp.tool_calls,
    })

    // Execute each tool, append result
    for (const call of resp.tool_calls) {
      const result = await runTool({ db, operatorId: operator.id }, call.name, call.arguments)
      let parsedResult: any = result
      try { parsedResult = JSON.parse(result) } catch {}
      toolCalls.push({ name: call.name, arguments: call.arguments, result: parsedResult })
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: call.id,
        name: call.name,
      })
    }
  }

  if (!assistantText) {
    assistantText = '(Reached tool-call limit — try rephrasing.)'
  }

  // ── Persist the assistant turn (including any tool calls/results) ────────
  await persistAssistantTurn(db, threadId, operator.id, model, messages, assistantText, totalInput, totalOutput)

  // ── Update thread timestamp ──────────────────────────────────────────────
  await run(
    db,
    'UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP, model = ? WHERE id = ?',
    model, threadId,
  )

  return NextResponse.json({
    thread_id: threadId,
    assistant: assistantText,
    tool_calls: toolCalls,
    tokens: { input: totalInput, output: totalOutput },
    model,
  })
}

// ─── GET: list threads or load one ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const db = getDb(env)
  const { searchParams } = new URL(req.url)
  const threadId = searchParams.get('thread_id')

  if (threadId) {
    const thread = await findOne<{
      id: string
      title: string | null
      model: string
      created_at: string
      updated_at: string
    }>(
      db,
      `SELECT id, title, model, created_at, updated_at FROM chat_threads
        WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      threadId, operator.id,
    )
    if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const messages = await findMany<{
      id: string
      role: string
      content: string | null
      content_json: string | null
      tool_calls: string | null
      tool_call_id: string | null
      tool_name: string | null
      model: string | null
      created_at: string
    }>(
      db,
      `SELECT id, role, content, content_json, tool_calls, tool_call_id, tool_name, model, created_at
         FROM chat_messages WHERE thread_id = ? AND operator_id = ?
         ORDER BY created_at ASC`,
      threadId, operator.id,
    )
    return NextResponse.json({ thread, messages })
  }

  const threads = await findMany<{
    id: string
    title: string | null
    model: string
    created_at: string
    updated_at: string
  }>(
    db,
    `SELECT id, title, model, created_at, updated_at FROM chat_threads
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 100`,
    operator.id,
  )
  return NextResponse.json({ threads })
}

// ─── DELETE: soft-delete a thread ───────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }
  const { searchParams } = new URL(req.url)
  const threadId = searchParams.get('thread_id')
  if (!threadId) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
  const db = getDb(env)
  await run(
    db,
    'UPDATE chat_threads SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND operator_id = ?',
    threadId, operator.id,
  )
  return NextResponse.json({ ok: true })
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function loadHistory(
  db: D1Database,
  threadId: string,
  operatorId: string,
): Promise<ChatMessage[]> {
  const rows = await findMany<{
    role: string
    content: string | null
    content_json: string | null
    tool_calls: string | null
    tool_call_id: string | null
    tool_name: string | null
  }>(
    db,
    `SELECT role, content, content_json, tool_calls, tool_call_id, tool_name
       FROM chat_messages WHERE thread_id = ? AND operator_id = ?
       ORDER BY created_at ASC`,
    threadId, operatorId,
  )
  const out: ChatMessage[] = []
  for (const r of rows) {
    if (r.role === 'tool') {
      out.push({
        role: 'tool',
        content: r.content ?? '',
        tool_call_id: r.tool_call_id ?? undefined,
        name: r.tool_name ?? undefined,
      })
      continue
    }
    const content: string | ChatContentPart[] = r.content_json
      ? JSON.parse(r.content_json) as ChatContentPart[]
      : (r.content ?? '')
    const tool_calls: ChatToolCall[] | undefined = r.tool_calls
      ? JSON.parse(r.tool_calls) as ChatToolCall[]
      : undefined
    out.push({
      role: r.role as any,
      content,
      ...(tool_calls && tool_calls.length ? { tool_calls } : {}),
    })
  }
  return out
}

async function persistAssistantTurn(
  db: D1Database,
  threadId: string,
  operatorId: string,
  model: ChatModelKey,
  fullMessages: ChatMessage[],
  finalText: string,
  totalInput: number,
  totalOutput: number,
) {
  // We started this turn with all prior history; everything after the
  // initial history length is what this turn added (assistant turns +
  // tool turns interleaved). Persist each new row in order.
  // The simplest correct thing: find the index of the LAST stored row by
  // re-counting from db, then write only the new tail.
  const existing = await findOne<{ c: number }>(
    db,
    'SELECT COUNT(*) AS c FROM chat_messages WHERE thread_id = ? AND operator_id = ?',
    threadId, operatorId,
  )
  // existing includes the user message we wrote earlier in POST. The
  // assistant + tool messages we accumulated in `fullMessages` are all new
  // *after* the existing rows. So slice off the historic prefix.
  const newCount = fullMessages.length - ((existing?.c ?? 0))
  const tail = newCount > 0 ? fullMessages.slice(-newCount) : []
  // Persist each in order. Make sure final assistant message contains the
  // final text we returned to the client.
  for (let i = 0; i < tail.length; i++) {
    const m = tail[i]
    if (m.role === 'tool') {
      await run(
        db,
        `INSERT INTO chat_messages
            (id, thread_id, operator_id, role, content, tool_call_id, tool_name)
          VALUES (?, ?, ?, 'tool', ?, ?, ?)`,
        ulid(), threadId, operatorId,
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        m.tool_call_id ?? null,
        m.name ?? null,
      )
      continue
    }
    if (m.role === 'assistant') {
      const isFinal = i === tail.length - 1 && !m.tool_calls?.length
      await run(
        db,
        `INSERT INTO chat_messages
            (id, thread_id, operator_id, role, content, tool_calls, model, input_tokens, output_tokens)
          VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?)`,
        ulid(), threadId, operatorId,
        isFinal ? finalText : (typeof m.content === 'string' ? m.content : ''),
        m.tool_calls?.length ? JSON.stringify(m.tool_calls) : null,
        model,
        isFinal ? totalInput : null,
        isFinal ? totalOutput : null,
      )
    }
  }
  // If the model didn't emit any new assistant turn (e.g. tool loop hit
  // the limit), write a final synthetic one with the fallback text.
  if (!tail.some(m => m.role === 'assistant' && !m.tool_calls?.length)) {
    await run(
      db,
      `INSERT INTO chat_messages
          (id, thread_id, operator_id, role, content, model, input_tokens, output_tokens)
        VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`,
      ulid(), threadId, operatorId, finalText, model, totalInput, totalOutput,
    )
  }
}
