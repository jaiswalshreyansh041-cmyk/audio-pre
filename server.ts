import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Single endpoint — all API keys served from .env
  app.get("/api/config", (_req, res) => {
    const gemini = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    res.json({
      // Gemini (SunLiya.AI + Evaluator)
      GEMINI_API_KEY:    gemini,
      TRANSCRIPT_API_KEY: gemini,   // SunLiya.AI transcript calls
      JSON_API_KEY:       gemini,   // SunLiya.AI analysis calls
      // OpenAI — Whisper + GPT-4o
      OPENAI_API_KEY:    process.env.OPENAI_API_KEY  || "",
      // Sarvam AI
      SARVAM_API_KEY:    process.env.SARVAM_API_KEY  || "",
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
