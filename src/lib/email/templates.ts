// Email templates for Neolog

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

const baseStyles = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  color: #1a1816;
  line-height: 1.6;
`

const buttonStyle = `
  display: inline-block;
  background-color: #c45d3a;
  color: white !important;
  padding: 12px 24px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
`

const linkStyle = `
  color: #c45d3a;
  text-decoration: none;
`

const footerStyle = `
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e2de;
  font-size: 12px;
  color: #6b6965;
`

function wrapInLayout(content: string, preheader?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${preheader ? `<span style="display:none;font-size:1px;color:#fff;max-height:0;overflow:hidden;">${preheader}</span>` : ''}
    </head>
    <body style="margin: 0; padding: 0; background-color: #faf8f5;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf8f5; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 40px; ${baseStyles}">
                  ${content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}

export function welcomeEmail(username: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to Neolog',
    html: wrapInLayout(`
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="width: 48px; height: 48px; background-color: #c45d3a; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px;">N</div>
      </div>
      
      <h1 style="font-size: 24px; margin: 0 0 16px; text-align: center;">Welcome to Neolog, ${username}!</h1>
      
      <p style="color: #6b6965; margin: 0 0 24px; text-align: center;">
        You're now part of a community of writers who care about ideas that spread.
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${BASE_URL}/write" style="${buttonStyle}">Write Your First Post</a>
      </div>
      
      <h2 style="font-size: 16px; margin: 32px 0 12px;">Quick start:</h2>
      <ul style="color: #6b6965; padding-left: 20px; margin: 0;">
        <li style="margin-bottom: 8px;">Write in HTML, Markdown, or use our rich editor</li>
        <li style="margin-bottom: 8px;">Subscribe to writers you admire</li>
        <li style="margin-bottom: 8px;">Fork posts to build on others' ideas</li>
        <li style="margin-bottom: 8px;">Create series to group related content</li>
      </ul>
      
      <div style="${footerStyle}">
        <p style="margin: 0;">You received this because you signed up for Neolog.</p>
        <p style="margin: 8px 0 0;"><a href="${BASE_URL}/settings" style="${linkStyle}">Manage email preferences</a></p>
      </div>
    `, 'Welcome! Get started with your first post.')
  }
}

export function newPostEmail(
  subscriberName: string,
  authorName: string,
  postTitle: string,
  postExcerpt: string,
  postUrl: string
): { subject: string; html: string } {
  return {
    subject: `New from ${authorName}: ${postTitle}`,
    html: wrapInLayout(`
      <p style="color: #6b6965; margin: 0 0 24px;">
        Hi${subscriberName ? ` ${subscriberName}` : ''},
      </p>
      
      <p style="margin: 0 0 24px;">
        <strong>${authorName}</strong> just published a new post:
      </p>
      
      <div style="background-color: #faf8f5; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h2 style="font-size: 20px; margin: 0 0 12px;">
          <a href="${postUrl}" style="${linkStyle}">${postTitle}</a>
        </h2>
        ${postExcerpt ? `<p style="color: #6b6965; margin: 0;">${postExcerpt}</p>` : ''}
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${postUrl}" style="${buttonStyle}">Read Post</a>
      </div>
      
      <div style="${footerStyle}">
        <p style="margin: 0;">You're subscribed to ${authorName} on Neolog.</p>
        <p style="margin: 8px 0 0;"><a href="${BASE_URL}/settings" style="${linkStyle}">Manage subscriptions</a></p>
      </div>
    `, postExcerpt || `${authorName} published "${postTitle}"`)
  }
}

export function commentNotificationEmail(
  recipientName: string,
  commenterName: string,
  postTitle: string,
  commentPreview: string,
  postUrl: string,
  isReply: boolean
): { subject: string; html: string } {
  const action = isReply ? 'replied to your comment' : 'commented on your post'
  
  return {
    subject: `${commenterName} ${action}`,
    html: wrapInLayout(`
      <p style="color: #6b6965; margin: 0 0 24px;">
        Hi${recipientName ? ` ${recipientName}` : ''},
      </p>
      
      <p style="margin: 0 0 24px;">
        <strong>${commenterName}</strong> ${action} "${postTitle}":
      </p>
      
      <div style="background-color: #faf8f5; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 3px solid #c45d3a;">
        <p style="margin: 0; color: #1a1816;">"${commentPreview}"</p>
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${postUrl}#comments" style="${buttonStyle}">View Comment</a>
      </div>
      
      <div style="${footerStyle}">
        <p style="margin: 0;">You received this because of activity on your Neolog content.</p>
        <p style="margin: 8px 0 0;"><a href="${BASE_URL}/settings" style="${linkStyle}">Manage notifications</a></p>
      </div>
    `, `${commenterName}: "${commentPreview.substring(0, 50)}..."`)
  }
}

export function newSubscriberEmail(
  authorName: string,
  subscriberName: string,
  subscriberUsername: string
): { subject: string; html: string } {
  return {
    subject: `${subscriberName} just subscribed to you`,
    html: wrapInLayout(`
      <div style="text-align: center;">
        <div style="width: 64px; height: 64px; background-color: #c45d3a; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px; margin-bottom: 24px;">
          ${subscriberName[0].toUpperCase()}
        </div>
        
        <h1 style="font-size: 24px; margin: 0 0 8px;">New subscriber!</h1>
        
        <p style="color: #6b6965; margin: 0 0 24px;">
          <strong>${subscriberName}</strong> (@${subscriberUsername}) just subscribed to your posts.
        </p>
        
        <a href="${BASE_URL}/${subscriberUsername}" style="${buttonStyle}">View Profile</a>
      </div>
      
      <div style="${footerStyle}">
        <p style="margin: 0; text-align: center;">Keep writing great content!</p>
      </div>
    `, `${subscriberName} is now following your work`)
  }
}

export function tipReceivedEmail(
  authorName: string,
  tipperName: string,
  amount: string,
  message?: string
): { subject: string; html: string } {
  return {
    subject: `You received a ${amount} tip!`,
    html: wrapInLayout(`
      <div style="text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
        
        <h1 style="font-size: 24px; margin: 0 0 8px;">You received a tip!</h1>
        
        <p style="font-size: 32px; font-weight: bold; color: #c45d3a; margin: 16px 0;">
          ${amount}
        </p>
        
        <p style="color: #6b6965; margin: 0 0 24px;">
          from <strong>${tipperName}</strong>
        </p>
        
        ${message ? `
          <div style="background-color: #faf8f5; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: left;">
            <p style="margin: 0; font-style: italic;">"${message}"</p>
          </div>
        ` : ''}
        
        <a href="${BASE_URL}/earnings" style="${buttonStyle}">View Earnings</a>
      </div>
      
      <div style="${footerStyle}">
        <p style="margin: 0; text-align: center;">Your supporters appreciate your work!</p>
      </div>
    `, `${tipperName} sent you ${amount}`)
  }
}
