const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['src'];
let failed = false;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith('.js')) {
      const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
      if (r.status !== 0) {
        failed = true;
        console.error(`Syntax error: ${p}`);
        console.error(r.stderr);
      }
    }
  }
}
roots.forEach(r => walk(r));
if (failed) process.exit(1);
console.log('JavaScript syntax OK');
