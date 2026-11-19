import React, { useState } from "react";
import { Check, ExternalLink, Globe, Loader2 } from "lucide-react";
import type { KajianEnrichment } from "../types/kajian";
import { MarkdownView } from "./MarkdownView";

interface EnrichmentPanelProps {
  enrichment: KajianEnrichment | null;
  isLoading: boolean;
  error: string | null;
  hasContent: boolean;
  insertedRecently: boolean;
  queryInputRef?: React.RefObject<HTMLInputElement | null>;
  onEnrich: (customQuery?: string) => void;
  onInsertToNotes: () => void;
}

const QUICK_PROMPTS = [
  "Lengkapi ayat Al-Qur'an & hadits yang disebut beserta perawinya",
  "Jelaskan istilah bahasa Arab & nama kitab rujukan dalam kajian ini",
  "Lengkapi bagian transkrip atau poin pembahasan yang terpotong",
];

export const EnrichmentPanel: React.FC<EnrichmentPanelProps> = ({
  enrichment,
  isLoading,
  error,
  hasContent,
  insertedRecently,
  queryInputRef,
  onEnrich,
  onInsertToNotes,
}) => {
  const [customQuery, setCustomQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEnrich(customQuery.trim() || undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-3.5 py-3 sm:px-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">
              Pelengkap &amp; Rujukan Online
            </h3>
            <p className="text-xs text-slate-500">
              Verifikasi ayat, matan hadits, dan konteks kitab secara online.
            </p>
          </div>
          {enrichment && (
            <button
              type="button"
              onClick={onInsertToNotes}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {insertedRecently ? (
                <>
                  <Check className="h-3.5 w-3.5 text-teal-700" />
                  <span>Disisipkan</span>
                </>
              ) : (
                <span>Sisipkan ke Catatan</span>
              )}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            ref={queryInputRef}
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Fokus pelengkap khusus (opsional), mis: hadits niat..."
            className="w-full min-w-0 sm:flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || (!hasContent && !customQuery.trim())}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 sm:py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            <span>{isLoading ? "Mencari..." : "Lengkapi Online"}</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isLoading || !hasContent}
              onClick={() => {
                setCustomQuery(prompt);
                onEnrich(prompt);
              }}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-45 transition-colors text-left cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4 animate-pulse" aria-label="Melengkapi secara online">
            <div className="h-4 w-1/2 rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-11/12 rounded bg-slate-100" />
              <div className="h-3 w-3/4 rounded bg-slate-100" />
            </div>
            <div className="h-px bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3 w-5/6 rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        ) : !enrichment ? (
          <div className="py-10 text-center">
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              Saat ustadz menyebutkan potongan ayat, hadits, atau kitab dengan
              cepat, fitur ini mencari referensi terpercaya secara online untuk
              melengkapi catatan Anda.
            </p>
            <button
              type="button"
              disabled={!hasContent && !customQuery.trim()}
              onClick={() => onEnrich(customQuery.trim() || undefined)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-45 transition-colors cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Lengkapi Catatan Sekarang</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <MarkdownView content={enrichment.markdown} />

            {enrichment.sources.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                  Sumber Online Terkait ({enrichment.sources.length})
                </h4>
                <ul className="mt-2 space-y-1.5">
                  {enrichment.sources.map((src) => (
                    <li key={src.uri}>
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 hover:underline break-all"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span>{src.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
