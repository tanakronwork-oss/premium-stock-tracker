import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { getDb, upsertProduct, getSources, updateSetting } from "./db";

describe("Stock Tracker API", () => {
  beforeAll(async () => {
    // Initialize database
    const db = await getDb();
    if (!db) {
      console.warn("Database not available for tests");
    }
  });

  describe("Products API", () => {
    it("should list products", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const products = await caller.products.list({});
      expect(Array.isArray(products)).toBe(true);
    });

    it("should search products", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const products = await caller.products.search({ query: "test" });
      expect(Array.isArray(products)).toBe(true);
    });

    it("should get product stats", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const stats = await caller.products.stats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("inStock");
      expect(stats).toHaveProperty("outOfStock");
    });
  });

  describe("Sources API", () => {
    it("should list sources", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const sources = await caller.sources.list();
      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it("should get sources with stats", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const sources = await caller.sources.getWithStats();
      expect(Array.isArray(sources)).toBe(true);
      sources.forEach((source) => {
        expect(source).toHaveProperty("stats");
        expect(source.stats).toHaveProperty("total");
      });
    });
  });

  describe("Settings API", () => {
    it("should get refresh interval", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.settings.getRefreshInterval();
      expect(result).toHaveProperty("interval");
      expect(typeof result.interval).toBe("number");
    });

    it("should get scraper status", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.settings.getScraperStatus();
      expect(result).toHaveProperty("status");
    });
  });

  describe("Scraper API", () => {
    it("should get scraper status", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.scraper.getStatus();
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("lastScrapedAt");
    });
  });
});
