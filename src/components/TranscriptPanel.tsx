import React, { useEffect, useRef } from "react";
import { ArrowDownLeft, Copy, Eraser } from "lucide-react";
import type { TranscriptSegment } from "../types/kajian";

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  interimText: string;
  isRecording: boolean;
  isPaused: boolean;
  onInsertSegment: (text: string) => void;
  onAppendAllToNotes: () => void;
  onClearTranscript: () => void;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  segments,
  interimText,
  isRecording,
  isPaused,
  onInsertSegment,
  onAppendAllToNotes,
  onClearTranscript,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments.length, interimText]);

  const hasTranscript = segments.length > 0 || interimText.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3.5 py-3 sm:px-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">
            Transkrip Suara Real-Time
          </h3>
          <p className="text-xs text-slate-500 tabular-nums">
            {segments.length} segmen terekam
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {segments.length > 0 && (
            <>
              <button
                type="button"
                onClick={onAppendAllToNotes}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowDownLeft className="h-3.5 w-3.5" />
                <span>Salin ke Catatan</span>
              </button>
              <button
                type="button"
                onClick={onClearTranscript}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Kosongkan transkrip"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>Bersihkan</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5">
        {!hasTranscript ? (
          <div className="py-10 text-center">
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              {isRecording
                ? isPaused
                  ? "Rekaman sedang dijeda. Tekan Lanjutkan untuk meneruskan penangkapan suara."
                  : "Mendengarkan suara... Silakan mulai berbicara atau dekatkan mikrofon ke sumber audio kajian."
                : "Tekan 'Mulai Rekam Suara' untuk menangkap ucapan pemateri menjadi teks secara langsung, atau unggah rekaman audio."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map((seg) => (
              <div
                key={seg.id}
                className="group flex items-start justify-between gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 sm:px-3.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] font-medium text-slate-400 tabular-nums">
                    [{seg.timestamp}]
                  </span>
                  <p
                    dir="auto"
                    className="mt-0.5 text-sm leading-relaxed text-slate-800 break-words"
                  >
                    {seg.text}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onInsertSegment(seg.text)}
                  className="shrink-0 rounded-md px-2 py-1.5 text-[11px] font-medium text-teal-800 opacity-100 sm:opacity-70 sm:group-hover:opacity-100 hover:bg-teal-50 transition-opacity cursor-pointer"
                  title="Sisipkan baris ini ke catatan"
                >
                  <span className="inline-flex items-center gap-1">
                    <Copy className="h-3 w-3" />
                    <span>Sisipkan</span>
                  </span>
                </button>
              </div>
            ))}

            {interimText.trim() && (
              <div className="rounded-lg border border-teal-200 bg-teal-50/50 px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-teal-700">
                  Menangkap ucapan...
                </span>
                <p
                  dir="auto"
                  className="mt-0.5 text-sm leading-relaxed text-slate-700 italic"
                >
                  {interimText}
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};
