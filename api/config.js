export default function handler(req, res) {
  const gemini = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  res.json({
    GEMINI_API_KEY:     gemini,
    TRANSCRIPT_API_KEY: gemini,
    JSON_API_KEY:       gemini,
    OPENAI_API_KEY:     process.env.OPENAI_API_KEY  || "",
    SARVAM_API_KEY:     process.env.SARVAM_API_KEY  || "",
  });
}
