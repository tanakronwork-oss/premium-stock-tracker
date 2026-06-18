import { getSources } from "./db";
import { runAllScrapers } from "./scraper";
import { closeBrowser } from "./scraper-browser";

async function run() {
  console.log("[Cron Scraper] Fetching active sources...");
  const sources = await getSources();
  const activeSources = sources
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, name: s.name }));

  console.log(`[Cron Scraper] Found ${activeSources.length} active sources to scrape: ${activeSources.map(s => s.name).join(", ")}`);
  
  if (activeSources.length === 0) {
    console.log("[Cron Scraper] No active sources found. Exiting.");
    process.exit(0);
  }

  const results = await runAllScrapers(activeSources);
  console.log("[Cron Scraper] Completed! Results:", JSON.stringify(results, null, 2));
  
  // Make sure to close Puppeteer browser if it was opened
  await closeBrowser();
  process.exit(0);
}

run().catch((err) => {
  console.error("[Cron Scraper] Scraping process failed:", err);
  process.exit(1);
});
