const fs = require('fs');
const path = require('path');

function testNoInlineEventHandlers() {
  const extensionSrcDir = path.join(__dirname, 'chrome-extension', 'src');
  const extensionDistDir = path.join(__dirname, 'chrome-extension', 'dist');
  
  const filesToCheck = [
    path.join(extensionSrcDir, 'index.html'),
    path.join(extensionSrcDir, 'app.js'),
    path.join(extensionSrcDir, 'content.js'),
    path.join(extensionSrcDir, 'background.js')
  ];

  if (fs.existsSync(path.join(extensionDistDir, 'src', 'index.html'))) {
    filesToCheck.push(path.join(extensionDistDir, 'src', 'index.html'));
  }

  // Also check built assets in dist/assets/*.js
  const distAssetsDir = path.join(extensionDistDir, 'assets');
  if (fs.existsSync(distAssetsDir)) {
    const distFiles = fs.readdirSync(distAssetsDir).filter(f => f.endsWith('.js'));
    distFiles.forEach(f => filesToCheck.push(path.join(distAssetsDir, f)));
  }
  
  // Regex to match inline event attributes like onclick="...", onblur='...', etc. inside HTML tags/templates
  const inlineAttrRegex = /\b(on[a-z]{2,})\s*=\s*["']/gi;
  
  let violations = [];

  for (const filePath of filesToCheck) {
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relativePath = path.relative(__dirname, filePath);

    lines.forEach((line, index) => {
      let match;
      while ((match = inlineAttrRegex.exec(line)) !== null) {
        const attr = match[1].toLowerCase();
        const prefix = line.substring(0, match.index);
        
        // Ensure it's inside an HTML tag context (after '<' and element name or inside HTML string literal)
        if (prefix.includes('<') || line.includes('<')) {
          violations.push({
            file: relativePath,
            line: index + 1,
            attr,
            code: line.length > 120 ? line.substring(Math.max(0, match.index - 30), Math.min(line.length, match.index + 90)) : line.trim()
          });
        }
      }
    });
  }

  console.log(`Checking extension source and build files for inline event handler violations (CSP Compliance)...`);
  if (violations.length > 0) {
    console.error(`❌ Found ${violations.length} CSP inline event handler violation(s):`);
    violations.forEach(v => {
      console.error(`  - ${v.file}:${v.line} [${v.attr}]: ${v.code}`);
    });
    return false;
  }

  console.log(`✅ No inline event handlers found in source or build output! CSP compliance check passed.`);
  return true;
}

if (!testNoInlineEventHandlers()) {
  process.exit(1);
}
