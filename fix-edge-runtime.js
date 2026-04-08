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
    } else if (
      file === 'page.tsx' || 
      file === 'route.ts' || 
      file === 'page.js' || 
      file === 'route.js'
    ) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Check if runtime is already defined
      if (!content.includes('export const runtime') && !content.includes('runtime = \'edge\'')) {
        let newContent = content;
        
        // Find 'use client' or 'use server' directives
        const directiveMatch = content.match(/^(['"]use (client|server)['"];?\n?)/m);
        
        const runtimeLine = "export const runtime = 'edge'\n";
        
        if (directiveMatch) {
          // Insert after the directive
          const insertionPoint = directiveMatch.index + directiveMatch[0].length;
          newContent = content.slice(0, insertionPoint) + runtimeLine + content.slice(insertionPoint);
          console.log(`Updated (Edge): ${fullPath} (attached after directive)`);
        } else {
          // Prepend to top
          newContent = runtimeLine + content;
          console.log(`Updated (Edge): ${fullPath} (prepended to top)`);
        }
        
        fs.writeFileSync(fullPath, newContent);
      }
    }
  }
}

console.log('Starting Edge-ify process...');
walk(targetDir);
console.log('Done!');
