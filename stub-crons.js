const fs = require('fs');
const files = [
  'src/app/api/cron/activitypub-retry/route.ts',
  'src/app/api/cron/publish-scheduled/route.ts',
  'src/app/api/cron/rss-pull/route.ts',
  'src/app/api/cron/weekly-digest/route.ts'
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
    console.log(`Stubbed Cron: ${file}`);
  } else {
    console.log(`Skipped Cron (not found): ${file}`);
  }
});

console.log('Legacy background tasks have been successfully deprecated.');
