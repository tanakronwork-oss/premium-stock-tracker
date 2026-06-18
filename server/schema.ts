import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Sources table: Stores information about each e-commerce source
 */
export const sources = mysqlTable("sources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  scrapingMethod: mysqlEnum("scrapingMethod", ["html", "api", "hybrid"]).default("html").notNull(),
  requiresAuth: boolean("requiresAuth").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Source = typeof sources.$inferSelect;
export type InsertSource = typeof sources.$inferInsert;

/**
 * Products table: Stores product information from all sources
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull(),
  externalId: varchar("externalId", { length: 255 }).notNull(),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  stock: int("stock").notNull().default(0),
  url: varchar("url", { length: 500 }),
  imageUrl: varchar("imageUrl", { length: 500 }),
  info: text("info"),
  category: varchar("category", { length: 100 }),
  subCategory: varchar("sub_category", { length: 100 }),
  subCategory2: varchar("sub_category_2", { length: 100 }),
  tags: varchar("tags", { length: 255 }),
  isHidden: boolean("isHidden").default(false).notNull(),
  lastScrapedAt: timestamp("lastScrapedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Cookie Settings table: Stores authentication cookies for sources that require login
 */
export const cookieSettings = mysqlTable("cookieSettings", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull(),
  cookieValue: text("cookieValue").notNull(),
  cookieName: varchar("cookieName", { length: 255 }).default("session").notNull(),
  expiresAt: timestamp("expiresAt"),
  isValid: boolean("isValid").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CookieSetting = typeof cookieSettings.$inferSelect;
export type InsertCookieSetting = typeof cookieSettings.$inferInsert;

/**
 * Scrape Logs table: Tracks scraping activities and errors
 */
export const scrapeLogs = mysqlTable("scrapeLogs", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull(),
  status: mysqlEnum("status", ["success", "partial", "failed"]).notNull(),
  itemsCount: int("itemsCount").default(0),
  itemsUpdated: int("itemsUpdated").default(0),
  error: text("error"),
  duration: int("duration"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScrapeLog = typeof scrapeLogs.$inferSelect;
export type InsertScrapeLog = typeof scrapeLogs.$inferInsert;

/**
 * Settings table: Stores app-wide settings
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;