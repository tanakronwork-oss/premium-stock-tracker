import cors from "cors";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import path from "path";

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3001);

app.use(cors({ origin: "*" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => ({ req, res, user: null }),
  }),
);

// Serve static assets if the dist folder exists (e.g. after npm run build)
import fs from "fs";
const distPath = path.join(process.cwd(), "dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  
  // Fallback to React app router for HTML5 History API (client-side routing)
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      next();
    }
  });
} else {
  app.get("/", (req, res) => {
    res.send("Frontend is not built. Please run 'npm run build' first or use 'npm run dev:full' for development.");
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`API server listening at http://0.0.0.0:${port}`);
});
