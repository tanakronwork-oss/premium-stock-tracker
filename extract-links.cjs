const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('madmaxmc_store.html', 'utf8'));
const links = new Set();
$('a').each((i, el) => links.add($(el).attr('href')));
fs.writeFileSync('links.txt', [...links].join('\n'));
