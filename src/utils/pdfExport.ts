import { jsPDF } from "jspdf";
import type { KajianNote } from "../types/kajian";

export interface PdfExportOptions {
  includeNotes: boolean;
  includeSummary: boolean;
  includeEnrichment: boolean;
  includeTranscript: boolean;
}

const PAGE_W = 794; // A4 width at 96 DPI
const PAGE_H = 1123; // A4 height at 96 DPI
const SCALE = 2; // 2x crisp retina resolution
const MARGIN_X = 64;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 72;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const MAX_Y = PAGE_H - MARGIN_BOTTOM;

const FONT_DISPLAY = '"Fraunces", Georgia, serif';
const FONT_BODY = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

interface StyledToken {
  text: string;
  style: "normal" | "bold" | "italic" | "code";
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function isPredominantlyArabic(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  return arabicChars > 0 && arabicChars >= latinChars;
}

function tokenizeInline(text: string): StyledToken[] {
  const tokens: StyledToken[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushSegment = (segment: string, style: StyledToken["style"]) => {
    const pieces = segment.split(/(\s+)/);
    for (const piece of pieces) {
      if (piece.length > 0) {
        tokens.push({ text: piece, style });
      }
    }
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushSegment(text.slice(lastIndex, match.index), "normal");
    }
    const raw = match[0];
    if (raw.startsWith("**") && raw.endsWith("**")) {
      pushSegment(raw.slice(2, -2), "bold");
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      pushSegment(raw.slice(1, -1), "italic");
    } else if (raw.startsWith("`") && raw.endsWith("`")) {
      pushSegment(raw.slice(1, -1), "code");
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    pushSegment(text.slice(lastIndex), "normal");
  }

  return tokens;
}

function getFontForStyle(
  style: StyledToken["style"],
  sizePx: number,
  family = FONT_BODY
): string {
  switch (style) {
    case "bold":
      return `600 ${sizePx}px ${family}`;
    case "italic":
      return `italic 400 ${sizePx}px ${family}`;
    case "code":
      return `400 ${Math.max(11, sizePx - 1)}px ${FONT_MONO}`;
    default:
      return `400 ${sizePx}px ${family}`;
  }
}

function wrapTokens(
  ctx: CanvasRenderingContext2D,
  tokens: StyledToken[],
  maxWidth: number,
  sizePx: number,
  family = FONT_BODY
): StyledToken[][] {
  const lines: StyledToken[][] = [];
  let currentLine: StyledToken[] = [];
  let currentWidth = 0;

  for (const tok of tokens) {
    const isSpace = /^\s+$/.test(tok.text);
    if (isSpace && currentLine.length === 0) continue;

    ctx.font = getFontForStyle(tok.style, sizePx, family);
    const w = ctx.measureText(tok.text).width;

    if (currentWidth + w > maxWidth && currentLine.length > 0 && !isSpace) {
      // Trim trailing whitespace token
      if (
        currentLine.length > 0 &&
        /^\s+$/.test(currentLine[currentLine.length - 1].text)
      ) {
        currentLine.pop();
      }
      lines.push(currentLine);
      currentLine = [tok];
      currentWidth = w;
    } else {
      currentLine.push(tok);
      currentWidth += w;
    }
  }

  if (currentLine.length > 0) {
    if (/^\s+$/.test(currentLine[currentLine.length - 1].text)) {
      currentLine.pop();
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [[]];
}

function wrapPlainText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

class PdfCanvasBuilder {
  private pages: HTMLCanvasElement[] = [];
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private y = MARGIN_TOP;

  constructor() {
    this.addPage();
  }

  private addPage() {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W * SCALE;
    canvas.height = PAGE_H * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D tidak tersedia.");
    }
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = "top";

    this.pages.push(canvas);
    this.canvas = canvas;
    this.ctx = ctx;
    this.y = MARGIN_TOP;
  }

  ensureSpace(height: number) {
    if (this.y + height > MAX_Y) {
      this.addPage();
    }
  }

  addSpacer(px: number) {
    this.y += px;
  }

  drawHairline(color = "#e2e8f0", marginTop = 8, marginBottom = 14) {
    this.y += marginTop;
    this.ensureSpace(marginBottom + 2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(MARGIN_X, this.y);
    this.ctx.lineTo(PAGE_W - MARGIN_X, this.y);
    this.ctx.stroke();
    this.y += marginBottom;
  }

  drawKicker(text: string) {
    this.ensureSpace(24);
    this.ctx.font = `600 11px ${FONT_BODY}`;
    this.ctx.fillStyle = "#0f766e";
    this.ctx.direction = "ltr";
    this.ctx.textAlign = "left";
    this.ctx.fillText(text, MARGIN_X, this.y);
    this.y += 20;
  }

  drawTitle(title: string) {
    const font = `600 28px ${FONT_DISPLAY}`;
    const lines = wrapPlainText(this.ctx, title, CONTENT_W, font);
    const lineHeight = 36;
    this.ensureSpace(lines.length * lineHeight + 8);
    this.ctx.font = font;
    this.ctx.fillStyle = "#0f172a";
    this.ctx.direction = "ltr";
    this.ctx.textAlign = "left";
    for (const line of lines) {
      this.ctx.fillText(line, MARGIN_X, this.y);
      this.y += lineHeight;
    }
    this.y += 6;
  }

  drawMetadata(metaItems: string[]) {
    const lineText = metaItems.filter(Boolean).join("   ·   ");
    if (!lineText) return;
    const font = `400 13px ${FONT_BODY}`;
    const lines = wrapPlainText(this.ctx, lineText, CONTENT_W, font);
    const lineHeight = 20;
    this.ensureSpace(lines.length * lineHeight + 6);
    this.ctx.font = font;
    this.ctx.fillStyle = "#475569";
    this.ctx.direction = "ltr";
    this.ctx.textAlign = "left";
    for (const line of lines) {
      this.ctx.fillText(line, MARGIN_X, this.y);
      this.y += lineHeight;
    }
  }

  drawSectionTitle(title: string) {
    this.y += 8;
    const font = `600 18px ${FONT_DISPLAY}`;
    const lines = wrapPlainText(this.ctx, title, CONTENT_W, font);
    const lineHeight = 26;
    // Prevent orphan heading at page bottom
    this.ensureSpace(lines.length * lineHeight + 48);
    this.ctx.font = font;
    this.ctx.fillStyle = "#0f172a";
    this.ctx.direction = "ltr";
    this.ctx.textAlign = "left";
    for (const line of lines) {
      this.ctx.fillText(line, MARGIN_X, this.y);
      this.y += lineHeight;
    }
    this.ctx.strokeStyle = "#e2e8f0";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(MARGIN_X, this.y + 4);
    this.ctx.lineTo(PAGE_W - MARGIN_X, this.y + 4);
    this.ctx.stroke();
    this.y += 14;
  }

  drawSubHeading(title: string) {
    this.y += 6;
    const font = `600 14.5px ${FONT_BODY}`;
    const lines = wrapPlainText(this.ctx, title, CONTENT_W, font);
    const lineHeight = 22;
    this.ensureSpace(lines.length * lineHeight + 32);
    this.ctx.font = font;
    this.ctx.fillStyle = "#0f172a";
    this.ctx.direction = "ltr";
    this.ctx.textAlign = "left";
    for (const line of lines) {
      this.ctx.fillText(line, MARGIN_X, this.y);
      this.y += lineHeight;
    }
    this.y += 4;
  }

  drawStyledParagraph(
    text: string,
    options?: {
      xOffset?: number;
      maxWidth?: number;
      sizePx?: number;
      lineHeight?: number;
      color?: string;
      bottomSpace?: number;
      prefix?: string;
    }
  ) {
    const xOffset = options?.xOffset ?? 0;
    const maxWidth = options?.maxWidth ?? CONTENT_W - xOffset;
    const sizePx = options?.sizePx ?? 13.5;
    const lineHeight = options?.lineHeight ?? 22;
    const color = options?.color ?? "#334155";
    const bottomSpace = options?.bottomSpace ?? 8;
    const startX = MARGIN_X + xOffset;

    if (isPredominantlyArabic(text) && !options?.prefix) {
      const arabicFont = `400 ${sizePx + 2}px ${FONT_BODY}`;
      const lines = wrapPlainText(this.ctx, text, maxWidth, arabicFont);
      for (const line of lines) {
        this.ensureSpace(lineHeight + 4);
        this.ctx.font = arabicFont;
        this.ctx.fillStyle = color;
        this.ctx.direction = "rtl";
        this.ctx.textAlign = "right";
        this.ctx.fillText(line, MARGIN_X + xOffset + maxWidth, this.y);
        this.y += lineHeight + 4;
      }
      this.ctx.direction = "ltr";
      this.ctx.textAlign = "left";
      this.y += bottomSpace;
      return;
    }

    const tokens = tokenizeInline(text);
    const lines = wrapTokens(this.ctx, tokens, maxWidth, sizePx);

    lines.forEach((lineTokens, lineIdx) => {
      this.ensureSpace(lineHeight);

      if (lineIdx === 0 && options?.prefix) {
        this.ctx.font = `600 ${sizePx}px ${FONT_BODY}`;
        this.ctx.fillStyle = "#0f766e";
        this.ctx.direction = "ltr";
        this.ctx.textAlign = "left";
        this.ctx.fillText(options.prefix, startX - 18, this.y);
      }

      let cursorX = startX;
      this.ctx.direction = "ltr";
      this.ctx.textAlign = "left";

      for (const tok of lineTokens) {
        const fontSize = containsArabic(tok.text) ? sizePx + 1.5 : sizePx;
        this.ctx.font = getFontForStyle(tok.style, fontSize);
        const width = this.ctx.measureText(tok.text).width;

        if (tok.style === "code") {
          this.ctx.fillStyle = "#f1f5f9";
          this.ctx.fillRect(cursorX - 2, this.y + 1, width + 4, lineHeight - 4);
          this.ctx.fillStyle = "#0f172a";
        } else if (tok.style === "bold") {
          this.ctx.fillStyle = "#0f172a";
        } else {
          this.ctx.fillStyle = color;
        }

        this.ctx.fillText(tok.text, cursorX, this.y);
        cursorX += width;
      }

      this.y += lineHeight;
    });

    this.y += bottomSpace;
  }

  drawBlockquote(linesText: string[]) {
    const innerPadX = 16;
    const innerPadY = 12;
    const innerWidth = CONTENT_W - innerPadX * 2;
    const sizePx = 13.5;
    const lineHeight = 22;

    const wrappedParagraphs = linesText.map((para) => {
      if (isPredominantlyArabic(para)) {
        return {
          arabic: true,
          plainLines: wrapPlainText(
            this.ctx,
            para,
            innerWidth,
            `400 ${sizePx + 2}px ${FONT_BODY}`
          ),
          tokenLines: [] as StyledToken[][],
        };
      }
      return {
        arabic: false,
        plainLines: [] as string[],
        tokenLines: wrapTokens(this.ctx, tokenizeInline(para), innerWidth, sizePx),
      };
    });

    const totalLines = wrappedParagraphs.reduce(
      (sum, p) => sum + (p.arabic ? p.plainLines.length : p.tokenLines.length),
      0
    );
    const boxHeight =
      totalLines * (lineHeight + 2) +
      Math.max(0, wrappedParagraphs.length - 1) * 6 +
      innerPadY * 2;

    if (boxHeight < MAX_Y - MARGIN_TOP) {
      this.ensureSpace(boxHeight + 10);
    }

    const startY = this.y;
    const drawHeight = Math.min(boxHeight, MAX_Y - startY);
    this.ctx.fillStyle = "#f8fafc";
    this.ctx.strokeStyle = "#e2e8f0";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(MARGIN_X, startY, CONTENT_W, drawHeight, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.y += innerPadY;
    for (const para of linesText) {
      this.drawStyledParagraph(para, {
        xOffset: innerPadX,
        maxWidth: innerWidth,
        sizePx,
        lineHeight,
        color: "#334155",
        bottomSpace: 6,
      });
    }
    this.y += innerPadY - 6 + 8;
  }

  drawMarkdown(markdown: string) {
    const lines = markdown.split(/\r?\n/);
    let i = 0;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        i++;
        continue;
      }

      if (trimmed.startsWith("### ")) {
        this.drawSubHeading(trimmed.slice(4));
        i++;
        continue;
      }

      if (trimmed.startsWith("## ")) {
        this.drawSectionTitle(trimmed.slice(3));
        i++;
        continue;
      }

      if (trimmed.startsWith("# ")) {
        this.drawSectionTitle(trimmed.slice(2));
        i++;
        continue;
      }

      if (trimmed.startsWith("> ")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("> ")) {
          quoteLines.push(lines[i].trim().slice(2));
          i++;
        }
        this.drawBlockquote(quoteLines);
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^[-*]\s+/, "");
          this.drawStyledParagraph(itemText, {
            xOffset: 22,
            maxWidth: CONTENT_W - 22,
            prefix: "•",
            bottomSpace: 4,
          });
          i++;
        }
        this.y += 4;
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        let num = 1;
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
          this.drawStyledParagraph(itemText, {
            xOffset: 26,
            maxWidth: CONTENT_W - 26,
            prefix: `${num}.`,
            bottomSpace: 4,
          });
          num++;
          i++;
        }
        this.y += 4;
        continue;
      }

      if (trimmed === "---" || trimmed === "***") {
        this.drawHairline("#e2e8f0", 6, 10);
        i++;
        continue;
      }

      this.drawStyledParagraph(trimmed);
      i++;
    }
  }

  finalizeFooters(documentTitle: string): HTMLCanvasElement[] {
    const total = this.pages.length;
    const footerY = PAGE_H - 44;

    this.pages.forEach((canvas, idx) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, footerY - 12);
      ctx.lineTo(PAGE_W - MARGIN_X, footerY - 12);
      ctx.stroke();

      ctx.font = `400 11px ${FONT_BODY}`;
      ctx.fillStyle = "#64748b";
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      const leftLabel = `CatatKajian — ${documentTitle || "Catatan Kajian"}`;
      const maxLeftW = CONTENT_W - 120;
      let clipped = leftLabel;
      while (clipped.length > 10 && ctx.measureText(clipped).width > maxLeftW) {
        clipped = `${clipped.slice(0, -4)}...`;
      }
      ctx.fillText(clipped, MARGIN_X, footerY);

      ctx.textAlign = "right";
      ctx.fillText(
        `Halaman ${idx + 1} dari ${total}`,
        PAGE_W - MARGIN_X,
        footerY
      );
    });

    return this.pages;
  }
}

export async function exportKajianToPdf(
  note: KajianNote,
  options: PdfExportOptions
): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const builder = new PdfCanvasBuilder();
  const title = note.title.trim() || "Catatan Kajian";

  builder.drawKicker("CATATAN KAJIAN");
  builder.drawTitle(title);
  builder.drawMetadata([
    note.speaker.trim() ? `Pemateri: ${note.speaker.trim()}` : "",
    note.location.trim() ? `Majelis: ${note.location.trim()}` : "",
    note.date.trim() ? `Tanggal: ${note.date.trim()}` : "",
  ]);
  builder.drawHairline("#cbd5e1", 12, 18);

  if (options.includeNotes && note.notes.trim()) {
    builder.drawMarkdown(note.notes);
  }

  if (options.includeSummary && note.summary) {
    builder.drawSectionTitle("Ringkasan Kajian");
    builder.drawStyledParagraph(note.summary.ringkasanSingkat);

    if (note.summary.poinUtama.length > 0) {
      builder.drawSubHeading("Poin Pembahasan Utama");
      note.summary.poinUtama.forEach((p, idx) => {
        builder.drawStyledParagraph(p, {
          xOffset: 26,
          maxWidth: CONTENT_W - 26,
          prefix: `${idx + 1}.`,
          bottomSpace: 4,
        });
      });
      builder.addSpacer(6);
    }

    if (note.summary.nasihatPraktis.length > 0) {
      builder.drawSubHeading("Amal & Hikmah Praktis");
      note.summary.nasihatPraktis.forEach((p) => {
        builder.drawStyledParagraph(p, {
          xOffset: 22,
          maxWidth: CONTENT_W - 22,
          prefix: "•",
          bottomSpace: 4,
        });
      });
      builder.addSpacer(6);
    }

    if (note.summary.istilahKunci.length > 0) {
      builder.drawSubHeading("Istilah & Konsep Kunci");
      note.summary.istilahKunci.forEach((term) => {
        builder.drawStyledParagraph(`**${term.istilah}**: ${term.makna}`, {
          bottomSpace: 5,
        });
      });
    }
  }

  if (options.includeEnrichment && note.enrichment?.markdown) {
    builder.drawSectionTitle("Pelengkap & Dalil Rujukan Online");
    builder.drawMarkdown(note.enrichment.markdown);

    if (note.enrichment.sources.length > 0) {
      builder.drawSubHeading("Sumber Referensi Online");
      note.enrichment.sources.forEach((src, idx) => {
        builder.drawStyledParagraph(`${src.title} (${src.uri})`, {
          xOffset: 26,
          maxWidth: CONTENT_W - 26,
          sizePx: 12,
          lineHeight: 19,
          color: "#475569",
          prefix: `${idx + 1}.`,
          bottomSpace: 3,
        });
      });
    }
  }

  if (options.includeTranscript && note.segments.length > 0) {
    builder.drawSectionTitle("Lampiran Transkrip Suara");
    note.segments.forEach((seg) => {
      builder.drawStyledParagraph(`**[${seg.timestamp}]** ${seg.text}`, {
        sizePx: 12.5,
        lineHeight: 20,
        bottomSpace: 5,
      });
    });
  }

  const pages = builder.finalizeFooters(title);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  pages.forEach((canvas, idx) => {
    if (idx > 0) {
      pdf.addPage("a4", "portrait");
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
    pdf.addImage(dataUrl, "JPEG", 0, 0, 210, 297);
  });

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  pdf.save(`${slug || "catatan-kajian"}.pdf`);
}
