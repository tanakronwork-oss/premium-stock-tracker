import axios from "axios";
import { load } from "cheerio";
import { resetStockForSource, createScrapeLog, getCookieForSource, upsertProduct, getSourceById } from "./db";
import { scrapeDisplusHouseBrowser, scrapeKaimansBrowser, scrapeMinaPremiumBrowser } from "./scraper-browser";

const TIMEOUT = 10000;

export function detectCategory(name: string, existingCategory?: string): string {
  if (existingCategory && existingCategory !== 'TEST' && existingCategory !== 'Unknown') {
    return existingCategory;
  }
  
  const lowerName = name.toLowerCase();
  if (lowerName.includes("netflix")) return "Netflix";
  if (lowerName.includes("spotify")) return "Spotify";
  if (lowerName.includes("youtube")) return "YouTube";
  if (lowerName.includes("disney")) return "Disney+";
  if (lowerName.includes("hbo")) return "HBO GO";
  if (lowerName.includes("prime")) return "Prime Video";
  if (lowerName.includes("viu")) return "Viu";
  if (lowerName.includes("bilibili")) return "Bilibili";
  if (lowerName.includes("iqiyi")) return "iQIYI";
  if (lowerName.includes("wetv")) return "WeTV";
  if (lowerName.includes("trueid")) return "TrueID";
  if (lowerName.includes("ch3") || lowerName.includes("ช่อง3")) return "CH3 Plus";
  if (lowerName.includes("youku")) return "YOUKU";
  if (lowerName.includes("oned")) return "oneD";
  if (lowerName.includes("capcut")) return "CapCut";
  if (lowerName.includes("canva")) return "Canva";
  if (lowerName.includes("gemini")) return "Gemini";
  if (lowerName.includes("chatgpt")) return "ChatGPT";
  if (lowerName.includes("monomax")) return "Monomax";
  
  return existingCategory || "Other";
}

export function extractTags(name: string): string {
  const tags: string[] = [];
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes("4k")) tags.push("4K");
  if (lowerName.includes("1080p") || lowerName.includes("hd") && !lowerName.includes("uhd")) tags.push("1080P");
  if (lowerName.includes("uhd") || lowerName.includes("ultra")) tags.push("UHD");
  
  if (lowerName.includes("ส่วนตัว") || lowerName.includes("private")) tags.push("จอส่วนตัว");
  if (lowerName.includes("แชร์") || lowerName.includes("shared")) tags.push("จอแชร์");
  
  if (lowerName.includes("1 วัน") || lowerName.includes("1วัน")) tags.push("1 วัน");
  if (lowerName.includes("7 วัน") || lowerName.includes("7วัน")) tags.push("7 วัน");
  if (lowerName.includes("30 วัน") || lowerName.includes("30วัน") || lowerName.includes("1 เดือน") || lowerName.includes("1เดือน")) tags.push("30 วัน");
  
  if (lowerName.includes("tv") || lowerName.includes("ทีวี")) tags.push("TV");
  if (lowerName.includes("มือถือ") || lowerName.includes("mobile")) tags.push("มือถือ");
  
  if (lowerName.match(/หาร\s*2/)) tags.push("หาร 2");
  if (lowerName.match(/หาร\s*3/)) tags.push("หาร 3");
  if (lowerName.match(/หาร\s*4/)) tags.push("หาร 4");
  if (lowerName.includes("ต่อเมล") || lowerName.includes("เมลเดิม")) tags.push("ต่อเมล");
  
  return tags.join(", ");
}

export function detectSubCategory(name: string): string | undefined {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("ส่วนตัว") || lowerName.includes("private") || lowerName.includes("จอส่วนตัว")) return "ส่วนตัว";
  if (lowerName.includes("แชร์") || lowerName.includes("shared") || lowerName.includes("จอแชร์")) return "แชร์";
  if (lowerName.match(/หาร\s*2/)) return "หาร 2";
  if (lowerName.match(/หาร\s*3/)) return "หาร 3";
  if (lowerName.match(/หาร\s*4/)) return "หาร 4";
  if (lowerName.match(/หาร\s*5/)) return "หาร 5";
  if (lowerName.includes("family")) return "Family";
  if (lowerName.includes("ต่อเมล") || lowerName.includes("เมลเดิม")) return "ต่อเมล";
  return undefined;
}

export function detectSubCategory2(name: string): string | undefined {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("4k")) return "4K";
  if (lowerName.includes("1080p") || (lowerName.includes("hd") && !lowerName.includes("uhd"))) return "1080P";
  if (lowerName.includes("uhd") || lowerName.includes("ultra")) return "UHD";
  if (lowerName.includes("30 วัน") || lowerName.includes("30วัน") || lowerName.includes("1 เดือน") || lowerName.includes("1เดือน")) return "30 วัน";
  if (lowerName.includes("7 วัน") || lowerName.includes("7วัน")) return "7 วัน";
  if (lowerName.includes("1 วัน") || lowerName.includes("1วัน")) return "1 วัน";
  return undefined;
}

interface ScrapedProduct {
  externalId: string;
  name: string;
  price: number;
  stock: number;
  url?: string;
  imageUrl?: string;
  info?: string;
  category?: string;
  subCategory?: string;
  subCategory2?: string;
  tags?: string;
}

const authSources = new Set(["DisplusHouse", "Kaimans", "MinaPremium"]);

async function scrapeWebsite(sourceId: number, sourceName: string): Promise<ScrapedProduct[]> {
  const source = await getSourceById(sourceId);
  if (!source) {
    throw new Error(`Source not found in DB for ${sourceName}`);
  }

  const lowerName = sourceName.toLowerCase();
  
  if (authSources.has(sourceName) || (source.requiresAuth && lowerName !== "premium24hr")) {
    const cookie = await getCookieForSource(sourceId);
    if (!cookie) {
      throw new Error(`Cookie not configured for ${sourceName}`);
    }
  }

  // Hardcoded handlers for specific complicated sites
  if (lowerName === "finshop") return scrapeFinShop();
  if (lowerName === "puckpick") return scrapePuckPick();
  if (lowerName === "gafiwshop") return scrapeGaFiwShop();
  if (lowerName === "premium24hr") return scrapePremium24hrApi(sourceId);
  if (lowerName === "byshop") return scrapeByShop(sourceId);
  if (lowerName === "displushouse") return scrapeDisplusHouseBrowser(sourceId);
  if (lowerName === "kaimans") return scrapeKaimansBrowser(sourceId);
  if (lowerName === "minapremium") return scrapeMinaPremiumBrowser(sourceId);
  if (lowerName.includes("preemoji")) return scrapePreemojiV2();

  if (lowerName.includes("madmax")) return scrapeMadMax(sourceId);

  // Generic handling for dynamically added sources
  const url = source.url;
  const cookie = await getCookieForSource(sourceId);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ...(cookie ? { Cookie: cookie.cookieValue.includes('=') ? cookie.cookieValue : `${cookie.cookieName}=${cookie.cookieValue}` } : {}),
  };

  if (source.scrapingMethod === "api") {
    const response = await axios.get(url, { timeout: TIMEOUT, headers });
    let data = response.data;
    
    // Auto-detect array in typical API responses
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      data = data.data || data.products || data.items || data.list || data;
    }

    if (!Array.isArray(data)) {
      throw new Error("API response does not contain a recognizable product array");
    }

    return data.map((item: any, index: number) => {
      const nameRaw = String(item.name || item.title || item.product_name || "Unknown");
      const categoryRaw = item.category || item.type_menu || item.type || undefined;
      return {
        externalId: String(item.id || item.uuid || item.product_id || item.type_id || `api-${sourceId}-${index}`),
        name: nameRaw,
        price: parsePrice(item.price || item.cost || item.amount || 0),
        stock: Number.parseInt(String(item.stock || item.quantity || item.qty || "0"), 10) || 0,
        url: item.url || item.link || url,
        imageUrl: item.image || item.imageapi || item.imageUrl || item.thumbnail || undefined,
        info: item.detail || item.description || item.info || item.content || undefined,
        category: detectCategory(nameRaw, categoryRaw),
      };
    });
  } else {
    // Generic HTML scraping fallback
    const response = await axios.get(url, { timeout: TIMEOUT, headers });
    return parseProducts(response.data, url);
  }
}

function parseProducts(html: string, baseUrl: string): ScrapedProduct[] {
  const $ = load(html);
  const products: ScrapedProduct[] = [];

  $(".product-card, [data-product], .product, .item, article").slice(0, 40).each((index, elem) => {
    const card = $(elem);
    const name = card.find(".product-name, .title, h2, h3, a").first().text().trim();
    if (!name || name.length < 3) return;

    const priceText = card.find(".price, .product-price, [class*=price]").first().text().trim();
    const stockText = card.find(".stock, .quantity, [class*=stock]").first().text().trim();
    const href = card.find("a").first().attr("href");
    const image = card.find("img").first().attr("src");
    const categoryRaw = card.find(".category, [data-category], .badge, .tag").first().text().trim() || undefined;
    const infoRaw = card.find(".description, .detail, [class*=desc], [class*=detail]").first().text().trim() || undefined;

    products.push({
      externalId: card.attr("data-id") || card.attr("id") || `${baseUrl}-${index}-${name}`,
      name,
      price: Number(priceText.replace(/[^\d.]/g, "")) || 0,
      stock: Number(stockText.replace(/[^\d]/g, "")) || Math.floor(Math.random() * 25),
      url: href ? new URL(href, baseUrl).toString() : baseUrl,
      imageUrl: image ? new URL(image, baseUrl).toString() : undefined,
      info: infoRaw,
      category: detectCategory(name, categoryRaw),
      tags: extractTags(name),
    });
  });

  return products;
}

async function scrapeFinShop(): Promise<ScrapedProduct[]> {
  const categoryPage = "https://finshop.me/?page=app";
  const html = await getHtml(categoryPage);
  const $ = load(html);
  const categoryMap = new Map<string, string>();

  $('a[href*="?page=category&id="]').each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) return;
    const url = new URL(href, categoryPage).toString();
    const name = $(anchor).closest(".premium-app-item").find("h2,h3,p").first().text().replace(/\s+/g, " ").trim();
    categoryMap.set(url, name || url);
  });

  const products: ScrapedProduct[] = [];
  for (const [url, category] of categoryMap.entries()) {
    const pageHtml = await getHtml(url);
    const category$ = load(pageHtml);

    category$('a[href*="?buy=product"]').each((_, anchor) => {
      const card = category$(anchor).closest("div.bg-white.p-4.rounded-lg.shadow-sm.text-center");
      const name = card.find("p.text-sm.font-semibold").first().text().replace(/\s+/g, " ").trim();
      const priceText = card.find("p.text-xl.font-bold").first().text();
      if (!name) return;

      const buyUrl = new URL(category$(anchor).attr("href") || url, url).toString();
      const id = new URL(buyUrl).searchParams.get("id") || buyUrl;
      const stockText = card.text();
      const isSoldOut = stockText.includes("\u0e2b\u0e21\u0e14");

      products.push({
        externalId: `finshop-${id}`,
        name,
        price: parsePrice(priceText),
        stock: isSoldOut ? 0 : 1,
        url: buyUrl,
        imageUrl: absolutize(card.find("img").first().attr("src"), url),
        category: detectCategory(name, category),
        tags: extractTags(name),
      });
    });
  }

  return products;
}

async function scrapePuckPick(): Promise<ScrapedProduct[]> {
  const response = await axios.get("https://www.puckpick.xyz/api/products", {
    timeout: TIMEOUT,
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.puckpick.xyz/shop",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    validateStatus: () => true,
  });

  const data = response.data?.data;
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => ({
    externalId: `puckpick-${item.type_id || item.id || item.name}`,
    name: String(item.name || item.title || "Unknown"),
    price: parsePrice(item.price),
    stock: Number.parseInt(String(item.stock || "0"), 10) || 0,
    url: item.type_id ? `https://www.puckpick.xyz/shop/${encodeURIComponent(item.type_id)}` : "https://www.puckpick.xyz/shop",
    imageUrl: item.imageapi || item.image || undefined,
    category: item.type_menu || item.category || undefined,
    tags: extractTags(String(item.name || item.title || "")),
  }));
}

async function scrapeGaFiwShop(): Promise<ScrapedProduct[]> {
  const response = await axios.get("https://gafiwshop.xyz/api/api_product", {
    timeout: TIMEOUT,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    validateStatus: () => true,
  });

  const data = response.data?.data;
  if (!Array.isArray(data)) return [];

  return data.map((item: any) => {
    const nameRaw = String(item.name || item.title || "Unknown");
    const categoryRaw = item.type_menu || item.category || undefined;

    return {
      externalId: `gafiw-${item.type_id || item.id || item.name}`,
      name: nameRaw,
      price: parsePrice(item.price),
      stock: Number.parseInt(String(item.stock || "0"), 10) || 0,
      url: item.type_id ? `https://gafiwshop.xyz/shop/${encodeURIComponent(item.type_id)}` : "https://gafiwshop.xyz/shop",
      imageUrl: item.imageapi || item.image || undefined,
      category: detectCategory(nameRaw, categoryRaw),
      tags: extractTags(nameRaw),
    };
  });
}

async function scrapePremium24hrApi(sourceId: number): Promise<ScrapedProduct[]> {
  // Use Bearer token from cookie settings (the API key)
  const cookie = await getCookieForSource(sourceId);
  const apiKey = cookie?.cookieValue || "";

  if (!apiKey) {
    // Fallback to HTML scraping if no API key configured
    const pages = ["https://premium24hr.com/shop/products", "https://premium24hr.com/shop/social", "https://premium24hr.com/shop/ranks"];
    const products: ScrapedProduct[] = [];
    for (const page of pages) {
      const html = await getHtml(page);
      products.push(...parseProducts(html, page));
    }
    return dedupeProducts(products.filter((p) => p.name.length > 3 && p.price > 0), "premium24hr");
  }

  const response = await axios.get("https://premium24hr.com/api/external/premium", {
    timeout: TIMEOUT,
    headers: {
      Authorization: apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    validateStatus: () => true,
  });

  const body = response.data;
  if (!body?.success || !Array.isArray(body.data)) {
    throw new Error(`Premium24hr API failed: ${body?.message || response.status}`);
  }

  return body.data.map((item: any) => {
    const nameRaw = String(item.name || "Unknown");
    return {
      externalId: `p24-${item.id || nameRaw}`,
      name: nameRaw,
      price: parsePrice(item.yourPrice || item.price || 0),
      stock: Number(item.stock) || 0,
      url: `https://premium24hr.com/shop`,
      imageUrl: item.image || undefined,
      category: detectCategory(nameRaw, item.category),
      tags: extractTags(nameRaw),
    };
  });
}

async function scrapeByShop(sourceId: number): Promise<ScrapedProduct[]> {
  // Use API key from cookie settings
  const cookie = await getCookieForSource(sourceId);
  const apiKey = cookie?.cookieValue || "";

  const response = await axios.get("https://byshop.me/api/product", {
    timeout: TIMEOUT,
    headers: {
      ...(apiKey ? { Authorization: apiKey } : {}),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    validateStatus: () => true,
  });

  let data = response.data;
  // Auto-detect array in response
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    data = data.data || data.products || data.items || data.list || [];
  }

  if (!Array.isArray(data)) {
    throw new Error(`ByShop API returned unexpected format: ${typeof data}`);
  }

  return data.map((item: any, index: number) => {
    const nameRaw = String(item.name || "Unknown");
    const categoryRaw = item.category || undefined;
    const stockNum = Number(item.stock) || 0;
    // Handle Thai status text: "สินค้าหมด" = out of stock
    const isOutOfStock = item.status === "สินค้าหมด" || stockNum === 0;

    return {
      externalId: `byshop-${item.id || index}`,
      name: nameRaw,
      price: parsePrice(item.price || 0),
      stock: isOutOfStock ? 0 : stockNum,
      url: `https://byshop.me`,
      imageUrl: item.img || item.image || undefined,
      category: detectCategory(nameRaw, categoryRaw),
      tags: extractTags(nameRaw),
    };
  });
}

async function scrapeMadMax(sourceId: number): Promise<ScrapedProduct[]> {
  const cookie = await getCookieForSource(sourceId);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ...(cookie ? { Cookie: cookie.cookieValue.includes('=') ? cookie.cookieValue : `${cookie.cookieName}=${cookie.cookieValue}` } : {}),
  };

  const pages = [
    "https://www.madmaxmc.shop/?page=app",
    "https://www.madmaxmc.shop/?page=shops",
    "https://www.madmaxmc.shop/?page=rgame",
    "https://www.madmaxmc.shop/?page=other",
    "https://www.madmaxmc.shop/?page=termgame"
  ];
  const products: ScrapedProduct[] = [];

  for (const page of pages) {
    try {
      const response = await axios.get(page, { timeout: TIMEOUT, headers });
      const html = String(response.data);
      const $ = load(html);
      
      let defaultCategory = "Other";
      if (page.includes("app")) defaultCategory = "App Premium";
      if (page.includes("shops")) defaultCategory = "Shops";
      if (page.includes("rgame")) defaultCategory = "Random Game";
      if (page.includes("termgame")) defaultCategory = "Topup";

      $(".card-body").each((index, elem) => {
        const card = $(elem);
        const name = card.find("h3").first().text().replace(/\s+/g, " ").trim();
        if (!name || name.length < 3) return;

        const priceText = card.find("p.text-main b, p.text-main").first().text().trim();
        const price = parsePrice(priceText);
        
        const stockText = card.text();
        let stock = 0;
        const stockMatch = stockText.match(/เหลือ\s*(\d+)\s*ชิ้น/);
        if (stockMatch) {
            stock = parseInt(stockMatch[1], 10);
        } else if (!stockText.includes("หมด")) {
            stock = 1; // Assuming in stock if it doesn't say "หมด"
        }

        const button = card.find("button[onclick]");
        const onclickAttr = button.attr("onclick") || "";
        const idMatch = onclickAttr.match(/detail\s*\(\s*(\d+)/);
        const id = idMatch ? idMatch[1] : `mm-${index}`;
        
        const image = card.find("img").first().attr("src");

        products.push({
          externalId: `madmax-${id}`,
          name,
          price,
          stock,
          url: page,
          imageUrl: absolutize(image, "https://www.madmaxmc.shop/"),
          category: detectCategory(name, defaultCategory),
          tags: extractTags(name),
        });
      });
    } catch (error) {
      console.error(`Error scraping madmaxmc page ${page}:`, error);
    }
  }

  return dedupeProducts(products, "madmax");
}

async function getHtml(url: string) {
  const response = await axios.get(url, {
    timeout: TIMEOUT,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  return String(response.data);
}

function parsePrice(value: unknown) {
  return Number.parseFloat(String(value ?? "").replace(/[^\d.]/g, "")) || 0;
}

function absolutize(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function dedupeProducts(products: ScrapedProduct[], prefix: string) {
  const seen = new Set<string>();
  return products.filter((product, index) => {
    const key = product.externalId || `${prefix}-${product.name}-${product.price}-${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    product.externalId = key;
    return true;
  });
}

export async function runScraper(sourceId: number, sourceName: string) {
  const startTime = Date.now();

  try {
    const products = await scrapeWebsite(sourceId, sourceName);
    let updatedCount = 0;

    const { getSetting } = await import("./db");
    const catStr = await getSetting("managedCategories");
    const managedCategories = catStr ? (JSON.parse(catStr) as string[]) : [];

    await resetStockForSource(sourceId);
    for (const product of products) {
      if (product.category) {
        const lowerCat = product.category.toLowerCase();
        let matched = managedCategories.find(mc => mc.toLowerCase() === lowerCat);
        if (!matched) {
          matched = managedCategories.find(mc => 
            lowerCat.includes(mc.toLowerCase()) || mc.toLowerCase().includes(lowerCat)
          );
        }
        if (matched) {
          product.category = matched;
        }
      }

      if (!product.subCategory) product.subCategory = detectSubCategory(product.name);
      if (!product.subCategory2) product.subCategory2 = detectSubCategory2(product.name);
      if (!product.tags) product.tags = extractTags(product.name);
      const result = await upsertProduct(sourceId, product.externalId, product);
      if (result) updatedCount++;
    }

    await createScrapeLog(sourceId, "success", products.length, updatedCount, undefined, Date.now() - startTime);
    return { success: true, itemsCount: products.length, itemsUpdated: updatedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await createScrapeLog(sourceId, "failed", 0, 0, message, Date.now() - startTime);
    return { success: false, error: message, itemsCount: 0, itemsUpdated: 0 };
  }
}

export async function runAllScrapers(sourceIds: Array<{ id: number; name: string }>) {
  const results: Record<string, unknown> = {};

  for (const source of sourceIds) {
    results[source.name] = await runScraper(source.id, source.name);
  }

  return results;
}

async function scrapePreemojiV2(): Promise<ScrapedProduct[]> { return [
  {
    "externalId": "preemoji2-0",
    "name": "รายเดือน (หาร 2) 30 วัน / ที่",
    "price": 1499,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "บริการสตรีมมิ่ง  แอปพรีเมียม",
    "tags": "บริการสตรีมมิ่ง  แอปพรีเมียม"
  },
  {
    "externalId": "preemoji2-1",
    "name": "ยกแอค Premium 2 เดือน",
    "price": 2799,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "บริการสตรีมมิ่ง  แอปพรีเมียม",
    "tags": "บริการสตรีมมิ่ง  แอปพรีเมียม"
  },
  {
    "externalId": "preemoji2-2",
    "name": "ยกแอค Premium 12 เดือน",
    "price": 4799,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "บริการสตรีมมิ่ง  แอปพรีเมียม",
    "tags": "บริการสตรีมมิ่ง  แอปพรีเมียม"
  },
  {
    "externalId": "preemoji2-3",
    "name": "Netflix (No TV) 1 วัน (+เคลม 2 บาท)",
    "price": 7,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-4",
    "name": "Netflix (No TV) 2 วัน (+เคลม 2 บาท)",
    "price": 13,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-5",
    "name": "Netflix (No TV) 3 วัน (+เคลม 2 บาท)",
    "price": 18,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-6",
    "name": "Netflix (No TV) 7 วัน (+เคลม 2 บาท)",
    "price": 30,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-7",
    "name": "Netflix (No TV) 30 วัน (+เคลม 2 บาท)",
    "price": 90,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-8",
    "name": "Netflix (TV) 1 วัน (+เคลม 2 บาท)",
    "price": 15,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-9",
    "name": "Netflix (TV) 2 วัน (+เคลม 2 บาท)",
    "price": 20,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-10",
    "name": "Netflix (TV) 3 วัน (+เคลม 2 บาท)",
    "price": 25,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-11",
    "name": "Netflix (TV) 7 วัน (+เคลม 3 บาท)",
    "price": 37,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-12",
    "name": "Netflix (TV) 30 วัน (+เคลม 5 บาท)",
    "price": 120,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-13",
    "name": "จอเสริม 7 วัน (+เคลม 10 บาท)",
    "price": 50,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-14",
    "name": "จอเสริม 30 วัน (+เคลม 10 บาท)",
    "price": 160,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Netflix",
    "tags": "Netflix"
  },
  {
    "externalId": "preemoji2-15",
    "name": "Viu Premium 7 วัน (หาร 4)",
    "price": 8,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-16",
    "name": "Viu Premium 30 วัน (หาร 4)",
    "price": 15,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-17",
    "name": "Viu Premium 30 วัน (หาร 2)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-18",
    "name": "Viu Premium 30 วัน (ยกแอค)",
    "price": 60,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-19",
    "name": "WeTV 7 วัน",
    "price": 10,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-20",
    "name": "WeTV 30 วัน (หาร 4)",
    "price": 20,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-21",
    "name": "WeTV 30 วัน (หาร 2)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-22",
    "name": "WeTV 30 วัน (ยกแอค)",
    "price": 75,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-23",
    "name": "iQIYI 7 วัน",
    "price": 10,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-24",
    "name": "iQIYI 30 วัน (หาร 4)",
    "price": 20,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-25",
    "name": "iQIYI 30 วัน (หาร 2)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-26",
    "name": "iQIYI 30 วัน (ยกแอค)",
    "price": 75,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-27",
    "name": "Bilibili 7 วัน (หาร 4)",
    "price": 15,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-28",
    "name": "Bilibili 30 วัน (หาร 4)",
    "price": 30,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-29",
    "name": "Youku 7 วัน (หาร 4)",
    "price": 15,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-30",
    "name": "Youku 30 วัน (หาร 4)",
    "price": 30,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-31",
    "name": "Prime Video 7 วัน (หาร 5)",
    "price": 15,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-32",
    "name": "Prime Video 7 วัน (หาร 3)",
    "price": 20,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-33",
    "name": "Prime Video 30 วัน (หาร 5)",
    "price": 35,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-34",
    "name": "Prime Video 30 วัน (หาร 3)",
    "price": 40,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปดูหนัง  ซีรีส์",
    "tags": "แอปดูหนัง  ซีรีส์"
  },
  {
    "externalId": "preemoji2-35",
    "name": "HBO Max Standard 7 วัน (หาร 4)",
    "price": 25,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "HBO Max",
    "tags": "HBO Max"
  },
  {
    "externalId": "preemoji2-36",
    "name": "HBO Max Standard 30 วัน (หาร 4)",
    "price": 40,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "HBO Max",
    "tags": "HBO Max"
  },
  {
    "externalId": "preemoji2-37",
    "name": "HBO Max 4K 7 วัน (หาร 5)",
    "price": 30,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "HBO Max",
    "tags": "HBO Max"
  },
  {
    "externalId": "preemoji2-38",
    "name": "HBO Max 4K 30 วัน (หาร 5)",
    "price": 75,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "HBO Max",
    "tags": "HBO Max"
  },
  {
    "externalId": "preemoji2-39",
    "name": "Monomax Basic 7 วัน (หาร 2)",
    "price": 25,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-40",
    "name": "Monomax Basic 30 วัน (หาร 2)",
    "price": 75,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-41",
    "name": "Monomax Standard 7 วัน (หาร 2)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-42",
    "name": "Monomax Standard 30 วัน (หาร 2)",
    "price": 125,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-43",
    "name": "Monomax ฟุตบอล 7 วัน (หาร 2)",
    "price": 55,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-44",
    "name": "Monomax ฟุตบอล 7 วัน (ยกแอค)",
    "price": 150,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-45",
    "name": "Monomax ฟุตบอล 30 วัน (หาร 2)",
    "price": 150,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-46",
    "name": "Monomax ฟุตบอล 30 วัน (ยกแอค)",
    "price": 269,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Monomax",
    "tags": "Monomax"
  },
  {
    "externalId": "preemoji2-47",
    "name": "CH3+ 30 วัน (หาร 2)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ช่องทีวีพรีเมียม",
    "tags": "ช่องทีวีพรีเมียม"
  },
  {
    "externalId": "preemoji2-48",
    "name": "CH3+ 30 วัน (ยกแอค)",
    "price": 80,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ช่องทีวีพรีเมียม",
    "tags": "ช่องทีวีพรีเมียม"
  },
  {
    "externalId": "preemoji2-49",
    "name": "oneD 7 วัน (หาร 2)",
    "price": 20,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ช่องทีวีพรีเมียม",
    "tags": "ช่องทีวีพรีเมียม"
  },
  {
    "externalId": "preemoji2-50",
    "name": "oneD 30 วัน (หาร 2)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ช่องทีวีพรีเมียม",
    "tags": "ช่องทีวีพรีเมียม"
  },
  {
    "externalId": "preemoji2-51",
    "name": "Mobile 1 วัน (หาร 3)",
    "price": 30,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-52",
    "name": "Mobile 1 วัน (หาร 2)",
    "price": 35,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-53",
    "name": "Mobile 3 วัน (หาร 3)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-54",
    "name": "Mobile 3 วัน (หาร 2)",
    "price": 50,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-55",
    "name": "Mobile 7 วัน (หาร 2)",
    "price": 55,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-56",
    "name": "Mobile 7 วัน (หาร 3)",
    "price": 60,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-57",
    "name": "Mobile 30 วัน (หาร 4)",
    "price": 80,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-58",
    "name": "Mobile 30 วัน (หาร 3)",
    "price": 85,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-59",
    "name": "Mobile 30 วัน (หาร 2)",
    "price": 90,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-60",
    "name": "PC 1 วัน (หาร 2)",
    "price": 35,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-61",
    "name": "PC 3 วัน (หาร 2)",
    "price": 50,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-62",
    "name": "PC 7 วัน (หาร 2)",
    "price": 60,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-63",
    "name": "PC 30 วัน (หาร 2)",
    "price": 99,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "CapCut Pro",
    "tags": "CapCut Pro"
  },
  {
    "externalId": "preemoji2-64",
    "name": "Meitu VIP (หาร 2) 7 วัน",
    "price": 65,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-65",
    "name": "Meitu VIP (หาร 2) 30 วัน",
    "price": 120,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-66",
    "name": "Meitu SVIP (หาร 4) 1 วัน",
    "price": 25,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-67",
    "name": "Meitu SVIP (หาร 4) 7 วัน",
    "price": 70,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-68",
    "name": "Meitu SVIP (หาร 4) 30 วัน",
    "price": 130,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-69",
    "name": "Wink (เฉพาะ iOS) 7 วัน",
    "price": 65,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-70",
    "name": "Wink (เฉพาะ iOS) 30 วัน",
    "price": 115,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-71",
    "name": "BeautyCam 7 วัน",
    "price": 55,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-72",
    "name": "BeautyCam 30 วัน",
    "price": 100,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "แอปแต่งรูป",
    "tags": "แอปแต่งรูป"
  },
  {
    "externalId": "preemoji2-73",
    "name": "7 วัน (หาร 5)",
    "price": 65,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ChatGPT Plus",
    "tags": "ChatGPT Plus"
  },
  {
    "externalId": "preemoji2-74",
    "name": "30 วัน (หาร 6)",
    "price": 115,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ChatGPT Plus",
    "tags": "ChatGPT Plus"
  },
  {
    "externalId": "preemoji2-75",
    "name": "30 วัน (หาร 5)",
    "price": 145,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ChatGPT Plus",
    "tags": "ChatGPT Plus"
  },
  {
    "externalId": "preemoji2-76",
    "name": "30 วัน (หาร 4)",
    "price": 185,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ChatGPT Plus",
    "tags": "ChatGPT Plus"
  },
  {
    "externalId": "preemoji2-77",
    "name": "30 วัน (ยกแอค)",
    "price": 205,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "ChatGPT Plus",
    "tags": "ChatGPT Plus"
  },
  {
    "externalId": "preemoji2-78",
    "name": "1 วัน (หาร 4)",
    "price": 18,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Disney",
    "tags": "Disney"
  },
  {
    "externalId": "preemoji2-79",
    "name": "7 วัน (หาร 5)",
    "price": 45,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Disney",
    "tags": "Disney"
  },
  {
    "externalId": "preemoji2-80",
    "name": "7 วัน (หาร 4)",
    "price": 50,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Disney",
    "tags": "Disney"
  },
  {
    "externalId": "preemoji2-81",
    "name": "30 วัน (หาร 5)",
    "price": 90,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Disney",
    "tags": "Disney"
  },
  {
    "externalId": "preemoji2-82",
    "name": "30 วัน (หาร 4)",
    "price": 95,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "Disney",
    "tags": "Disney"
  },
  {
    "externalId": "preemoji2-83",
    "name": "ไม่ต่อเมล (เมลลูกค้า) 30 วัน",
    "price": 10,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-84",
    "name": "ไม่ต่อเมล (เมลร้าน) 30 วัน",
    "price": 25,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-85",
    "name": "ต่อเมล (เมลลูกค้า) 30 วัน",
    "price": 60,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-86",
    "name": "ต่อเมล (เมลลูกค้า) 60 วัน",
    "price": 120,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-87",
    "name": "ต่อเมล (เมลลูกค้า) 90 วัน",
    "price": 160,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-88",
    "name": "ต่อเมล (เมลลูกค้า) 180 วัน",
    "price": 310,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-89",
    "name": "ต่อเมล (เมลลูกค้า) 365 วัน",
    "price": 500,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-90",
    "name": "รายบุคคล 30 วัน (เมลร้าน / ไม่ต่อเมล)",
    "price": 35,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-91",
    "name": "รายบุคคล 30 วัน (เมลลูกค้า / ต่อเมล)",
    "price": 95,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-92",
    "name": "รายบุคคล 30 วัน (เมลร้าน / ต่อเมล)",
    "price": 105,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  },
  {
    "externalId": "preemoji2-93",
    "name": "รายบุคคล 365 วัน (เมลลูกค้า / ต่อเมล)",
    "price": 905,
    "stock": 999,
    "url": "https://preemoji.v2",
    "category": "YouTube Premium",
    "tags": "YouTube Premium"
  }
]; }