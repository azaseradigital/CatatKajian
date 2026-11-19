import React from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import type { KajianSummary } from "../types/kajian";

interface SummaryPanelProps {
  summary: KajianSummary | null;
  isLoading: boolean;
  error: string | null;
  hasContent: boolean;
  appliedRecently: boolean;
  onGenerate: () => void;
  onApplyToNotes: (mode: "replace" | "append") => void;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  summary,
  isLoading,
  error,
  hasContent,
  appliedRecently,
  onGenerate,
  onApplyToNotes,
}) => {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Ringkasan Terstruktur
          </h3>
          {summary?.generatedAt && (
            <p className="text-xs text-slate-500">
              Diperbarui{" "}
              {new Date(summary.generatedAt).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {summary && (
            <button
              type="button"
              onClick={() => onApplyToNotes("append")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {appliedRecently ? (
                <>
                  <Check className="h-3.5 w-3.5 text-teal-700" />
                  <span>Disisipkan</span>
                </>
              ) : (
                <span>Sisipkan ke Catatan</span>
              )}
            </button>
          )}
          <button
            type="button"
            disabled={isLoading || !hasContent}
            onClick={onGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>
              {isLoading
                ? "Meringkas..."
                : summary
                ? "Ringkas Ulang"
                : "Buat Ringkasan"}
            </span>
          </button>
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
          <div className="space-y-4 animate-pulse" aria-label="Membuat ringkasan">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-5/6 rounded bg-slate-100" />
              <div className="h-3 w-4/6 rounded bg-slate-100" />
            </div>
            <div className="h-px bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3 w-3/4 rounded bg-slate-100" />
              <div className="h-3 w-4/5 rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        ) : !summary ? (
          <div className="py-10 text-center">
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              Ringkas transkrip suara dan catatan kajian menjadi intisari
              pembahasan, nasihat praktis, dan daftar istilah penting.
            </p>
            <button
              type="button"
              disabled={!hasContent}
              onClick={onGenerate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-45 transition-colors cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Buat Ringkasan Kajian</span>
            </button>
            {!hasContent && (
              <p className="mt-2 text-xs text-slate-400">
                Mulai rekam suara atau tulis catatan terlebih dahulu.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                Intisari Utama
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">
                {summary.ringkasanSingkat}
              </p>
            </section>

            {summary.poinUtama.length > 0 && (
              <section className="border-t border-slate-200 pt-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                  Poin Pembahasan
                </h4>
                <ol className="mt-2.5 space-y-2 pl-4 list-decimal text-sm leading-relaxed text-slate-700">
                  {summary.poinUtama.map((poin, idx) => (
                    <li key={idx}>{poin}</li>
                  ))}
                </ol>
              </section>
            )}

            {summary.nasihatPraktis.length > 0 && (
              <section className="border-t border-slate-200 pt-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                  Amal &amp; Hikmah Praktis
                </h4>
                <ul className="mt-2.5 space-y-2 pl-4 list-disc text-sm leading-relaxed text-slate-700">
                  {summary.nasihatPraktis.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {summary.istilahKunci.length > 0 && (
              <section className="border-t border-slate-200 pt-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                  Istilah &amp; Konsep Kunci
                </h4>
                <dl className="mt-2.5 divide-y divide-slate-100">
                  {summary.istilahKunci.map((term, idx) => (
                    <div key={idx} className="py-2 first:pt-0 last:pb-0">
                      <dt className="text-sm font-semibold text-slate-900">
                        {term.istilah}
                      </dt>
                      <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        {term.makna}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
