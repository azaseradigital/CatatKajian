import { jsPDF } from "jspdf";
import type { TrainingMarkerKind, TrainingSession } from "../types/pelatihan";

const MARKER_LABELS: Record<TrainingMarkerKind, string> = {
  penting: "Poin Penting",
  aksi: "Tugas / Aksi",
  sop: "SOP / Langkah",
  pertanyaan: "Pertanyaan",
};

export function buildPelatihanMarkdownContent(session: TrainingSession): string {
  const title = session.title.trim() || "Catatan Pelatihan";
  const meta = [
    session.category ? `Kategori: ${session.category}` : "",
    session.trainer.trim() ? `Trainer: ${session.trainer.trim()}` : "",
    session.organizer.trim() ? `Penyelenggara: ${session.organizer.trim()}` : "",
    session.date.trim() ? `Tanggal: ${session.date.trim()}` : "",
    session.sourceUrl?.trim()
      ? `Sumber (${session.sourcePlatform || "Link"}): ${session.sourceUrl.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const sections: string[] = [`# ${title}`];
  if (meta) sections.push(meta);

  if (session.notes.trim()) {
    sections.push(session.notes.trim());
  }

  if (session.analysis) {
    const a = session.analysis;
    const lines = ["## Ringkasan Eksekutif", "", a.ringkasanEksekutif];

    if (a.tujuanPembelajaran.length > 0) {
      lines.push(
        "",
        "### Tujuan Pembelajaran",
        ...a.tujuanPembelajaran.map((item) => `- ${item}`)
      );
    }

    if (a.modulMateri.length > 0) {
      lines.push("", "## Modul & Kerangka Materi");
      a.modulMateri.forEach((mod, idx) => {
        lines.push("", `### ${idx + 1}. ${mod.judul}`, "", mod.ringkasan);
        if (mod.poinKunci.length > 0) {
          lines.push("", "**Poin Kunci:**", ...mod.poinKunci.map((p) => `- ${p}`));
        }
        if (mod.langkahPraktis.length > 0) {
          lines.push(
            "",
            "**Langkah Praktis / SOP:**",
            ...mod.langkahPraktis.map((step, sIdx) => `${sIdx + 1}. ${step}`)
          );
        }
      });
    }

    if (a.istilahKunci.length > 0) {
      lines.push(
        "",
        "## Istilah, Tools & Framework Kunci",
        ...a.istilahKunci.map((t) => `- **${t.istilah}**: ${t.penjelasan}`)
      );
    }

    sections.push(lines.join("\n"));
  }

  if (session.actionItems.length > 0) {
    sections.push(
      [
        "## Rencana Tindak Lanjut (Action Plan)",
        "",
        ...session.actionItems.map((item) => {
          const check = item.done ? "x" : " ";
          const details = [
            `Prioritas: ${item.priority}`,
            item.owner ? `PIC: ${item.owner}` : "",
            item.dueHint ? `Target: ${item.dueHint}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return `- [${check}] ${item.task}${details ? ` _(${details})_` : ""}`;
        }),
      ].join("\n")
    );
  }

  if (session.markers.length > 0) {
    sections.push(
      [
        "## Penanda Momen Penting",
        "",
        ...session.markers.map(
          (m) =>
            `- **[${m.timestamp}] ${MARKER_LABELS[m.kind]}**: ${
              m.note.trim() || "Momen ditandai saat rekaman"
            }`
        ),
      ].join("\n")
    );
  }

  if (session.segments.length > 0) {
    sections.push(
      [
        "## Lampiran Transkrip Suara",
        "",
        ...session.segments.map((seg) => `- **[${seg.timestamp}]** ${seg.text}`),
      ].join("\n")
    );
  }

  return sections.join("\n\n");
}

export async function exportPelatihanToPdf(
  session: TrainingSession,
  includeTranscript = false
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const marginX = 18;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - marginX * 2;
  let y = 20;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 20) {
      doc.addPage("a4", "portrait");
      y = 20;
    }
  };

  const writeWrapped = (
    text: string,
    opts?: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      color?: [number, number, number];
      indent?: number;
      lineGap?: number;
      after?: number;
    }
  ) => {
    const size = opts?.size ?? 10;
    const style = opts?.style ?? "normal";
    const color = opts?.color ?? [51, 65, 85];
    const indent = opts?.indent ?? 0;
    const lineGap = opts?.lineGap ?? size * 0.48;
    const after = opts?.after ?? 2.2;

    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);

    const clean = text.replace(/\*\*/g, "").replace(/`/g, "");
    const lines = doc.splitTextToSize(clean, contentWidth - indent) as string[];
    for (const line of lines) {
      ensureSpace(lineGap + 2);
      doc.text(line, marginX + indent, y);
      y += lineGap;
    }
    y += after;
  };

  const writeSectionHeading = (title: string) => {
    y += 3;
    ensureSpace(14);
    writeWrapped(title, {
      size: 13,
      style: "bold",
      color: [15, 23, 42],
      after: 1.5,
    });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 4;
  };

  const title = session.title.trim() || "Catatan Pelatihan";

  writeWrapped(`LAPORAN PELATIHAN · ${session.category.toUpperCase()}`, {
    size: 8.5,
    style: "bold",
    color: [67, 56, 202],
    after: 1.5,
  });

  writeWrapped(title, {
    size: 18,
    style: "bold",
    color: [15, 23, 42],
    lineGap: 7.5,
    after: 2,
  });

  const meta = [
    session.trainer.trim() ? `Trainer: ${session.trainer.trim()}` : "",
    session.organizer.trim() ? `Penyelenggara: ${session.organizer.trim()}` : "",
    session.date.trim() ? `Tanggal: ${session.date.trim()}` : "",
  ]
    .filter(Boolean)
    .join("   |   ");

  if (meta) {
    writeWrapped(meta, { size: 9.5, color: [71, 85, 105], after: 3 });
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 6;

  if (session.notes.trim()) {
    writeSectionHeading("Catatan Utama Pelatihan");
    const paragraphs = session.notes.split(/\r?\n/);
    for (const rawLine of paragraphs) {
      const line = rawLine.trim();
      if (!line) {
        y += 2;
        continue;
      }
      if (line.startsWith("### ")) {
        writeWrapped(line.slice(4), {
          size: 11,
          style: "bold",
          color: [15, 23, 42],
          after: 1.5,
        });
      } else if (line.startsWith("## ") || line.startsWith("# ")) {
        writeWrapped(line.replace(/^#+\s+/, ""), {
          size: 12,
          style: "bold",
          color: [15, 23, 42],
          after: 2,
        });
      } else if (/^[-*]\s+/.test(line)) {
        writeWrapped(`• ${line.replace(/^[-*]\s+/, "")}`, {
          indent: 3,
          after: 1.4,
        });
      } else {
        writeWrapped(line, { after: 2 });
      }
    }
  }

  if (session.analysis) {
    writeSectionHeading("Ringkasan Eksekutif & Modul Materi");
    writeWrapped(session.analysis.ringkasanEksekutif, { after: 3 });

    if (session.analysis.tujuanPembelajaran.length > 0) {
      writeWrapped("Tujuan Pembelajaran:", {
        size: 10.5,
        style: "bold",
        color: [15, 23, 42],
        after: 1.5,
      });
      session.analysis.tujuanPembelajaran.forEach((item) => {
        writeWrapped(`• ${item}`, { indent: 3, after: 1.2 });
      });
      y += 2;
    }

    session.analysis.modulMateri.forEach((mod, idx) => {
      writeWrapped(`${idx + 1}. ${mod.judul}`, {
        size: 11,
        style: "bold",
        color: [15, 23, 42],
        after: 1.2,
      });
      writeWrapped(mod.ringkasan, { indent: 2, after: 1.5 });
      mod.poinKunci.forEach((p) => {
        writeWrapped(`• ${p}`, { indent: 5, after: 1 });
      });
      mod.langkahPraktis.forEach((step, sIdx) => {
        writeWrapped(`${sIdx + 1}. ${step}`, {
          indent: 5,
          color: [30, 41, 59],
          after: 1,
        });
      });
      y += 2;
    });

    if (session.analysis.istilahKunci.length > 0) {
      writeSectionHeading("Istilah, Tools & Framework Kunci");
      session.analysis.istilahKunci.forEach((term) => {
        writeWrapped(`${term.istilah}: ${term.penjelasan}`, { after: 1.8 });
      });
    }
  }

  if (session.actionItems.length > 0) {
    writeSectionHeading("Rencana Tindak Lanjut (Action Plan)");
    session.actionItems.forEach((item) => {
      const box = item.done ? "[SELESAI]" : "[ ]";
      const metaParts = [
        item.priority,
        item.owner ? `PIC: ${item.owner}` : "",
        item.dueHint ? `Target: ${item.dueHint}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      writeWrapped(`${box} ${item.task} (${metaParts})`, {
        indent: 2,
        after: 1.8,
      });
    });
  }

  if (session.markers.length > 0) {
    writeSectionHeading("Penanda Momen Penting");
    session.markers.forEach((m) => {
      writeWrapped(
        `[${m.timestamp}] ${MARKER_LABELS[m.kind]}: ${
          m.note.trim() || "Momen penting ditandai"
        }`,
        { indent: 2, size: 9.5, after: 1.5 }
      );
    });
  }

  if (includeTranscript && session.segments.length > 0) {
    writeSectionHeading("Lampiran Transkrip Suara");
    session.segments.forEach((seg) => {
      writeWrapped(`[${seg.timestamp}] ${seg.text}`, {
        size: 9,
        color: [71, 85, 105],
        after: 1.5,
      });
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 15, pageWidth - marginX, pageHeight - 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Rekam Pelatihan — ${title.slice(0, 52)}`,
      marginX,
      pageHeight - 10
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 10,
      { align: "right" }
    );
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  doc.save(`pelatihan-${slug || "catatan"}.pdf`);
}
