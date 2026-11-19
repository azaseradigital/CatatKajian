import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum tersedia di server. Silakan periksa panel Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const obj = err as { message?: unknown; error?: { message?: unknown } };
    if (typeof obj.message === "string") return obj.message;
    if (obj.error && typeof obj.error.message === "string") {
      return obj.error.message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = extractErrorMessage(err);
  if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
    return {
      status: 403,
      message:
        "Akses Gemini API ditolak. Periksa kembali GEMINI_API_KEY di panel Settings > Secrets.",
    };
  }
  if (msg.includes("400") || msg.includes("API_KEY_INVALID")) {
    return {
      status: 400,
      message:
        "Permintaan atau API key tidak valid. Periksa GEMINI_API_KEY di panel Settings > Secrets.",
    };
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message:
        "Kuota permintaan Gemini API sedang penuh. Tunggu beberapa saat lalu coba lagi.",
    };
  }
  if (msg.includes("404") || msg.includes("NOT_FOUND")) {
    return {
      status: 404,
      message: "Model AI tidak ditemukan atau belum didukung pada wilayah ini.",
    };
  }
  return {
    status: 500,
    message: msg || "Terjadi kesalahan pada layanan AI server.",
  };
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = extractErrorMessage(err);
      const isTransient =
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("ECONNRESET");
      if (!isTransient || i === retries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "30mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Audio transcription endpoint with fallback across supported Gemini audio models
  app.post("/api/kajian/transcribe-file", async (req, res) => {
    try {
      const { audioBase64, mimeType, language } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        language?: string;
      };

      if (!audioBase64 || !mimeType) {
        res.status(400).json({
          error: "Data audio dan tipe MIME wajib disertakan.",
        });
        return;
      }

      const ai = getAiClient();
      const langHint =
        language === "ar-SA"
          ? "Fokus pada bahasa Arab."
          : language === "en-US"
          ? "Fokus pada bahasa Inggris."
          : "Utamakan bahasa Indonesia dan pertahankan istilah bahasa Arab, nama surah, ayat, atau perawi hadits dengan penulisan yang jelas.";

      const audioPart = {
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      };
      const promptText = `Transkripsikan ucapan pada audio kajian Islam ini secara akurat kata demi kata. ${langHint} Jangan tambahkan sapaan, komentar, atau kalimat pembuka/penutup. Jika audio hening atau tidak ada ucapan yang terdengar, kembalikan string kosong.`;

      const modelsToTry = [
        "gemini-3.5-transcribe",
        "gemini-3.1-flash-lite",
        "gemini-4-hydrogen",
      ];

      let lastErr: unknown;
      for (const model of modelsToTry) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model,
              contents: {
                parts: [audioPart, { text: promptText }],
              },
            })
          );
          res.json({
            transcript: (response.text ?? "").trim(),
            modelUsed: model,
          });
          return;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("404") ||
            msg.includes("NOT_FOUND") ||
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED");
          if (!shouldFallback) {
            throw err;
          }
        }
      }

      throw lastErr;
    } catch (err) {
      console.error("[transcribe-file]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Summarize kajian notes & transcript
  app.post("/api/kajian/summarize", async (req, res) => {
    try {
      const { title, speaker, location, transcript, notes } = req.body as {
        title?: string;
        speaker?: string;
        location?: string;
        transcript?: string;
        notes?: string;
      };

      const combinedSource = [
        title ? `Judul Kajian: ${title}` : "",
        speaker ? `Pemateri: ${speaker}` : "",
        location ? `Lokasi/Majelis: ${location}` : "",
        notes?.trim() ? `\n--- Catatan Pengguna ---\n${notes.trim()}` : "",
        transcript?.trim()
          ? `\n--- Transkrip Suara ---\n${transcript.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      if (!notes?.trim() && !transcript?.trim()) {
        res.status(400).json({
          error:
            "Belum ada catatan atau transkrip suara untuk diringkas. Rekam suara atau tulis catatan terlebih dahulu.",
        });
        return;
      }

      const ai = getAiClient();
      const requestConfig = {
        systemInstruction:
          "Anda adalah asisten pencatat kajian Islam yang teliti, beradab ilmiah, dan terstruktur. Tugas Anda meringkas transkrip suara dan catatan pengguna menjadi ringkasan kajian bahasa Indonesia yang jernih, akurat sesuai konteks yang disampaikan, dan mudah dipelajari ulang. Jangan mengarang dalil yang tidak ada dalam sumber; jika ada bagian lisan yang samar, rapikan bahasanya secara wajar.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ringkasanSingkat: {
              type: Type.STRING,
              description:
                "Ringkasan padat 2-4 kalimat mengenai tema utama dan pesan inti kajian.",
            },
            poinUtama: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                "Daftar 4-8 poin pembahasan penting secara berurutan.",
            },
            nasihatPraktis: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                "Daftar 3-5 langkah amal praktis atau hikmah yang dapat diamalkan sehari-hari.",
            },
            istilahKunci: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  istilah: { type: Type.STRING },
                  makna: { type: Type.STRING },
                },
                required: ["istilah", "makna"],
              },
              description:
                "Daftar istilah bahasa Arab, fiqih, atau konsep penting yang dibahas beserta penjelasan singkatnya.",
            },
            catatanRapih: {
              type: Type.STRING,
              description:
                "Naskah catatan kajian lengkap yang sudah dirapikan dalam format Markdown terstruktur.",
            },
          },
          required: [
            "ringkasanSingkat",
            "poinUtama",
            "nasihatPraktis",
            "istilahKunci",
            "catatanRapih",
          ],
        },
      };

      const candidates: Array<{
        model: string;
        thinkingLevel: ThinkingLevel;
      }> = [
        { model: "gemini-3.1-flash-lite", thinkingLevel: ThinkingLevel.MINIMAL },
        { model: "gemini-4-hydrogen", thinkingLevel: ThinkingLevel.LOW },
      ];

      let lastErr: unknown;
      for (const candidate of candidates) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model: candidate.model,
              contents: `Berikut adalah bahan catatan dan transkrip kajian. Tolong ringkas dan rapikan:\n\n${combinedSource}`,
              config: {
                ...requestConfig,
                thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
              },
            })
          );
          const rawJson = (response.text ?? "{}").trim();
          const parsed = JSON.parse(rawJson);
          res.json({
            ...parsed,
            generatedAt: new Date().toISOString(),
          });
          return;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("404") ||
            msg.includes("NOT_FOUND");
          if (!shouldFallback) {
            throw err;
          }
        }
      }

      throw lastErr;
    } catch (err) {
      console.error("[summarize]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Enrich & verify kajian notes online using Google Search grounding
  app.post("/api/kajian/enrich", async (req, res) => {
    try {
      const { title, speaker, transcript, notes, customQuery } = req.body as {
        title?: string;
        speaker?: string;
        transcript?: string;
        notes?: string;
        customQuery?: string;
      };

      if (!notes?.trim() && !transcript?.trim() && !customQuery?.trim()) {
        res.status(400).json({
          error:
            "Isi catatan, transkrip, atau tulis pertanyaan spesifik terlebih dahulu untuk dilengkapi secara online.",
        });
        return;
      }

      const contextText = [
        title ? `Judul Kajian: ${title}` : "",
        speaker ? `Pemateri: ${speaker}` : "",
        notes?.trim() ? `Catatan Saat Ini:\n${notes.trim()}` : "",
        transcript?.trim() ? `Transkrip Suara:\n${transcript.trim()}` : "",
        customQuery?.trim()
          ? `Fokus Permintaan Pengguna:\n${customQuery.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const ai = getAiClient();
      const systemInstruction =
        "Anda adalah peneliti literatur kajian Islam yang membantu jamaah melengkapi catatan kajian secara online. Gunakan pencarian untuk memverifikasi dan melengkapi:\n1. **Ayat Al-Qur'an Terkait**: Tuliskan teks Arab (jika terverifikasi), nama surat & nomor ayat yang tepat, serta terjemahan bahasa Indonesia.\n2. **Hadits & Dalil Pendukung**: Lengkapi matan ringkas atau terjemahan hadits yang disebut/relevan, sebutkan kitab perawi (misal: HR. Bukhari no. ..., HR. Muslim no. ...), dan status hadits bila tersedia.\n3. **Penjelasan Istilah, Kitab & Konteks Tambahan**: Lengkapi bagian transkrip yang kurang jelas atau terpotong, jelaskan istilah Arab/ulama/kitab yang disebut pemateri.\n4. **Jawaban Fokus Tambahan**: Jika pengguna menuliskan pertanyaan khusus, jawab dengan rujukan yang jelas.\n\nTulis dalam Markdown bahasa Indonesia yang bersih, akurat, dan tidak mengada-ada.";

      const attempts = [
        {
          model: "gemini-4-hydrogen",
          useSearch: true,
          thinkingLevel: ThinkingLevel.LOW,
        },
        {
          model: "gemini-3.1-flash-lite",
          useSearch: true,
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
        {
          model: "gemini-3.1-flash-lite",
          useSearch: false,
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      ];

      let lastErr: unknown;
      for (const attempt of attempts) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model: attempt.model,
              contents: `Lengkapi dan verifikasi catatan kajian berikut:\n\n${contextText}`,
              config: {
                ...(attempt.useSearch ? { tools: [{ googleSearch: {} }] } : {}),
                thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
                systemInstruction,
              },
            })
          );

          const chunks =
            response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          const seenUris = new Set<string>();
          const sources: Array<{ title: string; uri: string }> = [];

          for (const chunk of chunks) {
            const web = chunk.web;
            if (web?.uri && !seenUris.has(web.uri)) {
              seenUris.add(web.uri);
              sources.push({
                title: web.title || web.uri,
                uri: web.uri,
              });
            }
          }

          res.json({
            markdown: (response.text ?? "").trim(),
            sources,
            query: customQuery?.trim() || undefined,
            generatedAt: new Date().toISOString(),
          });
          return;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("404") ||
            msg.includes("NOT_FOUND");
          if (!shouldFallback) {
            throw err;
          }
        }
      }

      throw lastErr;
    } catch (err) {
      console.error("[enrich]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Extract & structure Kajian notes from social media links (YouTube, TikTok, Instagram, Facebook)
  function detectSocialPlatform(urlObj: URL): string {
    const host = urlObj.hostname.toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("tiktok.com")) return "TikTok";
    if (host.includes("instagram.com") || host.includes("instagr.am")) return "Instagram";
    if (host.includes("facebook.com") || host.includes("fb.watch") || host.includes("fb.com")) {
      return "Facebook";
    }
    return "Web";
  }

  function extractYouTubeVideoId(urlObj: URL): string | null {
    const host = urlObj.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      return urlObj.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (urlObj.searchParams.get("v")) {
      return urlObj.searchParams.get("v");
    }
    const pathMatch = urlObj.pathname.match(/\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{6,})/);
    return pathMatch?.[1] || null;
  }

  function decodeHtmlEntities(input: string): string {
    return input
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)));
  }

  function formatTimestampSeconds(sec: number): string {
    const mins = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  function extractMetaTag(html: string, propName: string): string {
    const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const r1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    );
    const r2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    );
    const match = html.match(r1) || html.match(r2);
    return match?.[1] ? decodeHtmlEntities(match[1]).trim() : "";
  }

  async function probeSocialLink(rawUrl: string): Promise<{
    platform: string;
    extractedTitle: string;
    extractedAuthor: string;
    extractedDescription: string;
    transcriptSegments: Array<{ timestamp: string; text: string }>;
  }> {
    const urlObj = new URL(rawUrl);
    const platform = detectSocialPlatform(urlObj);
    let extractedTitle = "";
    let extractedAuthor = "";
    let extractedDescription = "";
    const transcriptSegments: Array<{ timestamp: string; text: string }> = [];

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    try {
      if (platform === "YouTube") {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`,
          { signal: AbortSignal.timeout(4500) }
        ).catch(() => null);
        if (oembedRes?.ok) {
          const oe = (await oembedRes.json()) as {
            title?: string;
            author_name?: string;
          };
          extractedTitle = oe.title || "";
          extractedAuthor = oe.author_name || "";
        }

        const videoId = extractYouTubeVideoId(urlObj);
        if (videoId) {
          const watchRes = await fetch(
            `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
            { headers, signal: AbortSignal.timeout(5500) }
          ).catch(() => null);

          if (watchRes?.ok) {
            const html = await watchRes.text();
            if (!extractedTitle) {
              extractedTitle = extractMetaTag(html, "og:title");
            }
            extractedDescription = extractMetaTag(html, "og:description");

            // Attempt to extract public YouTube captionTracks
            const captionsMatch = html.match(
              /"captionTracks":(\[[\s\S]*?\])\s*,\s*"audioTracks"/
            ) || html.match(/"captionTracks":(\[[\s\S]*?\])/);

            if (captionsMatch?.[1]) {
              try {
                const tracks = JSON.parse(captionsMatch[1]) as Array<{
                  baseUrl?: string;
                  languageCode?: string;
                }>;
                const preferred =
                  tracks.find((t) => t.languageCode?.startsWith("id")) ||
                  tracks.find((t) => t.languageCode?.startsWith("en")) ||
                  tracks.find((t) => t.languageCode?.startsWith("ar")) ||
                  tracks[0];

                if (preferred?.baseUrl) {
                  const capRes = await fetch(preferred.baseUrl, {
                    headers,
                    signal: AbortSignal.timeout(5000),
                  }).catch(() => null);
                  if (capRes?.ok) {
                    const xml = await capRes.text();
                    const textMatches = Array.from(
                      xml.matchAll(/<text\s+start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)
                    );
                    let bucketStart = 0;
                    let bucketWords: string[] = [];

                    for (const m of textMatches) {
                      const startSec = Number(m[1]) || 0;
                      const clean = decodeHtmlEntities(
                        m[2].replace(/<[^>]+>/g, " ")
                      )
                        .replace(/\s+/g, " ")
                        .trim();
                      if (!clean) continue;

                      if (bucketWords.length === 0) {
                        bucketStart = startSec;
                      }
                      bucketWords.push(clean);

                      if (
                        bucketWords.join(" ").length >= 220 ||
                        startSec - bucketStart >= 35
                      ) {
                        transcriptSegments.push({
                          timestamp: formatTimestampSeconds(bucketStart),
                          text: bucketWords.join(" "),
                        });
                        bucketWords = [];
                      }
                    }

                    if (bucketWords.length > 0) {
                      transcriptSegments.push({
                        timestamp: formatTimestampSeconds(bucketStart),
                        text: bucketWords.join(" "),
                      });
                    }
                  }
                }
              } catch {
                // Ignore malformed caption JSON
              }
            }
          }
        }
      } else if (platform === "TikTok") {
        const oembedRes = await fetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`,
          { signal: AbortSignal.timeout(4500) }
        ).catch(() => null);
        if (oembedRes?.ok) {
          const oe = (await oembedRes.json()) as {
            title?: string;
            author_name?: string;
          };
          extractedTitle = oe.title || "";
          extractedAuthor = oe.author_name || "";
        }
      }

      if (!extractedTitle && !extractedDescription) {
        const pageRes = await fetch(rawUrl, {
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(4500),
        }).catch(() => null);
        if (pageRes?.ok) {
          const html = await pageRes.text();
          extractedTitle =
            extractMetaTag(html, "og:title") ||
            decodeHtmlEntities(
              html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""
            ).trim();
          extractedDescription =
            extractMetaTag(html, "og:description") ||
            extractMetaTag(html, "description");
        }
      }
    } catch {
      // Non-fatal probe failure; Gemini urlContext + googleSearch will still run
    }

    return {
      platform,
      extractedTitle,
      extractedAuthor,
      extractedDescription,
      transcriptSegments: transcriptSegments.slice(0, 120),
    };
  }

  app.post("/api/kajian/from-link", async (req, res) => {
    try {
      const { url, extraNotes } = req.body as {
        url?: string;
        extraNotes?: string;
      };

      const rawUrl = (url ?? "").trim();
      if (!rawUrl) {
        res.status(400).json({
          error: "Masukkan tautan kajian YouTube, TikTok, Instagram, atau Facebook.",
        });
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("Invalid protocol");
        }
      } catch {
        res.status(400).json({
          error: "Format tautan tidak valid. Pastikan diawali https:// atau http://.",
        });
        return;
      }

      const probe = await probeSocialLink(rawUrl);
      const transcriptJoined = probe.transcriptSegments
        .map((s) => `[${s.timestamp}] ${s.text}`)
        .join("\n")
        .slice(0, 24000);

      const promptParts = [
        `Platform: ${probe.platform}`,
        `Tautan Kajian: ${rawUrl}`,
        probe.extractedTitle ? `Judul Terdeteksi: ${probe.extractedTitle}` : "",
        probe.extractedAuthor ? `Akun/Pemateri Terdeteksi: ${probe.extractedAuthor}` : "",
        probe.extractedDescription
          ? `Deskripsi/Caption:\n${probe.extractedDescription}`
          : "",
        extraNotes?.trim()
          ? `Keterangan Tambahan Pengguna:\n${extraNotes.trim()}`
          : "",
        transcriptJoined
          ? `Transkrip Teks Video:\n${transcriptJoined}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const ai = getAiClient();
      const systemInstruction =
        "Anda adalah asisten pencatat kajian Islam yang mengubah konten tautan media sosial (YouTube, TikTok, Instagram, Facebook) menjadi catatan kajian terstruktur dalam bahasa Indonesia.\n\nAturan Penting:\n1. Gunakan alat urlContext dan googleSearch untuk membaca konteks tautan dan mencari informasi kajian yang akurat.\n2. JANGAN mengarang isi ceramah atau dalil jika halaman media sosial tertutup/login-walled dan tidak ada informasi yang cukup. Jika informasi sangat terbatas, jelaskan secara jujur apa yang berhasil ditemukan dan sebutkan keterbatasannya.\n3. Awali jawaban Anda PERSIS dengan 2 baris metadata berikut sebelum catatan:\nJUDUL: <judul kajian yang ringkas dan jelas>\nPEMATERI: <nama ustadz/pemateri/channel jika diketahui, atau kosongkan>\n---NOTES---\nLalu tuliskan catatan kajian lengkap dalam Markdown yang rapi (menggunakan heading ## Ringkasan Pembahasan, ## Poin-Poin Utama, ## Dalil & Rujukan, ## Hikmah & Amal Praktis).";

      const attempts = [
        {
          model: "gemini-4-hydrogen",
          useTools: true,
          thinkingLevel: ThinkingLevel.LOW,
        },
        {
          model: "gemini-3.1-flash-lite",
          useTools: true,
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
        {
          model: "gemini-3.1-flash-lite",
          useTools: false,
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      ];

      let responseText = "";
      let sources: Array<{ title: string; uri: string }> = [];
      let lastErr: unknown;

      for (const attempt of attempts) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model: attempt.model,
              contents: `Buatkan catatan kajian terstruktur dari tautan media sosial berikut:\n\n${promptParts}`,
              config: {
                ...(attempt.useTools
                  ? { tools: [{ urlContext: {} }, { googleSearch: {} }] }
                  : {}),
                thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
                systemInstruction,
              },
            })
          );

          responseText = (response.text ?? "").trim();

          const chunks =
            response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          const seenUris = new Set<string>();
          sources = [];
          for (const chunk of chunks) {
            const web = chunk.web;
            if (web?.uri && !seenUris.has(web.uri)) {
              seenUris.add(web.uri);
              sources.push({
                title: web.title || web.uri,
                uri: web.uri,
              });
            }
          }
          break;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("404") ||
            msg.includes("NOT_FOUND");
          if (!shouldFallback) {
            throw err;
          }
        }
      }

      if (!responseText && lastErr) {
        throw lastErr;
      }

      // Parse JUDUL / PEMATERI / ---NOTES---
      let parsedTitle = probe.extractedTitle || `Kajian ${probe.platform}`;
      let parsedSpeaker = probe.extractedAuthor || "";
      let notesMarkdown = responseText;

      const splitIdx = responseText.indexOf("---NOTES---");
      if (splitIdx !== -1) {
        const headerBlock = responseText.slice(0, splitIdx);
        notesMarkdown = responseText.slice(splitIdx + "---NOTES---".length).trim();

        const titleMatch = headerBlock.match(/^JUDUL:\s*(.+)$/m);
        if (titleMatch?.[1]?.trim()) {
          parsedTitle = titleMatch[1].trim();
        }
        const speakerMatch = headerBlock.match(/^PEMATERI:\s*(.*)$/m);
        if (speakerMatch?.[1]?.trim()) {
          parsedSpeaker = speakerMatch[1].trim();
        }
      }

      const hasRichInput =
        probe.transcriptSegments.length > 0 ||
        probe.extractedDescription.length > 40 ||
        probe.extractedTitle.length > 10 ||
        Boolean(extraNotes?.trim());

      const warning =
        !hasRichInput && probe.platform !== "YouTube"
          ? `Platform ${probe.platform} sering membatasi akses otomatis pada video/reel tertentu. Jika hasil masih singkat, putar videonya di dekat mikrofon dengan 'Mulai Rekam Suara' atau tempelkan caption/poin tambahannya.`
          : undefined;

      res.json({
        title: parsedTitle,
        speaker: parsedSpeaker,
        platform: probe.platform,
        sourceUrl: rawUrl,
        notesMarkdown,
        transcriptSegments: probe.transcriptSegments,
        sources,
        warning,
      });
    } catch (err) {
      console.error("[from-link]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // =========================================================================
  // REKAM PELATIHAN (SMART TRAINING) ENDPOINTS
  // =========================================================================

  // Transcribe training audio file / recording
  app.post("/api/pelatihan/transcribe-file", async (req, res) => {
    try {
      const { audioBase64, mimeType, language } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        language?: string;
      };

      if (!audioBase64 || !mimeType) {
        res.status(400).json({
          error: "Data audio dan tipe MIME wajib disertakan.",
        });
        return;
      }

      const ai = getAiClient();
      const langHint =
        language === "en-US"
          ? "Fokus pada bahasa Inggris."
          : language === "id-ID"
          ? "Fokus pada bahasa Indonesia dan pertahankan istilah teknis, bisnis, SOP, atau KPI dalam bahasa aslinya."
          : "Utamakan bahasa Indonesia/Inggris sesuai ucapan pemateri dan pertahankan istilah teknis, framework, angka, atau akronim dengan akurat.";

      const audioPart = {
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      };
      const promptText = `Transkripsikan ucapan pada rekaman pelatihan/workshop ini secara akurat kata demi kata. ${langHint} Jangan tambahkan sapaan, komentar, atau kalimat pembuka/penutup. Jika audio hening atau tidak ada ucapan yang terdengar, kembalikan string kosong.`;

      const modelsToTry = [
        "gemini-3.5-transcribe",
        "gemini-3.1-flash-lite",
        "gemini-4-hydrogen",
      ];

      let lastErr: unknown;
      for (const model of modelsToTry) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model,
              contents: {
                parts: [audioPart, { text: promptText }],
              },
            })
          );
          res.json({
            transcript: (response.text ?? "").trim(),
            modelUsed: model,
          });
          return;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("404") ||
            msg.includes("NOT_FOUND") ||
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED");
          if (!shouldFallback) {
            throw err;
          }
        }
      }

      throw lastErr;
    } catch (err) {
      console.error("[pelatihan/transcribe-file]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Smart Training Analysis: Executive summary, structured modules, action items, frameworks, and interactive quiz
  app.post("/api/pelatihan/analyze", async (req, res) => {
    try {
      const { title, trainer, organizer, category, transcript, notes, markers } =
        req.body as {
          title?: string;
          trainer?: string;
          organizer?: string;
          category?: string;
          transcript?: string;
          notes?: string;
          markers?: Array<{ timestamp?: string; kind?: string; note?: string }>;
        };

      if (!notes?.trim() && !transcript?.trim()) {
        res.status(400).json({
          error:
            "Belum ada catatan atau transkrip pelatihan untuk dianalisis. Rekam suara, unggah audio, atau tulis catatan terlebih dahulu.",
        });
        return;
      }

      const markersText =
        Array.isArray(markers) && markers.length > 0
          ? markers
              .map(
                (m) =>
                  `- [${m.timestamp || "00:00"}] (${m.kind || "penting"}): ${
                    m.note || "Momen ditandai"
                  }`
              )
              .join("\n")
          : "";

      const combinedSource = [
        title ? `Judul Pelatihan: ${title}` : "",
        category ? `Kategori: ${category}` : "",
        trainer ? `Trainer / Instruktur: ${trainer}` : "",
        organizer ? `Penyelenggara: ${organizer}` : "",
        notes?.trim() ? `\n--- Catatan Peserta ---\n${notes.trim()}` : "",
        markersText ? `\n--- Penanda Momen Penting ---\n${markersText}` : "",
        transcript?.trim()
          ? `\n--- Transkrip Suara Pelatihan ---\n${transcript.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const ai = getAiClient();
      const requestConfig = {
        systemInstruction:
          "Anda adalah analis pembelajaran profesional (Learning & Development Specialist) yang mengubah transkrip rekaman pelatihan, penanda momen, dan catatan mentah menjadi modul pelatihan yang terstruktur, tajam, dan siap diterapkan dalam pekerjaan. Tulis dalam bahasa Indonesia yang jernih dan profesional. Pastikan semua poin, SOP, action items, istilah, dan soal evaluasi bersumber dari konteks materi yang diberikan tanpa mengarang fakta yang bertentangan.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ringkasanEksekutif: {
              type: Type.STRING,
              description:
                "Ringkasan eksekutif 2-4 kalimat padat mengenai inti pelatihan dan dampaknya bagi peserta.",
            },
            tujuanPembelajaran: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Daftar 3-5 tujuan pembelajaran atau kompetensi utama yang dicapai.",
            },
            modulMateri: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  judul: { type: Type.STRING },
                  ringkasan: { type: Type.STRING },
                  poinKunci: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  langkahPraktis: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ["judul", "ringkasan", "poinKunci", "langkahPraktis"],
              },
              description:
                "Pengelompokan materi pelatihan menjadi 2-5 modul/bab logis beserta poin kunci dan langkah praktis/SOP.",
            },
            tindakLanjut: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  task: { type: Type.STRING },
                  owner: { type: Type.STRING },
                  dueHint: { type: Type.STRING },
                  priority: {
                    type: Type.STRING,
                    description: "Salah satu dari: Tinggi, Sedang, Rendah",
                  },
                },
                required: ["task", "owner", "dueHint", "priority"],
              },
              description:
                "Daftar 3-6 rencana tindak lanjut (action items) konkret yang bisa langsung dieksekusi peserta setelah pelatihan.",
            },
            istilahKunci: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  istilah: { type: Type.STRING },
                  penjelasan: { type: Type.STRING },
                },
                required: ["istilah", "penjelasan"],
              },
              description:
                "Daftar istilah teknis, framework, metode, atau tools penting yang dibahas.",
            },
            kuisEvaluasi: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pertanyaan: { type: Type.STRING },
                  pilihan: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  jawabanIndex: {
                    type: Type.INTEGER,
                    description: "Indeks jawaban benar berbasis 0 (0 sampai 3).",
                  },
                  pembahasan: { type: Type.STRING },
                },
                required: ["pertanyaan", "pilihan", "jawabanIndex", "pembahasan"],
              },
              description:
                "3-5 soal pilihan ganda (masing-masing 4 opsi) untuk menguji pemahaman peserta terhadap materi pelatihan.",
            },
            catatanRapiMarkdown: {
              type: Type.STRING,
              description:
                "Naskah modul catatan pelatihan rapi dalam format Markdown terstruktur siap baca/cetak.",
            },
          },
          required: [
            "ringkasanEksekutif",
            "tujuanPembelajaran",
            "modulMateri",
            "tindakLanjut",
            "istilahKunci",
            "kuisEvaluasi",
            "catatanRapiMarkdown",
          ],
        },
      };

      const candidates: Array<{
        model: string;
        thinkingLevel: ThinkingLevel;
      }> = [
        { model: "gemini-4-hydrogen", thinkingLevel: ThinkingLevel.LOW },
        { model: "gemini-3.1-flash-lite", thinkingLevel: ThinkingLevel.MINIMAL },
      ];

      let lastErr: unknown;
      for (const candidate of candidates) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model: candidate.model,
              contents: `Analisis secara menyeluruh bahan rekaman dan catatan pelatihan berikut:\n\n${combinedSource}`,
              config: {
                ...requestConfig,
                thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
              },
            })
          );
          const rawJson = (response.text ?? "{}").trim();
          const parsed = JSON.parse(rawJson) as Record<string, unknown>;

          const rawQuiz = Array.isArray(parsed.kuisEvaluasi)
            ? parsed.kuisEvaluasi
            : [];
          const normalizedQuiz = rawQuiz.map((q, idx) => {
            const item = q as {
              pertanyaan?: string;
              pilihan?: string[];
              jawabanIndex?: number;
              pembahasan?: string;
            };
            const choices = Array.isArray(item.pilihan)
              ? item.pilihan.slice(0, 4)
              : [];
            const safeIdx =
              typeof item.jawabanIndex === "number" &&
              item.jawabanIndex >= 0 &&
              item.jawabanIndex < choices.length
                ? item.jawabanIndex
                : 0;
            return {
              id: `quiz-${Date.now()}-${idx}`,
              pertanyaan: item.pertanyaan || "",
              pilihan: choices,
              jawabanIndex: safeIdx,
              pembahasan: item.pembahasan || "",
            };
          });

          const rawActions = Array.isArray(parsed.tindakLanjut)
            ? parsed.tindakLanjut
            : [];
          const normalizedActions = rawActions.map((a) => {
            const item = a as {
              task?: string;
              owner?: string;
              dueHint?: string;
              priority?: string;
            };
            const p =
              item.priority === "Tinggi" ||
              item.priority === "Sedang" ||
              item.priority === "Rendah"
                ? item.priority
                : "Sedang";
            return {
              task: item.task || "",
              owner: item.owner || "Peserta",
              dueHint: item.dueHint || "Minggu ini",
              priority: p,
            };
          });

          res.json({
            ...parsed,
            tindakLanjut: normalizedActions,
            kuisEvaluasi: normalizedQuiz,
            generatedAt: new Date().toISOString(),
          });
          return;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("404") ||
            msg.includes("NOT_FOUND");
          if (!shouldFallback) {
            throw err;
          }
        }
      }

      throw lastErr;
    } catch (err) {
      console.error("[pelatihan/analyze]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Smart Q&A / Document Generator grounded in recorded training + optional Google Search
  app.post("/api/pelatihan/ask", async (req, res) => {
    try {
      const { title, trainer, category, transcript, notes, question, useWebSearch } =
        req.body as {
          title?: string;
          trainer?: string;
          category?: string;
          transcript?: string;
          notes?: string;
          question?: string;
          useWebSearch?: boolean;
        };

      if (!question?.trim()) {
        res.status(400).json({
          error: "Tulis pertanyaan atau instruksi untuk asisten materi pelatihan.",
        });
        return;
      }

      const contextText = [
        title ? `Judul Pelatihan: ${title}` : "",
        category ? `Kategori: ${category}` : "",
        trainer ? `Trainer: ${trainer}` : "",
        notes?.trim() ? `Catatan Pelatihan:\n${notes.trim()}` : "",
        transcript?.trim() ? `Transkrip Pelatihan:\n${transcript.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const ai = getAiClient();
      const systemInstruction =
        "Anda adalah asisten pintar pasca-pelatihan (Smart Training Assistant). Tugas Anda membantu peserta memahami ulang materi pelatihan, menyusun draft SOP/checklist kerja, merangkum laporan ke atasan, atau memberikan contoh implementasi nyata berdasarkan rekaman dan catatan pelatihan. Gunakan Markdown bahasa Indonesia yang bersih, praktis, dan langsung bisa dipakai.";

      const attempts = [
        {
          model: "gemini-4-hydrogen",
          useSearch: Boolean(useWebSearch),
          thinkingLevel: ThinkingLevel.LOW,
        },
        {
          model: "gemini-3.1-flash-lite",
          useSearch: Boolean(useWebSearch),
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
        {
          model: "gemini-3.1-flash-lite",
          useSearch: false,
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      ];

      let lastErr: unknown;
      for (const attempt of attempts) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model: attempt.model,
              contents: `${contextText ? `Konteks Pelatihan:\n${contextText}\n\n` : ""}Permintaan Peserta:\n${question.trim()}`,
              config: {
                ...(attempt.useSearch ? { tools: [{ googleSearch: {} }] } : {}),
                thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
                systemInstruction,
              },
            })
          );

          const chunks =
            response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          const seenUris = new Set<string>();
          const sources: Array<{ title: string; uri: string }> = [];

          for (const chunk of chunks) {
            const web = chunk.web;
            if (web?.uri && !seenUris.has(web.uri)) {
              seenUris.add(web.uri);
              sources.push({
                title: web.title || web.uri,
                uri: web.uri,
              });
            }
          }

          res.json({
            answerMarkdown: (response.text ?? "").trim(),
            sources,
            createdAt: new Date().toISOString(),
          });
          return;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("404") ||
            msg.includes("NOT_FOUND");
          if (!shouldFallback) {
            throw err;
          }
        }
      }

      throw lastErr;
    } catch (err) {
      console.error("[pelatihan/ask]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Extract training notes from a webinar/video link
  app.post("/api/pelatihan/from-link", async (req, res) => {
    try {
      const { url, extraNotes } = req.body as {
        url?: string;
        extraNotes?: string;
      };

      const rawUrl = (url ?? "").trim();
      if (!rawUrl) {
        res.status(400).json({
          error: "Masukkan tautan video pelatihan/webinar (YouTube, dll.).",
        });
        return;
      }

      try {
        const parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("Invalid protocol");
        }
      } catch {
        res.status(400).json({
          error: "Format tautan tidak valid. Pastikan diawali https:// atau http://.",
        });
        return;
      }

      const probe = await probeSocialLink(rawUrl);
      const transcriptJoined = probe.transcriptSegments
        .map((s) => `[${s.timestamp}] ${s.text}`)
        .join("\n")
        .slice(0, 24000);

      const promptParts = [
        `Platform: ${probe.platform}`,
        `Tautan Materi: ${rawUrl}`,
        probe.extractedTitle ? `Judul Terdeteksi: ${probe.extractedTitle}` : "",
        probe.extractedAuthor ? `Trainer/Channel Terdeteksi: ${probe.extractedAuthor}` : "",
        probe.extractedDescription
          ? `Deskripsi:\n${probe.extractedDescription}`
          : "",
        extraNotes?.trim()
          ? `Catatan Tambahan Peserta:\n${extraNotes.trim()}`
          : "",
        transcriptJoined ? `Transkrip Video:\n${transcriptJoined}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const ai = getAiClient();
      const systemInstruction =
        "Anda adalah pencatat pelatihan profesional yang mengubah tautan video pelatihan/webinar menjadi modul catatan kerja terstruktur dalam bahasa Indonesia.\n\nAturan:\n1. Gunakan urlContext dan googleSearch bila tersedia untuk memahami materi secara akurat.\n2. Jangan mengarang fakta jika halaman tertutup/login-walled.\n3. Awali jawaban PERSIS dengan 2 baris metadata berikut:\nJUDUL: <judul pelatihan ringkas>\nTRAINER: <nama trainer/pembicara/channel jika ada>\n---NOTES---\nLalu tuliskan catatan pelatihan dalam Markdown rapi (## Ringkasan Materi, ## Poin & Framework Utama, ## Langkah Implementasi / SOP, ## Catatan Tindak Lanjut).";

      const attempts = [
        { model: "gemini-4-hydrogen", useTools: true, thinkingLevel: ThinkingLevel.LOW },
        { model: "gemini-3.1-flash-lite", useTools: true, thinkingLevel: ThinkingLevel.MINIMAL },
        { model: "gemini-3.1-flash-lite", useTools: false, thinkingLevel: ThinkingLevel.MINIMAL },
      ];

      let responseText = "";
      let lastErr: unknown;
      for (const attempt of attempts) {
        try {
          const response = await withRetry(() =>
            ai.models.generateContent({
              model: attempt.model,
              contents: `Susun catatan pelatihan terstruktur dari tautan berikut:\n\n${promptParts}`,
              config: {
                ...(attempt.useTools
                  ? { tools: [{ urlContext: {} }, { googleSearch: {} }] }
                  : {}),
                thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
                systemInstruction,
              },
            })
          );
          responseText = (response.text ?? "").trim();
          break;
        } catch (err) {
          lastErr = err;
          const msg = extractErrorMessage(err);
          const shouldFallback =
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("404") ||
            msg.includes("NOT_FOUND");
          if (!shouldFallback) throw err;
        }
      }

      if (!responseText && lastErr) throw lastErr;

      let parsedTitle = probe.extractedTitle || `Pelatihan ${probe.platform}`;
      let parsedTrainer = probe.extractedAuthor || "";
      let notesMarkdown = responseText;

      const splitIdx = responseText.indexOf("---NOTES---");
      if (splitIdx !== -1) {
        const headerBlock = responseText.slice(0, splitIdx);
        notesMarkdown = responseText.slice(splitIdx + "---NOTES---".length).trim();

        const titleMatch = headerBlock.match(/^JUDUL:\s*(.+)$/m);
        if (titleMatch?.[1]?.trim()) parsedTitle = titleMatch[1].trim();
        const trainerMatch = headerBlock.match(/^TRAINER:\s*(.*)$/m);
        if (trainerMatch?.[1]?.trim()) parsedTrainer = trainerMatch[1].trim();
      }

      res.json({
        title: parsedTitle,
        trainer: parsedTrainer,
        platform: probe.platform,
        sourceUrl: rawUrl,
        notesMarkdown,
        transcriptSegments: probe.transcriptSegments,
      });
    } catch (err) {
      console.error("[pelatihan/from-link]", extractErrorMessage(err));
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  const server = http.createServer(app);

  // WebSocket server for optional Live API audio transcription
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (clientWs: WebSocket, req) => {
    const reqUrl = new URL(req.url ?? "/", "http://localhost");
    const langParam = reqUrl.searchParams.get("lang") || "auto";
    const languageCodes =
      langParam === "auto" || !langParam ? [] : [langParam];

    let closed = false;
    let liveSession: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null =
      null;

    try {
      const ai = getAiClient();
      const sessionPromise = ai.live.connect({
        model: "gemini-3.5-transcribe-live",
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {
            languageCodes,
          },
        },
        callbacks: {
          onopen: () => {
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed || clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.interimInputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  interimTranscript: content.interimInputTranscription.text,
                })
              );
            }
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  transcript: content.inputTranscription.text,
                })
              );
            }
          },
          onerror: (err) => {
            const msg = extractErrorMessage(err);
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  unsupportedLive: msg.includes("404") || msg.includes("NOT_FOUND"),
                  error: formatGeminiError(err).message,
                })
              );
            }
          },
          onclose: () => {
            if (!closed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ sessionClosed: true }));
            }
          },
        },
      });

      liveSession = await sessionPromise;

      if (closed) {
        liveSession.close();
        return;
      }

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }

      clientWs.on("message", (rawData) => {
        if (closed || !liveSession) return;
        try {
          const parsed = JSON.parse(rawData.toString()) as { audio?: string };
          if (parsed.audio) {
            liveSession.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          }
        } catch {
          // Ignore malformed frames
        }
      });
    } catch (err) {
      const msg = extractErrorMessage(err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            unsupportedLive: true,
            error: formatGeminiError(err).message || msg,
          })
        );
        clientWs.close();
      }
    }

    clientWs.on("close", () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close error
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const reqUrl = new URL(req.url ?? "/", "http://localhost");
    if (reqUrl.pathname === "/ws/transcribe") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import("vite");
      return createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === "true" ? false : { server },
          watch: process.env.DISABLE_HMR === "true" ? null : undefined,
        },
        appType: "spa",
      });
    })();

    vitePromise.catch((err) => {
      console.error("Failed to initialize Vite dev middleware:", err);
    });

    app.use((req, res, next) => {
      vitePromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`CatatKajian server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
