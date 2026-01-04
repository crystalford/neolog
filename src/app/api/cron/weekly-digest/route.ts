import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

// Run weekly: { "crons": [{ "path": "/api/cron/weekly-digest", "schedule": "0 9 * * 0" }] }

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendApiKey = process.env.RESEND_API_KEY
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      )
    }

    if (!resendApiKey) {
      return NextResponse.json(
        { error: 'Missing Resend API key configuration' },
        { status: 500 }
      )
    }

    if (!appUrl) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_APP_URL configuration' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const resend = new Resend(resendApiKey)

    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    // Get all users who have email digest enabled
    const { data: users } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      // .eq('email_weekly_digest', true) // Uncomment when column exists

    if (!users || users.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    let sentCount = 0

    for (const user of users) {
      // Get posts from creators they follow
      const { data: posts } = await supabase.rpc('get_digest_posts', {
        p_user_id: user.id,
        p_since: oneWeekAgo.toISOString(),
      })

      if (!posts || posts.length === 0) continue

      // Get user's email from auth
      const { data: authUser } = await supabase.auth.admin.getUserById(user.id)
      if (!authUser?.user?.email) continue

      // Build email content
      const postList = posts.map((p: any) => `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #eee;">
            <a href="${appUrl}/${p.author_username}/${p.slug}" 
               style="color: #1a1816; text-decoration: none;">
              <strong style="font-size: 16px;">${p.title}</strong>
            </a>
            <br>
            <span style="color: #666; font-size: 14px;">
              by ${p.author_display_name || p.author_username}
            </span>
            ${p.excerpt ? `<p style="color: #444; margin: 8px 0 0; font-size: 14px;">${p.excerpt}</p>` : ''}
          </td>
        </tr>
      `).join('')

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; margin: 0;">Your Weekly Digest</h1>
            <p style="color: #666; margin: 8px 0 0;">New posts from creators you follow</p>
          </div>
          
          <table style="width: 100%; border-collapse: collapse;">
            ${postList}
          </table>
          
          <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee;">
            <a href="${appUrl}/feed" 
               style="display: inline-block; background: #c45d3a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              View Your Feed
            </a>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 32px;">
            <a href="${appUrl}/settings" style="color: #999;">
              Manage email preferences
            </a>
            &nbsp; - &nbsp;
            <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(authUser.user.email)}&type=digest" style="color: #999;">
              Unsubscribe
            </a>
          </p>
        </body>
        </html>
      `

      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'Neolog <digest@neolog.ai>',
          to: authUser.user.email,
          subject: `Your weekly digest: ${posts.length} new posts`,
          html,
        })

        // Record digest send
        await supabase.from('digest_sends').insert({
          user_id: user.id,
          digest_type: 'weekly',
          posts_included: posts.map((p: any) => p.post_id),
        })

        sentCount++
      } catch (emailError) {
        console.error(`Failed to send digest to ${user.id}:`, emailError)
      }
    }

    return NextResponse.json({ sent: sentCount })
  } catch (error) {
    console.error('Digest cron error:', error)
    return NextResponse.json({ error: 'Failed to send digests' }, { status: 500 })
  }
}

