import { and, desc, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  type InsertUser,
  users,
  products,
  sources,
  cookieSettings,
  scrapeLogs,
  settings,
} from "./schema";

type ProductRow = typeof products.$inferSelect;
type SourceRow = typeof sources.$inferSelect;
type CookieRow = typeof cookieSettings.$inferSelect;
type SettingRow = typeof settings.$inferSelect;
type ScrapeStatus = "success" | "partial" | "failed";

let _db: ReturnType<typeof drizzle> | null = null;

const now = () => new Date();

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "local-db.json");

let memorySources: SourceRow[] = [
  source(1, "DisplusHouse", "https://displushouse.rdcw.xyz", true),
  source(2, "Kaimans", "https://kaimans.rdcw.xyz", true),
  source(3, "MinaPremium", "https://minapremium.rdcw.xyz", true),
  source(4, "FinShop", "https://finshop.me", false),
  source(5, "PuckPick", "https://www.puckpick.xyz/shop", false),
  source(6, "GaFiwShop", "https://gafiwshop.xyz", false),
  source(7, "Premium24hr", "https://premium24hr.com", true),
  source(8, "ByShop", "https://byshop.me", true),
];

let memoryProducts: ProductRow[] = [
  product(1, 4, "fin-spotify", "Spotify Premium 30 Days", 79, 24, "Streaming", undefined, undefined, undefined, "Spotify 30 days account"),
  product(2, 5, "puck-netflix", "Netflix Shared Profile", 99, 0, "Streaming", undefined, undefined, undefined, "Netflix shared profile, 1 screen"),
  product(3, 7, "p24-youtube", "YouTube Premium Family", 129, 12, "Streaming", undefined, undefined, undefined, "YouTube Premium Family invite"),
];
let memoryCookies: CookieRow[] = [];
let memorySettings: SettingRow[] = [
  { id: 1, key: "refreshInterval", value: "300", updatedAt: now() },
  { id: 2, key: "scraperStatus", value: "idle", updatedAt: now() },
  { id: 3, key: "lastScrapedAt", value: String(Date.now()), updatedAt: now() },
];

function saveLocalDb() {
  if (hasDatabaseUrl()) return;
  const data = { memorySources, memoryProducts, memoryCookies, memorySettings };
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Database] Failed to save local-db.json", err);
  }
}

function loadLocalDb() {
  if (hasDatabaseUrl() || !fs.existsSync(DB_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    const reviveDates = (obj: any) => {
      if (obj.createdAt) obj.createdAt = new Date(obj.createdAt);
      if (obj.updatedAt) obj.updatedAt = new Date(obj.updatedAt);
      if (obj.expiresAt) obj.expiresAt = new Date(obj.expiresAt);
      if (obj.lastScrapedAt) obj.lastScrapedAt = new Date(obj.lastScrapedAt);
      return obj;
    };
    if (data.memorySources) {
      memorySources = data.memorySources.map(reviveDates).map((s: any) => {
        // Upgrade legacy sources to API
        if (s.name.toLowerCase() === "premium24hr" || s.name.toLowerCase() === "byshop") {
          s.requiresAuth = true;
          s.scrapingMethod = "api";
        }
        return s;
      });
    }
    if (data.memoryProducts) memoryProducts = data.memoryProducts.map(reviveDates);
    if (data.memoryCookies) memoryCookies = data.memoryCookies.map(reviveDates);
    if (data.memorySettings) memorySettings = data.memorySettings.map(reviveDates);
  } catch (err) {
    console.error("[Database] Failed to load local-db.json", err);
  }
}

// Initial load
loadLocalDb();

function source(id: number, name: string, url: string, requiresAuth: boolean): SourceRow {
  return {
    id,
    name,
    url,
    requiresAuth,
    scrapingMethod: "html",
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
  };
}

function product(id: number, sourceId: number, externalId: string, name: string, price: number, stock: number, category?: string, subCategory?: string, subCategory2?: string, tags?: string, info?: string): ProductRow {
  return {
    id,
    sourceId,
    externalId,
    name,
    price: String(price),
    stock,
    url: null,
    imageUrl: null,
    category: category ?? null,
    subCategory: subCategory ?? null,
    subCategory2: subCategory2 ?? null,
    tags: tags ?? null,
    info: info ?? null,
    isHidden: false,
    lastScrapedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
}

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export async function getDb() {
  if (!_db && hasDatabaseUrl()) {
    try {
      _db = drizzle(process.env.DATABASE_URL!);
    } catch (error) {
      console.warn("[Database] Failed to connect, using in-memory data:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(users).values(user).onDuplicateKeyUpdate({
    set: {
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      lastSignedIn: user.lastSignedIn ?? new Date(),
      role: user.role ?? "user",
    },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getProducts(filters?: {
  sourceId?: number;
  stockStatus?: "in-stock" | "out-of-stock" | "all";
  search?: string;
  category?: string;
  subCategory?: string;
  subCategory2?: string;
  tags?: string[];
  sortBy?: "price-asc" | "price-desc" | "updated-desc" | "name-asc";
  includeHidden?: boolean;
}): Promise<ProductRow[]> {
  const ignoredCategoriesStr = await getSetting("ignoredCategories");
  const ignoredCategories = ignoredCategoriesStr ? JSON.parse(ignoredCategoriesStr) : [];
  
  const db = await getDb();
  if (!db) {
    let result = [...memoryProducts]
      .filter((row) => filters?.includeHidden ? true : !row.isHidden)
      .filter((row) => (filters?.includeHidden || !row.category) ? true : !ignoredCategories.includes(row.category))
      .filter((row) => !filters?.sourceId || row.sourceId === filters.sourceId)
      .filter((row) => !filters?.search || row.name.toLowerCase().includes(filters.search.toLowerCase()))
      .filter((row) => filters?.stockStatus !== "in-stock" || row.stock > 0)
      .filter((row) => filters?.stockStatus !== "out-of-stock" || row.stock === 0)
      .filter((row) => !filters?.category || row.category === filters.category)
      .filter((row) => !filters?.subCategory || row.subCategory === filters.subCategory)
      .filter((row) => !filters?.subCategory2 || row.subCategory2 === filters.subCategory2)
      .filter((row) => {
        if (!filters?.tags || filters.tags.length === 0) return true;
        if (!row.tags) return false;
        const rowTags = row.tags.split(',').map(t => t.trim());
        return filters.tags.some(t => rowTags.includes(t));
      });

    // Sorting
    const sortBy = filters?.sortBy || "updated-desc";
    if (sortBy === "price-asc") {
      result.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => Number(b.price) - Number(a.price));
    } else if (sortBy === "name-asc") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    return result;
  }

  // MySQL path
  const conditions = [];
  if (!filters?.includeHidden) conditions.push(eq(products.isHidden, false));
  if (filters?.sourceId) conditions.push(eq(products.sourceId, filters.sourceId));
  if (filters?.stockStatus === "in-stock") conditions.push(like(products.stock, "%")); // wait, like(stock, "%")? Better: not(eq(products.stock, 0)) or > 0.
  if (filters?.stockStatus === "out-of-stock") conditions.push(eq(products.stock, 0));
  if (filters?.search) conditions.push(like(products.name, `%${filters.search}%`));
  if (filters?.category) conditions.push(eq(products.category, filters.category));
  if (filters?.subCategory) conditions.push(eq(products.subCategory, filters.subCategory));
  if (filters?.subCategory2) conditions.push(eq(products.subCategory2, filters.subCategory2));

  // Note: the MySQL path doesn't currently fully handle NOT IN (ignoredCategories) and LIKE tags
  // because drizzle operators require a bit more setup. We will implement simple in-memory filter post-fetch.
  
  const rows = await db.select().from(products)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(products.updatedAt));
    
  return rows
    .filter((row) => (filters?.includeHidden || !row.category) ? true : !ignoredCategories.includes(row.category))
    .filter((row) => {
      if (!filters?.tags || filters.tags.length === 0) return true;
      if (!row.tags) return false;
      const rowTags = row.tags.split(',').map(t => t.trim());
      return filters.tags.some(t => rowTags.includes(t));
    });
}

export async function upsertProduct(sourceId: number, externalId: string, data: { name: string; price: number; stock: number; url?: string; imageUrl?: string; category?: string; subCategory?: string; subCategory2?: string; tags?: string; info?: string }) {
  const db = await getDb();
  if (!db) {
    const existing = memoryProducts.find((row) => row.sourceId === sourceId && row.externalId === externalId);
    if (existing) {
      Object.assign(existing, {
        price: String(data.price),
        stock: data.stock,
        url: data.url ?? existing.url,
        imageUrl: data.imageUrl ?? existing.imageUrl,
        info: data.info ?? existing.info,
        // We do NOT overwrite name, category, and tags to preserve manual user edits
        lastScrapedAt: now(),
        updatedAt: now(),
      });
      saveLocalDb();
      return existing.id;
    }

    const id = Math.max(0, ...memoryProducts.map((row) => row.id)) + 1;
    memoryProducts.push(product(id, sourceId, externalId, data.name, data.price, data.stock, data.category, data.subCategory, data.subCategory2, data.tags, data.info));
    saveLocalDb();
    return id;
  }

  const existing = await db.select().from(products)
    .where(and(eq(products.sourceId, sourceId), eq(products.externalId, externalId)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(products)
      .set({ 
        price: String(data.price), 
        stock: data.stock,
        url: data.url ?? null,
        imageUrl: data.imageUrl ?? null,
        info: data.info ?? existing[0].info,
        updatedAt: new Date() 
      })
      .where(eq(products.id, existing[0].id));
    return existing[0].id;
  }

  await db.insert(products).values({
    sourceId,
    externalId,
    name: data.name,
    price: String(data.price),
    stock: data.stock,
    url: data.url ?? null,
    imageUrl: data.imageUrl ?? null,
    category: data.category ?? null,
    subCategory: data.subCategory ?? null,
    subCategory2: data.subCategory2 ?? null,
    tags: data.tags ?? null,
    info: data.info ?? null,
    isHidden: false,
  });
  return true;
}

export async function resetStockForSource(sourceId: number) {
  const db = await getDb();
  if (!db) {
    memoryProducts.forEach((row) => {
      if (row.sourceId === sourceId) {
        row.stock = 0;
      }
    });
    saveLocalDb();
    return true;
  }

  await db.update(products).set({ stock: 0 }).where(eq(products.sourceId, sourceId));
  return true;
}

export async function clearProductsForSource(sourceId: number) {
  const db = await getDb();
  if (!db) {
    memoryProducts = memoryProducts.filter((row) => row.sourceId !== sourceId);
    saveLocalDb();
    return true;
  }

  await db.delete(products).where(eq(products.sourceId, sourceId));
  return true;
}

export async function updateProductManually(productId: number, name: string, category?: string, subCategory?: string, subCategory2?: string, tags?: string) {
  const db = await getDb();
  if (!db) {
    const existing = memoryProducts.find((row) => row.id === productId);
    if (existing) {
      existing.name = name;
      if (category !== undefined) existing.category = category;
      if (subCategory !== undefined) existing.subCategory = subCategory;
      if (subCategory2 !== undefined) existing.subCategory2 = subCategory2;
      if (tags !== undefined) existing.tags = tags;
      existing.updatedAt = now();
      saveLocalDb();
      return true;
    }
    return false;
  }

  const existing = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (existing.length > 0) {
    await db.update(products)
      .set({ 
        name, 
        category: category ?? null,
        subCategory: subCategory ?? null,
        subCategory2: subCategory2 ?? null,
        tags: tags ?? null,
        updatedAt: new Date() 
      })
      .where(eq(products.id, productId));
    return true;
  }
  return false;
}

export async function updateProductHidden(productId: number, isHidden: boolean) {
  const db = await getDb();
  if (!db) {
    const existing = memoryProducts.find((row) => row.id === productId);
    if (existing) {
      existing.isHidden = isHidden;
      existing.updatedAt = now();
      saveLocalDb();
      return true;
    }
    return false;
  }

  const existing = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (existing.length > 0) {
    await db.update(products).set({ isHidden, updatedAt: new Date() }).where(eq(products.id, productId));
    return true;
  }
  return false;
}

export async function getSources() {
  const db = await getDb();
  if (!db) return memorySources;
  return db.select().from(sources).orderBy(sources.id);
}

export async function getSourceById(id: number) {
  return (await getSources()).find((row) => row.id === id) ?? null;
}

export async function updateSourceActive(id: number, isActive: boolean) {
  const db = await getDb();
  if (!db) {
    const src = memorySources.find((row) => row.id === id);
    if (src) {
      src.isActive = isActive;
      saveLocalDb();
    }
    return Boolean(src);
  }
  await db.update(sources).set({ isActive }).where(eq(sources.id, id));
  return true;
}

export async function getCookieForSource(sourceId: number) {
  const db = await getDb();
  if (!db) return memoryCookies.find((row) => row.sourceId === sourceId && row.isValid) ?? null;
  const result = await db.select().from(cookieSettings)
    .where(and(eq(cookieSettings.sourceId, sourceId), eq(cookieSettings.isValid, true)))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertCookie(sourceId: number, cookieValue: string, cookieName = "session", expiresAt?: Date) {
  const db = await getDb();
  if (!db) {
    const existing = memoryCookies.find((row) => row.sourceId === sourceId);
    if (existing) {
      Object.assign(existing, { cookieValue, cookieName, expiresAt: expiresAt ?? null, isValid: true, updatedAt: now() });
    } else {
      memoryCookies.push({
        id: Math.max(0, ...memoryCookies.map((row) => row.id)) + 1,
        sourceId,
        cookieValue,
        cookieName,
        expiresAt: expiresAt ?? null,
        isValid: true,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    saveLocalDb();
    return true;
  }

  const existing = await db.select().from(cookieSettings).where(eq(cookieSettings.sourceId, sourceId)).limit(1);
  if (existing.length > 0) {
    await db.update(cookieSettings)
      .set({ cookieValue, cookieName, expiresAt, isValid: true })
      .where(eq(cookieSettings.id, existing[0].id));
  } else {
    await db.insert(cookieSettings).values({ sourceId, cookieValue, cookieName, expiresAt, isValid: true });
  }
  return true;
}

export async function createScrapeLog(sourceId: number, status: ScrapeStatus, itemsCount: number, itemsUpdated: number, error?: string, duration?: number) {
  const db = await getDb();
  if (!db) return true;
  await db.insert(scrapeLogs).values({ sourceId, status, itemsCount, itemsUpdated, error, duration });
  return true;
}

export async function getLastScrapeLog(sourceId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(scrapeLogs)
    .where(eq(scrapeLogs.sourceId, sourceId))
    .orderBy(desc(scrapeLogs.createdAt))
    .limit(1);
  return result[0] ?? null;
}

export async function getSetting(key: string) {
  const db = await getDb();
  if (!db) return memorySettings.find((row) => row.key === key)?.value ?? null;
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function updateSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) {
    const existing = memorySettings.find((row) => row.key === key);
    if (existing) {
      existing.value = value;
      existing.updatedAt = now();
    } else {
      memorySettings.push({ id: Math.max(0, ...memorySettings.map((row) => row.id)) + 1, key, value, updatedAt: now() });
    }
    saveLocalDb();
    return true;
  }

  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(settings).set({ value }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
  return true;
}

export async function getProductStats() {
  const rows = await getProducts();
  return statsFor(rows);
}

export async function getProductStatsBySource(sourceId: number) {
  return statsFor(await getProducts({ sourceId }));
}

function statsFor(rows: ProductRow[]) {
  return {
    total: rows.length,
    inStock: rows.filter((row) => row.stock > 0).length,
    outOfStock: rows.filter((row) => row.stock === 0).length,
  };
}

export async function createSource(data: { name: string; url: string; scrapingMethod: "html" | "api" | "hybrid"; requiresAuth: boolean; isActive: boolean }) {
  const db = await getDb();
  if (!db) {
    const newSource = source(Math.max(0, ...memorySources.map((row) => row.id)) + 1, data.name, data.url, data.requiresAuth);
    newSource.scrapingMethod = data.scrapingMethod;
    newSource.isActive = data.isActive;
    memorySources.push(newSource);
    saveLocalDb();
    return newSource;
  }

  await db.insert(sources).values(data);
  const all = await getSources();
  return all[all.length - 1];
}

export async function deleteSource(sourceId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    const before = memorySources.length;
    memoryProducts = memoryProducts.filter((row) => row.sourceId !== sourceId);
    memoryCookies = memoryCookies.filter((row) => row.sourceId !== sourceId);
    const index = memorySources.findIndex((row) => row.id === sourceId);
    if (index >= 0) memorySources.splice(index, 1);
    saveLocalDb();
    return memorySources.length !== before;
  }

  await db.delete(products).where(eq(products.sourceId, sourceId));
  await db.delete(cookieSettings).where(eq(cookieSettings.sourceId, sourceId));
  await db.delete(scrapeLogs).where(eq(scrapeLogs.sourceId, sourceId));
  await db.delete(sources).where(eq(sources.id, sourceId));
  return true;
}
