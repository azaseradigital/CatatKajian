import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Bookmark,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { TranscriptSegment } from "../types/kajian";
import type {
  ActionPriority,
  TrainingActionItem,
  TrainingMarker,
  TrainingMarkerKind,
  TrainingQaEntry,
  TrainingQuizQuestion,
  TrainingSmartAnalysis,
} from "../types/pelatihan";
import { MarkdownView } from "./MarkdownView";

const MARKER_META: Record<
  TrainingMarkerKind,
  { label: string; textClass: string }
> = {
  penting: { label: "Poin Penting", textClass: "text-indigo-700" },
  aksi: { label: "Tugas / Aksi", textClass: "text-amber-700" },
  sop: { label: "SOP / Langkah", textClass: "text-teal-700" },
  pertanyaan: { label: "Pertanyaan", textClass: "text-rose-700" },
};

/* ============================================================================
 * 1. TRANSKRIP & PENANDA MOMEN PANEL
 * ============================================================================ */

interface PelatihanTranscriptPanelProps {
  segments: TranscriptSegment[];
  markers: TrainingMarker[];
  interimText: string;
  isRecording: boolean;
  onInsertText: (text: string) => void;
  onInsertAllTranscript: () => void;
  onDeleteMarker: (id: string) => void;
  onClearTranscript: () => void;
}

export const PelatihanTranscriptPanel: React.FC<PelatihanTranscriptPanelProps> = ({
  segments,
  markers,
  interimText,
  isRecording,
  onInsertText,
  onInsertAllTranscript,
  onDeleteMarker,
  onClearTranscript,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [subView, setSubView] = useState<"transcript" | "markers">("transcript");
  const [insertedId, setInsertedId] = useState<string | null>(null);

  useEffect(() => {
    if (subView === "transcript") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [segments.length, interimText, subView]);

  const handleInsert = (id: string, text: string) => {
    onInsertText(text);
    setInsertedId(id);
    setTimeout(() => setInsertedId(null), 1500);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setSubView("transcript")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              subView === "transcript"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Transkrip ({segments.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView("markers")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              subView === "markers"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Penanda ({markers.length})
          </button>
        </div>

        {subView === "transcript" && segments.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onInsertAllTranscript}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span>Sisipkan Semua</span>
            </button>
            <button
              type="button"
              onClick={onClearTranscript}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition-colors cursor-pointer"
              title="Bersihkan transkrip"
              aria-label="Bersihkan transkrip"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {subView === "transcript" ? (
          segments.length === 0 && !interimText ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-700">
                {isRecording
                  ? "Mendengarkan sesi pelatihan..."
                  : "Belum ada transkrip pelatihan"}
              </p>
              <p className="mt-1.5 mx-auto max-w-xs text-xs leading-relaxed text-slate-500">
                Klik <strong>Mulai Rekam Pelatihan</strong> untuk transkrip otomatis,
                atau unggah file audio rekaman rapat/webinar.
              </p>
            </div>
          ) : (
            <>
              {segments.map((seg) => (
                <div
                  key={seg.id}
                  className="group flex items-start gap-3 rounded-lg border border-transparent px-2.5 py-2 hover:border-slate-200 hover:bg-slate-50/70 transition-colors"
                >
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] font-medium text-slate-400 tabular-nums">
                    {seg.timestamp}
                  </span>
                  <p className="flex-1 text-sm leading-relaxed text-slate-800">
                    {seg.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleInsert(seg.id, seg.text)}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-indigo-700 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 hover:bg-indigo-50 transition-opacity cursor-pointer"
                  >
                    {insertedId === seg.id ? "Masuk" : "+ Catatan"}
                  </button>
                </div>
              ))}

              {interimText && (
                <div className="flex items-start gap-3 rounded-lg bg-indigo-50/60 px-2.5 py-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] text-indigo-600">
                    live
                  </span>
                  <p className="flex-1 text-sm italic leading-relaxed text-slate-600">
                    {interimText}
                  </p>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )
        ) : markers.length === 0 ? (
          <div className="py-12 text-center">
            <Bookmark className="mx-auto mb-2 h-5 w-5 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">
              Belum ada penanda momen
            </p>
            <p className="mt-1.5 mx-auto max-w-xs text-xs leading-relaxed text-slate-500">
              Saat trainer menyebut poin penting, tugas, atau SOP, klik tombol
              penanda cepat di bar rekaman untuk menandai waktunya seketika.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {markers.map((marker) => {
              const info = MARKER_META[marker.kind];
              return (
                <li
                  key={marker.id}
                  className="group flex items-start justify-between gap-2.5 py-2.5 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-medium text-slate-500 tabular-nums">
                        {marker.timestamp}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className={`font-semibold ${info.textClass}`}>
                        {info.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-800 leading-relaxed">
                      {marker.note.trim() || "Momen ditandai tanpa catatan tambahan."}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleInsert(
                          marker.id,
                          `- **[${marker.timestamp}] ${info.label}**: ${
                            marker.note.trim() || "Momen penting"
                          }`
                        )
                      }
                      className="rounded px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                    >
                      {insertedId === marker.id ? "Masuk" : "+ Catatan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMarker(marker.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      aria-label="Hapus penanda"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. ANALISIS SMART PANEL (Ringkasan Eksekutif, Modul Materi, Istilah/Tools)
 * ============================================================================ */

interface PelatihanAnalysisPanelProps {
  analysis: TrainingSmartAnalysis | null;
  isLoading: boolean;
  error: string | null;
  hasContent: boolean;
  appliedRecently: boolean;
  onGenerate: () => void;
  onApplyToNotes: () => void;
}

export const PelatihanAnalysisPanel: React.FC<PelatihanAnalysisPanelProps> = ({
  analysis,
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
            Analisis Smart Pelatihan
          </h3>
          {analysis?.generatedAt && (
            <p className="text-xs text-slate-500">
              Diperbarui{" "}
              {new Date(analysis.generatedAt).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {analysis && (
            <button
              type="button"
              onClick={onApplyToNotes}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {appliedRecently ? (
                <>
                  <Check className="h-3.5 w-3.5 text-indigo-700" />
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>
              {isLoading
                ? "Menganalisis..."
                : analysis
                ? "Analisis Ulang"
                : "Analisis Smart"}
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
          <div className="space-y-4 animate-pulse" aria-label="Menyusun analisis pelatihan">
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
            </div>
          </div>
        ) : !analysis ? (
          <div className="py-10 text-center">
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              Ubah rekaman dan catatan pelatihan menjadi modul terstruktur,
              langkah SOP, daftar tindak lanjut otomatis, dan kuis pemahaman
              dalam satu klik.
            </p>
            <button
              type="button"
              disabled={!hasContent}
              onClick={onGenerate}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-45 transition-colors cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Jalankan Analisis Smart</span>
            </button>
            {!hasContent && (
              <p className="mt-2 text-xs text-slate-400">
                Mulai rekam pelatihan, unggah audio, atau tulis catatan terlebih dahulu.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                Ringkasan Eksekutif
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">
                {analysis.ringkasanEksekutif}
              </p>
            </section>

            {analysis.tujuanPembelajaran.length > 0 && (
              <section className="border-t border-slate-200 pt-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                  Tujuan Pembelajaran
                </h4>
                <ul className="mt-2.5 space-y-1.5 pl-4 list-disc text-sm leading-relaxed text-slate-700">
                  {analysis.tujuanPembelajaran.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {analysis.modulMateri.length > 0 && (
              <section className="border-t border-slate-200 pt-4 space-y-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                  Modul &amp; Kerangka Materi ({analysis.modulMateri.length})
                </h4>
                <div className="divide-y divide-slate-100">
                  {analysis.modulMateri.map((mod, idx) => (
                    <div key={idx} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                      <h5 className="text-sm font-semibold text-slate-900">
                        {String(idx + 1).padStart(2, "0")}. {mod.judul}
                      </h5>
                      <p className="text-xs leading-relaxed text-slate-600">
                        {mod.ringkasan}
                      </p>
                      {mod.poinKunci.length > 0 && (
                        <ul className="space-y-1 pl-4 list-disc text-xs leading-relaxed text-slate-700">
                          {mod.poinKunci.map((p, pIdx) => (
                            <li key={pIdx}>{p}</li>
                          ))}
                        </ul>
                      )}
                      {mod.langkahPraktis.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[11px] font-semibold text-indigo-800">
                            Langkah Praktis / SOP:
                          </span>
                          <ol className="mt-1 space-y-1 pl-4 list-decimal text-xs leading-relaxed text-slate-700">
                            {mod.langkahPraktis.map((step, sIdx) => (
                              <li key={sIdx}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {analysis.istilahKunci.length > 0 && (
              <section className="border-t border-slate-200 pt-4">
                <h4 className="text-xs font-semibold tracking-wide text-slate-500">
                  Framework, Tools &amp; Istilah Kunci
                </h4>
                <dl className="mt-2.5 divide-y divide-slate-100">
                  {analysis.istilahKunci.map((term, idx) => (
                    <div key={idx} className="py-2 first:pt-0 last:pb-0">
                      <dt className="text-sm font-semibold text-slate-900">
                        {term.istilah}
                      </dt>
                      <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        {term.penjelasan}
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

/* ============================================================================
 * 3. RENCANA TINDAK LANJUT (ACTION ITEMS CHECKLIST) PANEL
 * ============================================================================ */

interface PelatihanActionPlanPanelProps {
  items: TrainingActionItem[];
  onToggleItem: (id: string) => void;
  onAddItem: (task: string, priority: ActionPriority, dueHint: string) => void;
  onDeleteItem: (id: string) => void;
  onInsertChecklistToNotes: () => void;
}

const PRIORITY_COLOR: Record<ActionPriority, string> = {
  Tinggi: "text-red-700 font-semibold",
  Sedang: "text-amber-700 font-medium",
  Rendah: "text-slate-500 font-medium",
};

export const PelatihanActionPlanPanel: React.FC<PelatihanActionPlanPanelProps> = ({
  items,
  onToggleItem,
  onAddItem,
  onDeleteItem,
  onInsertChecklistToNotes,
}) => {
  const [newTask, setNewTask] = useState("");
  const [priority, setPriority] = useState<ActionPriority>("Sedang");
  const [dueHint, setDueHint] = useState("");
  const [copied, setCopied] = useState(false);

  const completedCount = items.filter((i) => i.done).length;
  const pct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    onAddItem(newTask.trim(), priority, dueHint.trim() || "Minggu ini");
    setNewTask("");
    setDueHint("");
  };

  const handleCopyList = async () => {
    const text = items
      .map(
        (i) =>
          `- [${i.done ? "x" : " "}] ${i.task} (${i.priority}${
            i.dueHint ? ` · ${i.dueHint}` : ""
          })`
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Rencana Tindak Lanjut
            </h3>
            <p className="text-xs text-slate-500 tabular-nums">
              {items.length > 0
                ? `${completedCount} dari ${items.length} selesai (${pct}%)`
                : "Diekstrak otomatis dari Analisis Smart atau tambah manual"}
            </p>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyList}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-indigo-700" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copied ? "Tersalin" : "Salin"}</span>
              </button>
              <button
                type="button"
                onClick={onInsertChecklistToNotes}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-50 cursor-pointer"
              >
                + Catatan
              </button>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-700 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        <form onSubmit={handleAdd} className="space-y-2 pt-0.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Tambah tugas tindak lanjut..."
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newTask.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 text-[11px]">
              {(["Tinggi", "Sedang", "Rendah"] as ActionPriority[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setPriority(lvl)}
                  className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                    priority === lvl
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={dueHint}
              onChange={(e) => setDueHint(e.target.value)}
              placeholder="Target waktu (mis. Jumat ini)"
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
            />
          </div>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              Belum ada daftar tindak lanjut
            </p>
            <p className="mt-1.5 mx-auto max-w-xs text-xs leading-relaxed text-slate-500">
              Jalankan <strong>Analisis Smart</strong> agar AI otomatis
              mengekstrak action plan dari pelatihan, atau tambahkan tugas Anda
              secara manual di atas.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li
                key={item.id}
                className="group flex items-start gap-2.5 py-2.5 first:pt-0"
              >
                <button
                  type="button"
                  onClick={() => onToggleItem(item.id)}
                  className="mt-0.5 shrink-0 text-slate-400 hover:text-indigo-700 cursor-pointer"
                  aria-label={
                    item.done ? "Tandai belum selesai" : "Tandai selesai"
                  }
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-indigo-700" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-snug ${
                      item.done
                        ? "line-through text-slate-400"
                        : "text-slate-800"
                    }`}
                  >
                    {item.task}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <span className={PRIORITY_COLOR[item.priority]}>
                      Prioritas {item.priority}
                    </span>
                    {item.owner && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>PIC: {item.owner}</span>
                      </>
                    )}
                    {item.dueHint && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Target: {item.dueHint}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="shrink-0 rounded p-1 text-slate-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-opacity cursor-pointer"
                  aria-label="Hapus tugas"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. KUIS EVALUASI PEMAHAMAN (INTERACTIVE SMART QUIZ)
 * ============================================================================ */

interface PelatihanQuizPanelProps {
  questions: TrainingQuizQuestion[];
  isLoadingAnalysis: boolean;
  hasContent: boolean;
  onGenerateAnalysis: () => void;
}

export const PelatihanQuizPanel: React.FC<PelatihanQuizPanelProps> = ({
  questions,
  isLoadingAnalysis,
  hasContent,
  onGenerateAnalysis,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>(
    {}
  );

  // Reset selections when question set changes
  useEffect(() => {
    setSelectedAnswers({});
  }, [questions]);

  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = questions.reduce((acc, q) => {
    return acc + (selectedAnswers[q.id] === q.jawabanIndex ? 1 : 0);
  }, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Kuis Evaluasi Mandiri
          </h3>
          <p className="text-xs text-slate-500 tabular-nums">
            {questions.length > 0
              ? `Terjawab ${answeredCount}/${questions.length} · Benar ${correctCount}`
              : "Uji pemahaman materi pelatihan secara interaktif"}
          </p>
        </div>

        {questions.length > 0 && answeredCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedAnswers({})}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Ulangi</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {questions.length === 0 ? (
          <div className="py-10 text-center">
            <HelpCircle className="mx-auto mb-2 h-5 w-5 text-slate-400" />
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              Kuis evaluasi otomatis dibuat dari poin-poin penting rekaman
              pelatihan Anda untuk memastikan materi benar-benar dipahami.
            </p>
            <button
              type="button"
              disabled={isLoadingAnalysis || !hasContent}
              onClick={onGenerateAnalysis}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-45 transition-colors cursor-pointer"
            >
              {isLoadingAnalysis ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>Buat Kuis via Analisis Smart</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {questions.map((q, qIdx) => {
              const picked = selectedAnswers[q.id];
              const hasPicked = typeof picked === "number";
              return (
                <div
                  key={q.id}
                  className="border-b border-slate-200 pb-5 last:border-b-0 last:pb-0 space-y-2.5"
                >
                  <p className="text-sm font-semibold text-slate-900 leading-snug">
                    {qIdx + 1}. {q.pertanyaan}
                  </p>
                  <div className="space-y-1.5">
                    {q.pilihan.map((opt, optIdx) => {
                      const isCorrect = optIdx === q.jawabanIndex;
                      const isSelected = picked === optIdx;

                      let btnStyle =
                        "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
                      if (hasPicked) {
                        if (isCorrect) {
                          btnStyle =
                            "border-teal-600 bg-teal-50 text-teal-900 font-medium";
                        } else if (isSelected && !isCorrect) {
                          btnStyle = "border-red-400 bg-red-50 text-red-800";
                        } else {
                          btnStyle = "border-slate-200 bg-white text-slate-400";
                        }
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [q.id]: optIdx,
                            }))
                          }
                          className={`w-full rounded-lg border px-3 py-2 text-left text-xs leading-relaxed transition-colors cursor-pointer ${btnStyle}`}
                        >
                          <span className="font-mono font-semibold mr-2">
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  {hasPicked && q.pembahasan && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-xs leading-relaxed text-slate-700">
                      <span className="font-semibold text-slate-900">
                        {picked === q.jawabanIndex ? "Tepat: " : "Pembahasan: "}
                      </span>
                      {q.pembahasan}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. TANYA MATERI & GENERATOR DOKUMEN KERJA (SMART ASK)
 * ============================================================================ */

const SMART_ASK_PRESETS = [
  "Susun draft SOP langkah demi langkah dari materi pelatihan ini",
  "Buatkan email ringkas laporan hasil pelatihan untuk atasan/tim",
  "Berikan contoh penerapan nyata di tempat kerja dari framework yang dibahas",
  "Buat daftar pertanyaan follow-up untuk ditanyakan ke trainer",
];

interface PelatihanAskPanelProps {
  history: TrainingQaEntry[];
  isLoading: boolean;
  error: string | null;
  hasContent: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onAsk: (question: string, useWebSearch: boolean) => Promise<void>;
  onInsertAnswer: (markdown: string) => void;
}

export const PelatihanAskPanel: React.FC<PelatihanAskPanelProps> = ({
  history,
  isLoading,
  error,
  hasContent,
  inputRef,
  onAsk,
  onInsertAnswer,
}) => {
  const [question, setQuestion] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    const q = question.trim();
    setQuestion("");
    await onAsk(q, useWebSearch);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-3.5 py-3 sm:px-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Asisten Materi Pelatihan
            </h3>
            <p className="text-xs text-slate-500">
              Tanya ulang materi, buat draft SOP, atau laporan pasca-pelatihan.
            </p>
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-700 focus:ring-indigo-600"
            />
            <Globe className="h-3 w-3 text-slate-500" />
            <span>Rujukan Web</span>
          </label>
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Tulis pertanyaan atau instruksi (mis. buat SOP...)"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 sm:py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span>Kirim</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {SMART_ASK_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={isLoading || !hasContent}
              onClick={() => onAsk(preset, useWebSearch)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-45 transition-colors text-left cursor-pointer"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {isLoading && (
          <div className="space-y-2.5 animate-pulse">
            <div className="h-3.5 w-1/2 rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-100" />
            <div className="h-3 w-5/6 rounded bg-slate-100" />
          </div>
        )}

        {history.length === 0 && !isLoading ? (
          <div className="py-10 text-center">
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              Pilih salah satu pintasan di atas atau tulis pertanyaan sendiri
              untuk mengubah rekaman pelatihan menjadi SOP, email laporan, atau
              studi kasus kerja.
            </p>
          </div>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              className="border-b border-slate-200 pb-5 last:border-b-0 last:pb-0 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-indigo-900">
                  {entry.question}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onInsertAnswer(entry.answerMarkdown);
                    setInsertedId(entry.id);
                    setTimeout(() => setInsertedId(null), 1600);
                  }}
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {insertedId === entry.id ? "Disisipkan" : "+ Catatan"}
                </button>
              </div>
              <MarkdownView content={entry.answerMarkdown} />
              {entry.sources.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Sumber Online:
                  </span>
                  <ul className="space-y-1">
                    {entry.sources.map((src) => (
                      <li key={src.uri}>
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-indigo-700 hover:underline break-all"
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
          ))
        )}
      </div>
    </div>
  );
};
