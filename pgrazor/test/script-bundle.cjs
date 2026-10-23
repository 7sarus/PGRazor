// Use the same ordered source manifest as the APK packager.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'runtime/bundles.json'), 'utf8'));
module.exports = name => manifest[name].map(part => fs.readFileSync(path.join(root, part), 'utf8')).join('\n;\n');
