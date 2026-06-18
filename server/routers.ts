import { z } from "zod";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { getProducts, getSources, getProductStats, getProductStatsBySource, getCookieForSource, upsertCookie, getSetting, updateSetting, createSource, deleteSource, updateProductManually, updateProductHidden } from "./db";
import { runAllScrapers, runScraper } from "./scraper";

export const appRouter = router({
  // ============ Products ============
  products: router({
    list: publicProcedure
      .input(
        z.object({
          sourceId: z.number().optional(),
          stockStatus: z.enum(["in-stock", "out-of-stock", "all"]).optional(),
          search: z.string().optional(),
          category: z.string().optional(),
          subCategory: z.string().optional(),
          subCategory2: z.string().optional(),
          subCategory3: z.string().optional(),
          sortBy: z.enum(["price-asc", "price-desc", "updated-desc", "name-asc"]).optional(),
          includeHidden: z.boolean().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        const dbInput = {
          ...input,
          tags: input?.subCategory3 ? [input.subCategory3] : undefined,
        };
        const products = await getProducts(dbInput);
        return products;
      }),

    search: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        const products = await getProducts({ search: input.query });
        return products;
      }),

    categories: publicProcedure
      .input(z.object({ includeHidden: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        const allProducts = await getProducts({ includeHidden: input?.includeHidden });
        const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))] as string[];
        return categories.sort();
      }),

    subCategories: publicProcedure
      .input(z.object({ category: z.string().optional(), includeHidden: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        const allProducts = await getProducts({ category: input?.category, includeHidden: input?.includeHidden });
        const subCategories = [...new Set(allProducts.map(p => p.subCategory).filter(Boolean))] as string[];
        return subCategories.sort();
      }),

    subCategory2s: publicProcedure
      .input(z.object({ category: z.string().optional(), subCategory: z.string().optional(), includeHidden: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        const allProducts = await getProducts({ category: input?.category, subCategory: input?.subCategory, includeHidden: input?.includeHidden });
        const subCategory2s = [...new Set(allProducts.map(p => p.subCategory2).filter(Boolean))] as string[];
        return subCategory2s.sort();
      }),

    subCategory3s: publicProcedure
      .input(z.object({ category: z.string().optional(), includeHidden: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        const allProducts = await getProducts({ category: input?.category, includeHidden: input?.includeHidden });
        // Assume tags stores the subCategory3 value
        const subCategory3s = [...new Set(allProducts.map(p => p.tags).filter(Boolean))] as string[];
        return subCategory3s.sort();
      }),

    setCategoryHidden: protectedProcedure
      .input(z.object({ category: z.string(), isHidden: z.boolean() }))
      .mutation(async ({ input }) => {
        const ignoredStr = await getSetting("ignoredCategories");
        let ignored: string[] = ignoredStr ? JSON.parse(ignoredStr) : [];
        if (input.isHidden) {
          if (!ignored.includes(input.category)) ignored.push(input.category);
        } else {
          ignored = ignored.filter(c => c !== input.category);
        }
        await updateSetting("ignoredCategories", JSON.stringify(ignored));
        return { success: true };
      }),

    getHiddenCategories: protectedProcedure.query(async () => {
      const ignoredStr = await getSetting("ignoredCategories");
      return ignoredStr ? JSON.parse(ignoredStr) as string[] : [];
    }),

    getManagedLists: publicProcedure.query(async () => {
      const catStr = await getSetting("managedCategories");
      const typeStr = await getSetting("managedTypes");
      const qualStr = await getSetting("managedQualities");
      const sub3Str = await getSetting("managedSubCategory3s");
      return {
        categories: catStr ? JSON.parse(catStr) as string[] : ["Netflix", "Spotify", "YouTube", "HBO GO", "Disney+", "Prime Video", "Viu", "Bilibili", "iQIYI", "WeTV"],
        types: typeStr ? JSON.parse(typeStr) as string[] : ["หาร 2", "หาร 3", "หาร 4", "หาร 5", "ส่วนตัว", "จอแชร์", "Family", "ต่อเมล"],
        qualities: qualStr ? JSON.parse(qualStr) as string[] : ["4K", "1080P", "UHD", "HD", "Full HD", "1 วัน", "7 วัน", "30 วัน"],
        subCategory3s: sub3Str ? JSON.parse(sub3Str) as string[] : ["TV", "มือถือ"],
      };
    }),

    saveManagedList: protectedProcedure
      .input(z.object({
        listName: z.enum(["managedCategories", "managedTypes", "managedQualities", "managedSubCategory3s"]),
        items: z.array(z.string())
      }))
      .mutation(async ({ input }) => {
        await updateSetting(input.listName, JSON.stringify(input.items));
        return { success: true };
      }),

    setHidden: protectedProcedure
      .input(z.object({
        productId: z.number(),
        isHidden: z.boolean()
      }))
      .mutation(async ({ input }) => {
        await updateProductHidden(input.productId, input.isHidden);
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        productId: z.number(),
        name: z.string().min(1),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        subCategory2: z.string().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const success = await updateProductManually(input.productId, input.name, input.category, input.subCategory, input.subCategory2, input.tags);
        return { success };
      }),

    stats: publicProcedure.query(async () => {
      return getProductStats();
    }),

    statsBySource: publicProcedure
      .input(z.object({ sourceId: z.number() }))
      .query(async ({ input }) => {
        return getProductStatsBySource(input.sourceId);
      }),
  }),

  // ============ Sources ============
  sources: router({
    list: publicProcedure.query(async () => {
      const sources = await getSources();
      return Promise.all(
        sources.map(async (s) => {
          const cookie = await getCookieForSource(s.id);
          return {
            ...s,
            hasCookie: !!cookie,
            cookie: cookie ? cookie.cookieValue : undefined,
          };
        })
      );
    }),

    getWithStats: publicProcedure.query(async () => {
      const sources = await getSources();
      const withStats = await Promise.all(
        sources.map(async (s) => ({
          ...s,
          stats: await getProductStatsBySource(s.id),
        }))
      );
      return withStats;
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          url: z.string().url(),
          requiresAuth: z.boolean().default(false),
          scrapingMethod: z.enum(["html", "api", "hybrid"]).default("html"),
        })
      )
      .mutation(async ({ input }) => {
        const source = await createSource({
          name: input.name,
          url: input.url,
          requiresAuth: input.requiresAuth,
          scrapingMethod: input.scrapingMethod,
          isActive: true,
        });
        return source;
      }),

    delete: protectedProcedure
      .input(z.object({ sourceId: z.number() }))
      .mutation(async ({ input }) => {
        const success = await deleteSource(input.sourceId);
        return { success };
      }),
  }),

  // ============ Settings ============
  settings: router({
    getCookie: protectedProcedure
      .input(z.object({ sourceId: z.number() }))
      .query(async ({ input }) => {
        const cookie = await getCookieForSource(input.sourceId);
        return {
          hasCookie: !!cookie,
          expiresAt: cookie?.expiresAt,
        };
      }),

    updateCookie: protectedProcedure
      .input(
        z.object({
          sourceId: z.number(),
          cookieValue: z.string(),
          cookieName: z.string().default("session"),
        })
      )
      .mutation(async ({ input }) => {
        const success = await upsertCookie(
          input.sourceId,
          input.cookieValue,
          input.cookieName
        );
        return { success };
      }),

    getRefreshInterval: publicProcedure.query(async () => {
      const interval = await getSetting("refreshInterval");
      return { interval: parseInt(interval || "300", 10) };
    }),

    updateRefreshInterval: protectedProcedure
      .input(z.object({ interval: z.number().min(60).max(3600) }))
      .mutation(async ({ input }) => {
        const success = await updateSetting("refreshInterval", String(input.interval));
        return { success };
      }),

    getLastScrapedAt: publicProcedure.query(async () => {
      const timestamp = await getSetting("lastScrapedAt");
      return { timestamp: parseInt(timestamp || "0", 10) };
    }),

    getScraperStatus: publicProcedure.query(async () => {
      const status = await getSetting("scraperStatus");
      return { status: status || "idle" };
    }),
  }),

  // ============ Scraper ============
  scraper: router({
    runNow: publicProcedure.mutation(async () => {
      try {
        const sources = await getSources();
        const sourceList = sources
          .filter(s => s.isActive)
          .map(s => ({ id: s.id, name: s.name }));

        // Update status to running
        await updateSetting("scraperStatus", "running");

        // Run scraper
        const results = await runAllScrapers(sourceList);

        // Update last scraped time
        await updateSetting("lastScrapedAt", String(Date.now()));

        // Update status to idle
        await updateSetting("scraperStatus", "idle");

        return {
          success: true,
          results,
          timestamp: Date.now(),
        };
      } catch (error: any) {
        await updateSetting("scraperStatus", "idle");
        return {
          success: false,
          error: error.message,
        };
      }
    }),

    runForSource: publicProcedure
      .input(z.object({ sourceId: z.number() }))
      .mutation(async ({ input }) => {
        try {
          const source = (await getSources()).find(s => s.id === input.sourceId);
          if (!source) {
            throw new Error("Source not found");
          }

          const result = await runScraper(source.id, source.name);
          await updateSetting("lastScrapedAt", String(Date.now()));

          return {
            success: result.success,
            result,
            timestamp: Date.now(),
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      }),

    getStatus: publicProcedure.query(async () => {
      const status = await getSetting("scraperStatus");
      const lastScraped = await getSetting("lastScrapedAt");
      return {
        status: status || "idle",
        lastScrapedAt: parseInt(lastScraped || "0", 10),
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
