const fs = require('fs');
const files = [
  'src/app/api/activitypub/publications/[slug]/route.ts',
  'src/app/api/activitypub/publications/[slug]/inbox/route.ts',
  'src/app/api/activitypub/publications/[slug]/outbox/route.ts',
  'src/app/api/activitypub/publications/[slug]/retry/route.ts',
  'src/app/api/activitypub/retry/route.ts',
  'src/app/api/activitypub/[username]/route.ts',
  'src/app/api/activitypub/[username]/inbox/route.ts',
  'src/app/api/activitypub/[username]/outbox/route.ts',
  'src/app/api/syndication/bluesky/connect/route.ts',
  'src/app/api/syndication/connections/route.ts',
  'src/app/api/syndication/devto/connect/route.ts',
  'src/app/api/syndication/disconnect/route.ts',
  'src/app/api/syndication/hashnode/connect/route.ts',
  'src/app/api/syndication/linkedin/callback/route.ts',
  'src/app/api/syndication/linkedin/connect/route.ts',
  'src/app/api/syndication/publish/route.ts',
  'src/app/api/syndication/reddit/callback/route.ts',
  'src/app/api/syndication/reddit/connect/route.ts',
  'src/app/api/import/rss/route.ts'
];

const stubContent = `export const runtime = 'edge'

const deprecated = () => Response.json({ error: "Deprecated in Cloudflare migration." }, { status: 410 })

export const GET = deprecated
export const POST = deprecated
export const PUT = deprecated
export const DELETE = deprecated
export const PATCH = deprecated
`;

files.forEach(file => {
  if (fs.existsSync(file)) {
    fs.writeFileSync(file, stubContent);
    console.log(`Stubbed: ${file}`);
  } else {
    console.log(`Skipped (not found): ${file}`);
  }
});

console.log('Legacy routes have been successfully deprecated.');
