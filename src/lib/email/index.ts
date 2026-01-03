import { Resend } from 'resend'

let resendClient: Resend | null = null

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }

  return resendClient
}

// Base URL for links
const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

// Email types
export type EmailType = 
  | 'confirmation'
  | 'new_post'
  | 'weekly_digest'
  | 'welcome'

// Common email wrapper
const emailWrapper = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .logo {
      font-size: 24px;
      font-weight: 700;
      color: #1a1a1a;
      text-decoration: none;
      margin-bottom: 24px;
      display: block;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px 0;
      color: #1a1a1a;
    }
    p {
      margin: 0 0 16px 0;
      color: #4a4a4a;
    }
    .button {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 500;
      margin: 8px 0 24px 0;
    }
    .button:hover {
      background: #1d4ed8;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
      font-size: 13px;
      color: #888;
    }
    .footer a {
      color: #888;
    }
    .post-card {
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
    }
    .post-card h2 {
      font-size: 18px;
      margin: 0 0 8px 0;
    }
    .post-card h2 a {
      color: #1a1a1a;
      text-decoration: none;
    }
    .post-card p {
      font-size: 14px;
      margin: 0;
      color: #666;
    }
    .meta {
      font-size: 13px;
      color: #888;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <a href="${getBaseUrl()}" class="logo">neolog</a>
      ${content}
    </div>
  </div>
</body>
</html>
`

// Email templates
export const emailTemplates = {
  // Confirm email subscription
  confirmation: (data: {
    creatorName: string
    creatorUsername: string
    confirmUrl: string
  }) => ({
    subject: `Confirm your subscription to ${data.creatorName}`,
    html: emailWrapper(`
      <h1>Confirm your subscription</h1>
      <p>You're subscribing to <strong>${data.creatorName}</strong> on Neolog.</p>
      <p>Click the button below to confirm your email and start receiving their posts:</p>
      <a href="${data.confirmUrl}" class="button">Confirm Subscription</a>
      <p style="font-size: 13px; color: #888;">
        If you didn't request this, you can safely ignore this email.
      </p>
      <div class="footer">
        <p>
          <a href="${getBaseUrl()}/${data.creatorUsername}">View ${data.creatorName}'s profile</a>
        </p>
      </div>
    `),
  }),

  // New post notification
  new_post: (data: {
    creatorName: string
    creatorUsername: string
    postTitle: string
    postSlug: string
    postExcerpt: string | null
    unsubscribeUrl: string
  }) => ({
    subject: `${data.creatorName}: ${data.postTitle}`,
    html: emailWrapper(`
      <p style="color: #888; font-size: 14px; margin-bottom: 4px;">
        New post from ${data.creatorName}
      </p>
      <h1 style="margin-top: 0;">${data.postTitle}</h1>
      ${data.postExcerpt ? `<p>${data.postExcerpt}</p>` : ''}
      <a href="${getBaseUrl()}/${data.creatorUsername}/${data.postSlug}" class="button">
        Read Post
      </a>
      <div class="footer">
        <p>
          You're receiving this because you subscribed to ${data.creatorName}.
          <br>
          <a href="${data.unsubscribeUrl}">Unsubscribe</a>
        </p>
      </div>
    `),
  }),

  // Weekly digest
  weekly_digest: (data: {
    posts: Array<{
      title: string
      slug: string
      excerpt: string | null
      authorName: string
      authorUsername: string
      readingTime: number | null
    }>
    unsubscribeUrl: string
  }) => ({
    subject: `Your weekly reading from Neolog`,
    html: emailWrapper(`
      <h1>This Week on Neolog</h1>
      <p>Here's what the writers you follow have been publishing:</p>
      ${data.posts.map(post => `
        <div class="post-card">
          <h2><a href="${getBaseUrl()}/${post.authorUsername}/${post.slug}">${post.title}</a></h2>
          ${post.excerpt ? `<p>${post.excerpt}</p>` : ''}
          <p class="meta">
            By ${post.authorName}
            ${post.readingTime ? ` · ${post.readingTime} min read` : ''}
          </p>
        </div>
      `).join('')}
      <a href="${getBaseUrl()}/feed" class="button">View Your Feed</a>
      <div class="footer">
        <p>
          <a href="${data.unsubscribeUrl}">Unsubscribe from digest</a>
        </p>
      </div>
    `),
  }),

  // Welcome email
  welcome: (data: {
    userName: string
  }) => ({
    subject: `Welcome to Neolog`,
    html: emailWrapper(`
      <h1>Welcome to Neolog, ${data.userName}!</h1>
      <p>You've joined a platform built for writers who care about their craft and their audience.</p>
      <p><strong>Here's what makes Neolog different:</strong></p>
      <ul style="color: #4a4a4a; padding-left: 20px;">
        <li>Your content stays yours — export anytime</li>
        <li>HTML-native publishing for true creative control</li>
        <li>Fork and remix ideas (with attribution)</li>
        <li>Real analytics that help you improve</li>
        <li>Grow through curators and the Boost network</li>
      </ul>
      <a href="${getBaseUrl()}/write" class="button">Write Your First Post</a>
      <div class="footer">
        <p>
          Questions? Just reply to this email.
        </p>
      </div>
    `),
  }),
}

// Send email function
export async function sendEmail(
  to: string,
  template: EmailType,
  data: Record<string, any>
) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping email send')
    return { success: false, error: 'Email not configured' }
  }

  const resend = getResendClient()
  if (!resend) {
    console.warn('RESEND_API_KEY not set, skipping email send')
    return { success: false, error: 'Email not configured' }
  }

  const templateFn = emailTemplates[template]
  if (!templateFn) {
    return { success: false, error: `Unknown template: ${template}` }
  }

  const { subject, html } = templateFn(data as any)
  const fromAddress = process.env.EMAIL_FROM || 'Neolog <noreply@neolog.ai>'

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    })

    return { success: true, id: result.data?.id }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error: String(error) }
  }
}

// Batch send for new post notifications
export async function sendNewPostNotifications(
  subscribers: Array<{ email: string; unsubscribeToken: string }>,
  postData: {
    creatorName: string
    creatorUsername: string
    postTitle: string
    postSlug: string
    postExcerpt: string | null
  }
) {
  const results = await Promise.allSettled(
    subscribers.map(sub =>
      sendEmail(sub.email, 'new_post', {
        ...postData,
        unsubscribeUrl: `${getBaseUrl()}/unsubscribe?token=${sub.unsubscribeToken}`,
      })
    )
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return { sent: succeeded, failed }
}
