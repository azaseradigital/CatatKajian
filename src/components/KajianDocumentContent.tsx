import React from "react";
import type { KajianNote } from "../types/kajian";
import type { PdfExportOptions } from "../utils/pdfExport";
import { MarkdownView } from "./MarkdownView";

interface KajianDocumentContentProps {
  note: KajianNote;
  options: PdfExportOptions;
}

export const KajianDocumentContent: React.FC<KajianDocumentContentProps> = ({
  note,
  options,
}) => {
  const title = note.title.trim() || "Catatan Kajian";
  const metadata = [
    note.speaker.trim() ? `Pemateri: ${note.speaker.trim()}` : "",
    note.location.trim() ? `Majelis: ${note.location.trim()}` : "",
    note.date.trim() ? `Tanggal: ${note.date.trim()}` : "",
    note.sourceUrl?.trim()
      ? `Sumber (${note.sourcePlatform || "Link"}): ${note.sourceUrl.trim()}`
      : "",
  ].filter(Boolean);

  return (
    <article className="text-slate-900 space-y-6">
      <header className="border-b border-slate-300 pb-4 space-y-2">
        <p className="text-[11px] font-semibold tracking-wider text-teal-800">
          CATATAN KAJIAN
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {metadata.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-600">
            {metadata.map((item, idx) => (
              <React.Fragment key={item}>
                {idx > 0 && (
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                )}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </header>

      {options.includeNotes && note.notes.trim() && (
        <section className="space-y-3">
          <MarkdownView content={note.notes} />
        </section>
      )}

      {options.includeSummary && note.summary && (
        <section className="space-y-4 border-t border-slate-200 pt-5">
          <h2 className="font-display text-xl font-semibold text-slate-900">
            Ringkasan Kajian
          </h2>
          <p className="text-[15px] leading-[1.7] text-slate-700">
            {note.summary.ringkasanSingkat}
          </p>

          {note.summary.poinUtama.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-900">
                Poin Pembahasan Utama
              </h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-[15px] leading-relaxed text-slate-700">
                {note.summary.poinUtama.map((poin, idx) => (
                  <li key={idx}>{poin}</li>
                ))}
              </ol>
            </div>
          )}

          {note.summary.nasihatPraktis.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-900">
                Amal &amp; Hikmah Praktis
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed text-slate-700">
                {note.summary.nasihatPraktis.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {note.summary.istilahKunci.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Istilah &amp; Konsep Kunci
              </h3>
              <dl className="divide-y divide-slate-100 border-t border-b border-slate-200">
                {note.summary.istilahKunci.map((term, idx) => (
                  <div key={idx} className="py-2">
                    <dt className="text-sm font-semibold text-slate-900">
                      {term.istilah}
                    </dt>
                    <dd className="text-sm text-slate-600">{term.makna}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      )}

      {options.includeEnrichment && note.enrichment?.markdown && (
        <section className="space-y-4 border-t border-slate-200 pt-5">
          <h2 className="font-display text-xl font-semibold text-slate-900">
            Pelengkap &amp; Dalil Rujukan Online
          </h2>
          <MarkdownView content={note.enrichment.markdown} />

          {note.enrichment.sources.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <h3 className="text-xs font-semibold tracking-wide text-slate-500">
                Sumber Referensi Online
              </h3>
              <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-600">
                {note.enrichment.sources.map((src) => (
                  <li key={src.uri} className="break-all">
                    {src.title} — {src.uri}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {options.includeTranscript && note.segments.length > 0 && (
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h2 className="font-display text-xl font-semibold text-slate-900">
            Lampiran Transkrip Suara
          </h2>
          <div className="space-y-2 text-sm leading-relaxed text-slate-700">
            {note.segments.map((seg) => (
              <p key={seg.id} dir="auto">
                <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums mr-2">
                  [{seg.timestamp}]
                </span>
                <span>{seg.text}</span>
              </p>
            ))}
          </div>
        </section>
      )}
    </article>
  );
};
