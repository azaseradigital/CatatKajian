import React, { useEffect, useState } from "react";
import { Download, Loader2, Printer, X } from "lucide-react";
import type { KajianNote } from "../types/kajian";
import { exportKajianToPdf, type PdfExportOptions } from "../utils/pdfExport";
import { isEmbeddedIframe } from "../utils/googleAuth";
import { KajianDocumentContent } from "./KajianDocumentContent";

interface ExportPdfModalProps {
  isOpen: boolean;
  note: KajianNote;
  options: PdfExportOptions;
  onChangeOptions: (next: PdfExportOptions) => void;
  onClose: () => void;
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  isOpen,
  note,
  options,
  onChangeOptions,
  onClose,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasSummary = Boolean(note.summary);
  const hasEnrichment = Boolean(note.enrichment?.markdown);
  const hasTranscript = note.segments.length > 0;
  const hasAnySelectedContent =
    (options.includeNotes && note.notes.trim().length > 0) ||
    (options.includeSummary && hasSummary) ||
    (options.includeEnrichment && hasEnrichment) ||
    (options.includeTranscript && hasTranscript);

  const handleDownloadPdf = async () => {
    setError(null);
    setIsGenerating(true);
    try {
      await exportKajianToPdf(note, options);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal membuat file PDF. Coba gunakan tombol Cetak."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-pdf-title"
    >
      <div className="flex max-h-[94vh] sm:max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-lg">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2
                id="export-pdf-title"
                className="font-sans text-base font-semibold text-slate-900"
              >
                Pratinjau &amp; Unduh PDF Kajian
              </h2>
              <p className="text-xs text-slate-500">
                Pilih bagian yang disertakan lalu unduh sebagai file A4 PDF atau
                cetak langsung.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0 cursor-pointer"
              aria-label="Tutup jendela ekspor PDF"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isEmbeddedIframe()) {
                  setError(
                    "Cetak langsung dibatasi di mode pratinjau. Klik 'Unduh File PDF' di sebelahnya atau buka aplikasi di tab baru."
                  );
                  return;
                }
                window.print();
              }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak / Print</span>
            </button>

            <button
              type="button"
              disabled={isGenerating || !hasAnySelectedContent}
              onClick={handleDownloadPdf}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{isGenerating ? "Menyusun PDF..." : "Unduh File PDF"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hidden sm:inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              aria-label="Tutup jendela ekspor PDF"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Section Checkboxes */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">Sertakan:</span>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeNotes}
              onChange={(e) =>
                onChangeOptions({ ...options, includeNotes: e.target.checked })
              }
              className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Catatan Utama</span>
          </label>

          <label
            className={`inline-flex items-center gap-2 ${
              hasSummary ? "cursor-pointer" : "opacity-45 cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              disabled={!hasSummary}
              checked={options.includeSummary && hasSummary}
              onChange={(e) =>
                onChangeOptions({
                  ...options,
                  includeSummary: e.target.checked,
                })
              }
              className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Ringkasan AI</span>
          </label>

          <label
            className={`inline-flex items-center gap-2 ${
              hasEnrichment ? "cursor-pointer" : "opacity-45 cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              disabled={!hasEnrichment}
              checked={options.includeEnrichment && hasEnrichment}
              onChange={(e) =>
                onChangeOptions({
                  ...options,
                  includeEnrichment: e.target.checked,
                })
              }
              className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Pelengkap &amp; Rujukan Online</span>
          </label>

          <label
            className={`inline-flex items-center gap-2 ${
              hasTranscript ? "cursor-pointer" : "opacity-45 cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              disabled={!hasTranscript}
              checked={options.includeTranscript && hasTranscript}
              onChange={(e) =>
                onChangeOptions({
                  ...options,
                  includeTranscript: e.target.checked,
                })
              }
              className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Transkrip Suara ({note.segments.length})</span>
          </label>
        </div>

        {error && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {/* Simulated A4 Sheet Preview */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto max-w-[794px] rounded-lg border border-slate-200 bg-white px-4 py-6 sm:px-14 sm:py-12">
            {!hasAnySelectedContent ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Belum ada konten terpilih untuk diekspor ke PDF. Tulis catatan,
                buat ringkasan, atau centang bagian yang tersedia.
              </div>
            ) : (
              <KajianDocumentContent note={note} options={options} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
