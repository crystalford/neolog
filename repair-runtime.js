const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'src/app');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Fix the squashed line error: 'use client'export const runtime...
      const squashedPattern = /(['"]use (client|server)['"])export const runtime = 'edge'/g;
      
      if (squashedPattern.test(content)) {
          const fixedContent = content.replace(squashedPattern, "$1\n\nexport const runtime = 'edge'");
          fs.writeFileSync(fullPath, fixedContent);
          console.log(`Applied syntax fix to: ${fullPath}`);
      }
    }
  }
}

console.log('Starting syntax repair process...');
walk(targetDir);
console.log('Repair complete!');
