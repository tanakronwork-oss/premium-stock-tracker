const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('madmaxmc_store.html', 'utf8');
const $ = cheerio.load(html);

console.log('Products generic classes:', $('.product-card, [data-product], .product, .item, article').length);

$('div').each((i, el) => {
  const text = $(el).text();
  if (text.includes('Netflix') || text.includes('ราคา') || text.includes('ซื้อสินค้า')) {
    console.log('Found potential product div with classes:', $(el).attr('class'));
  }
});
