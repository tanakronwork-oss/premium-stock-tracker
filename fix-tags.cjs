const fs = require('fs');
let txt = fs.readFileSync('server/scraper.ts', 'utf8');
txt = txt.replace(/"tags": \[\s*"([^"\n]+)"\s*\]/g, '"tags": "$1"');
fs.writeFileSync('server/scraper.ts', txt);
