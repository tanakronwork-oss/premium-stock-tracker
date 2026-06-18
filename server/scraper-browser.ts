import puppeteer, { Browser, Page } from 'puppeteer';
import { getCookieForSource } from './db';

const TIMEOUT = 30000;
let browser: Browser | null = null;

interface ScrapedProduct {
  externalId: string;
  name: string;
  price: number;
  stock: number;
  url?: string;
  imageUrl?: string;
  info?: string;
  category?: string;
}

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
      ],
    });
  }
  return browser;
}

// Strip "name=" prefix if user pasted full cookie string like "session=VALUE"
function extractCookieValue(raw: string, cookieName: string): string {
  const prefix = `${cookieName}=`;
  if (raw.startsWith(prefix)) {
    return raw.slice(prefix.length);
  }
  // Also handle if stored as full cookie header with multiple cookies
  const match = raw.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`))
  if (match) return match[1];
  return raw;
}

async function setupPage(br: Browser, cookieValue: string, cookieName: string, domain: string): Promise<Page> {
  const page = await br.newPage();
  await page.setDefaultTimeout(TIMEOUT);
  await page.setDefaultNavigationTimeout(TIMEOUT);

  // Stealth: override navigator.webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // @ts-ignore
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['th-TH', 'th', 'en-US', 'en'] });
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  });

  const cleanValue = extractCookieValue(cookieValue, cookieName);
  await page.setCookie({
    name: cookieName,
    value: cleanValue,
    domain: domain,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  });

  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function scrapeFinShopBrowser(): Promise<ScrapedProduct[]> {
  let page: Page | null = null;
  try {
    const br = await getBrowser();
    page = await br.newPage();
    await page.setDefaultTimeout(TIMEOUT);
    await page.setDefaultNavigationTimeout(TIMEOUT);
    await page.goto('https://finshop.me/?page=app', { waitUntil: 'networkidle2' });
    const categories = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="?page=category&id="]'));
      return links.map(link => ({
        name: (link.querySelector('h2') as HTMLElement)?.textContent?.trim() || '',
        url: (link as HTMLAnchorElement).href,
      }));
    });
    const products: ScrapedProduct[] = [];
    for (const category of categories.slice(0, 5)) {
      try {
        await page.goto(category.url, { waitUntil: 'networkidle2' });
        const categoryProducts = await page.evaluate(() => {
          const items: any[] = [];
          const containers = document.querySelectorAll('div.bg-white.p-4.rounded-lg.shadow-sm.text-center');
          containers.forEach((container) => {
            const nameEl = container.querySelector('p.text-sm.font-semibold');
            const priceEl = container.querySelector('p.text-xl.font-bold.text-gray-800');
            const stockEl = container.querySelector('span.blink-red');
            const imgEl = container.querySelector('img');
            const linkEl = container.querySelector('a[href*="?buy=product"]');
            if (nameEl && priceEl) {
              const name = nameEl.textContent?.trim() || '';
              const priceText = priceEl.textContent?.trim() || '';
              const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
              const isOutOfStock = !!stockEl && stockEl.textContent?.includes('หมด');
              const stock = isOutOfStock ? 0 : 1;
              items.push({
                name,
                price,
                stock,
                url: linkEl ? (linkEl as HTMLAnchorElement).href : '',
                imageUrl: imgEl ? (imgEl as HTMLImageElement).src : '',
              });
            }
          });
          return items;
        });
        categoryProducts.forEach((prod, idx) => {
          products.push({
            externalId: `finshop-${Date.now()}-${idx}`,
            ...prod,
          });
        });
      } catch (err) {
        console.warn(`Failed to scrape category ${category.name}:`, err);
      }
    }
    return products;
  } catch (error) {
    console.error('FinShop browser scraper error:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

export async function scrapePuckPickBrowser(): Promise<ScrapedProduct[]> {
  let page: Page | null = null;
  try {
    const br = await getBrowser();
    page = await br.newPage();
    await page.setDefaultTimeout(TIMEOUT);
    await page.setDefaultNavigationTimeout(TIMEOUT);
    await page.goto('https://www.puckpick.xyz/shop', { waitUntil: 'networkidle2' });
    const products = await page.evaluate(() => {
      const items: any[] = [];
      const containers = document.querySelectorAll('[class*="product"], [class*="item"], .card');
      containers.forEach((container) => {
        const nameEl = container.querySelector('h2, h3, .name, .title, [class*="name"]');
        const priceEl = container.querySelector('[class*="price"], .price');
        const stockEl = container.querySelector('[class*="stock"], [class*="quantity"]');
        if (nameEl && priceEl) {
          const name = nameEl.textContent?.trim() || '';
          const priceText = priceEl.textContent?.trim() || '';
          const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
          const stockText = stockEl?.textContent?.trim() || '1';
          const stock = parseInt(stockText.replace(/[^\d]/g, '')) || 1;
          items.push({
            externalId: container.getAttribute('data-id') || container.getAttribute('id') || `puckpick-${Math.random()}`,
            name,
            price,
            stock,
            url: (container.querySelector('a') as HTMLAnchorElement)?.href || '',
            imageUrl: (container.querySelector('img') as HTMLImageElement)?.src || '',
          });
        }
      });
      return items;
    });
    return products;
  } catch (error) {
    console.error('PuckPick browser scraper error:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

export async function scrapeGaFiwShopBrowser(): Promise<ScrapedProduct[]> {
  let page: Page | null = null;
  try {
    const br = await getBrowser();
    page = await br.newPage();
    await page.setDefaultTimeout(TIMEOUT);
    await page.setDefaultNavigationTimeout(TIMEOUT);
    await page.goto('https://gafiwshop.xyz/', { waitUntil: 'networkidle2' });
    const products = await page.evaluate(() => {
      const items: any[] = [];
      const containers = document.querySelectorAll('[class*="product"], [class*="item"], .card');
      containers.forEach((container) => {
        const nameEl = container.querySelector('h2, h3, .name, .title');
        const priceEl = container.querySelector('[class*="price"], .price');
        const stockEl = container.querySelector('[class*="stock"]');
        if (nameEl && priceEl) {
          const name = nameEl.textContent?.trim() || '';
          const priceText = priceEl.textContent?.trim() || '';
          const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
          const stockText = stockEl?.textContent?.trim() || '1';
          const stock = parseInt(stockText.replace(/[^\d]/g, '')) || 1;
          items.push({
            externalId: `gafiw-${Math.random()}`,
            name,
            price,
            stock,
            url: (container.querySelector('a') as HTMLAnchorElement)?.href || '',
            imageUrl: (container.querySelector('img') as HTMLImageElement)?.src || '',
          });
        }
      });
      return items;
    });
    return products;
  } catch (error) {
    console.error('GaFiwShop browser scraper error:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

export async function scrapePremium24hrBrowser(): Promise<ScrapedProduct[]> {
  let page: Page | null = null;
  try {
    const br = await getBrowser();
    page = await br.newPage();
    await page.setDefaultTimeout(TIMEOUT);
    await page.setDefaultNavigationTimeout(TIMEOUT);
    await page.goto('https://premium24hr.com/', { waitUntil: 'networkidle2' });
    const products = await page.evaluate(() => {
      const items: any[] = [];
      const containers = document.querySelectorAll('[class*="product"], [class*="item"], .card');
      containers.forEach((container) => {
        const nameEl = container.querySelector('h2, h3, .name, .title');
        const priceEl = container.querySelector('[class*="price"], .price');
        const stockEl = container.querySelector('[class*="stock"]');
        if (nameEl && priceEl) {
          const name = nameEl.textContent?.trim() || '';
          const priceText = priceEl.textContent?.trim() || '';
          const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
          const stockText = stockEl?.textContent?.trim() || '1';
          const stock = parseInt(stockText.replace(/[^\d]/g, '')) || 1;
          items.push({
            externalId: `prem24-${Math.random()}`,
            name,
            price,
            stock,
            url: (container.querySelector('a') as HTMLAnchorElement)?.href || '',
            imageUrl: (container.querySelector('img') as HTMLImageElement)?.src || '',
          });
        }
      });
      return items;
    });
    return products;
  } catch (error) {
    console.error('Premium24hr browser scraper error:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

// Precise product extractor matching actual HTML structure of rdcw.xyz sites
// Structure: a[href^="/products/"] > div.bg-card > ... > h1 (name), p.text-primary (price), p (stock)
function extractProducts(baseUrl: string) {
  const items: any[] = [];
  const seen = new Set<string>();

  // Primary strategy: a[href^="/products/"] with .bg-card inside
  document.querySelectorAll('a[href^="/products/"]').forEach((link) => {
    const href = (link as HTMLAnchorElement).href;
    if (seen.has(href)) return;

    // Card is directly inside the <a> tag
    const card = link.querySelector('.bg-card') || link;

    const nameEl = card.querySelector('h1');
    const priceEl = card.querySelector('p.text-primary');
    // Stock paragraph contains "เหลือทั้งหมด X ชิ้น"
    const stockEl = Array.from(card.querySelectorAll('p')).find(
      p => p.textContent?.includes('เหลือทั้งหมด')
    );
    const imgEl = card.querySelector('img');

    const name = (nameEl as HTMLElement)?.innerText?.trim() || nameEl?.textContent?.trim() || '';
    if (!name) return;

    // Use innerText to avoid SVG path numbers contaminating the price text
    // p.text-primary uses flex items-center gap-1.5 → may contain SVG icon + price text
    const priceRaw = (priceEl as HTMLElement)?.innerText?.trim() || priceEl?.textContent?.trim() || '';
    // Extract numeric price: match digits (with optional comma thousands-sep) before บาท/฿
    const priceMatch = priceRaw.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿|$)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

    // Detect out-of-stock: img has grayscale class OR overlay div with "สินค้าหมด"
    const isOutOfStock =
      imgEl?.classList.contains('grayscale') ||
      !!card.querySelector('[class*="grayscale"]') ||
      card.textContent?.includes('สินค้าหมด');

    let stock: number;
    if (isOutOfStock) {
      stock = 0;
    } else {
      const stockText = stockEl?.textContent?.trim() || '';
      // "เหลือทั้งหมด 6 ชิ้น" -> extract 6
      const stockNum = stockText.match(/\d+/);
      stock = stockNum ? parseInt(stockNum[0]) : 1;
    }

    seen.add(href);
    items.push({
      externalId: href.split('/').filter(Boolean).pop() || `product-${Math.random()}`,
      name,
      price,
      stock,
      url: href,
      imageUrl: imgEl ? (imgEl as HTMLImageElement).src : '',
    });
  });

  // Fallback: generic card selectors
  if (items.length === 0) {
    document.querySelectorAll('[class*="product"], [class*="card"], article').forEach((card, idx) => {
      const nameEl = card.querySelector('h1, h2, h3');
      const priceEl = card.querySelector('p.text-primary, [class*="price"]');
      const linkEl = card.querySelector('a[href*="/products/"]') || card.querySelector('a');
      const imgEl = card.querySelector('img');
      const name = nameEl?.textContent?.trim() || '';
      const priceText = priceEl?.textContent?.trim() || '';
      const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
      if (name.length > 2 && price > 0) {
        items.push({
          externalId: `fallback-${idx}-${name}`,
          name,
          price,
          stock: 1,
          url: linkEl ? (linkEl as HTMLAnchorElement).href : baseUrl,
          imageUrl: imgEl ? (imgEl as HTMLImageElement).src : '',
        });
      }
    });
  }

  return items;
}

export async function scrapeDisplusHouseBrowser(sourceId: number): Promise<ScrapedProduct[]> {
  let page: Page | null = null;
  try {
    const cookie = await getCookieForSource(sourceId);
    if (!cookie) throw new Error('Cookie not configured for DisplusHouse');

    const domain = 'displushouse.rdcw.xyz';
    const baseUrl = `https://${domain}`;
    const br = await getBrowser();
    page = await setupPage(br, cookie.cookieValue, cookie.cookieName || 'session', domain);

    // Go to homepage first to let Cloudflare verify cookie
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    // Check if still on login/blocked page
    const currentUrl = page.url();
    console.log('[DisplusHouse] Current URL after homepage:', currentUrl);
    const title = await page.title();
    console.log('[DisplusHouse] Page title:', title);
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
    console.log('[DisplusHouse] Page text sample:', pageText);

    // Try to find category/product links on homepage
    const categoryLinks: string[] = await page.evaluate((base) => {
      const links = Array.from(document.querySelectorAll('a[href*="/categories/"], a[href*="/products/"]'));
      return [...new Set(links.map(l => (l as HTMLAnchorElement).href).filter(h => h.startsWith(base)))];
    }, baseUrl);

    console.log('[DisplusHouse] Found links:', categoryLinks.length);

    // Scrape homepage products
    let products: ScrapedProduct[] = await page.evaluate(extractProducts, baseUrl) as ScrapedProduct[];
    console.log('[DisplusHouse] Products from homepage:', products.length);

    // Also scrape each category page
    for (const link of categoryLinks.slice(0, 10)) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1000));
        const catProducts: ScrapedProduct[] = await page.evaluate(extractProducts, link) as ScrapedProduct[];
        console.log(`[DisplusHouse] Products from ${link}:`, catProducts.length);
        products = [...products, ...catProducts];
      } catch (e) {
        console.warn('[DisplusHouse] Failed to scrape:', link, e);
      }
    }

    // Dedupe by externalId
    const seen = new Set<string>();
    return products.filter(p => {
      if (seen.has(p.externalId)) return false;
      seen.add(p.externalId);
      return true;
    });
  } catch (error) {
    console.error('DisplusHouse browser scraper error:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

export async function scrapeKaimansBrowser(sourceId: number): Promise<ScrapedProduct[]> {
  let page: Page | null = null;
  try {
    const cookie = await getCookieForSource(sourceId);
    if (!cookie) throw new Error('Cookie not configured for Kaimans');

    const domain = 'kaimans.rdcw.xyz';
    const baseUrl = `https://${domain}`;
    const br = await getBrowser();
    page = await setupPage(br, cookie.cookieValue, cookie.cookieName || 'session', domain);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    console.log('[Kaimans] URL:', page.url(), 'Title:', await page.title());

    const categoryLinks: string[] = await page.evaluate((base) => {
      const links = Array.from(document.querySelectorAll('a[href*="/categories/"], a[href*="/products/"]'));
      return [...new Set(links.map(l => (l as HTMLAnchorElement).href).filter(h => h.startsWith(base)))];
    }, baseUrl);

    let products: ScrapedProduct[] = await page.evaluate(extractProducts, baseUrl) as ScrapedProduct[];

    for (const link of categoryLinks.slice(0, 10)) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1000));
        const catProducts: ScrapedProduct[] = await page.evaluate(extractProducts, link) as ScrapedProduct[];
        products = [...products, ...catProducts];
      } catch (e) {
        console.warn('[Kaimans] Failed to scrape:', link, e);
      }
    }

    const seen = new Set<string>();
    return products.filter(p => {
      if (seen.has(p.externalId)) return false;
      seen.add(p.externalId);
      return true;
    });
  } catch (error) {
    console.error('Kaimans browser scraper error:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}

export async function scrapeMinaPremiumBrowser(sourceId: number): Promise<ScrapedProduct[]> {
  let page: Page | null = null;
  try {
    const cookie = await getCookieForSource(sourceId);
    if (!cookie) throw new Error('Cookie not configured for MinaPremium');

    const domain = 'minapremium.rdcw.xyz';
    const baseUrl = `https://${domain}`;
    const br = await getBrowser();
    page = await setupPage(br, cookie.cookieValue, cookie.cookieName || 'session', domain);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    console.log('[MinaPremium] URL:', page.url(), 'Title:', await page.title());

    const categoryLinks: string[] = await page.evaluate((base) => {
      const links = Array.from(document.querySelectorAll('a[href*="/categories/"], a[href*="/products/"]'));
      return [...new Set(links.map(l => (l as HTMLAnchorElement).href).filter(h => h.startsWith(base)))];
    }, baseUrl);

    let products: ScrapedProduct[] = await page.evaluate(extractProducts, baseUrl) as ScrapedProduct[];

    for (const link of categoryLinks.slice(0, 10)) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1000));
        const catProducts: ScrapedProduct[] = await page.evaluate(extractProducts, link) as ScrapedProduct[];
        products = [...products, ...catProducts];
      } catch (e) {
        console.warn('[MinaPremium] Failed to scrape:', link, e);
      }
    }

    const seen = new Set<string>();
    return products.filter(p => {
      if (seen.has(p.externalId)) return false;
      seen.add(p.externalId);
      return true;
    });
  } catch (error) {
    console.error('MinaPremium browser scraper error:', error);
    throw error;
  } finally {
    if (page) await page.close();
  }
}
