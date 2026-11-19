import React, { useEffect, useRef, useState } from "react";
import {
  FileAudio,
  Link2,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
} from "lucide-react";
import type { SpeechLanguage } from "../types/kajian";
import { formatDuration } from "../utils/audioPcm";
import { AudioPlaybackPlayer } from "./AudioPlaybackPlayer";

interface LiveCaptureBarProps {
  isRecording: boolean;
  isPaused: boolean;
  isConnecting: boolean;
  isUploadingAudio: boolean;
  isImportingLink: boolean;
  elapsedSeconds: number;
  audioLevel: number;
  language: SpeechLanguage;
  captureError: string | null;
  linkNotice: string | null;
  captureStatusText: string | null;
  recordedAudioUrl: string | null;
  recordedAudioDurationSeconds?: number;
  recordedAudioSizeBytes?: number;
  recordedAudioLabel?: string;
  audioSavedToDrive?: boolean;
  driveConnected?: boolean;
  isDriveSyncing?: boolean;
  onLanguageChange: (lang: SpeechLanguage) => void;
  onStartRecording: () => void;
  onTogglePause: () => void;
  onStopRecording: () => void;
  onUploadAudioFile: (file: File) => void;
  onTranscribeRecordedAudio: () => void;
  onDownloadRecordedAudio: () => void;
  onSaveRecordedAudioToDrive?: () => void;
  onDiscardRecordedAudio: () => void;
  onImportSocialLink: (url: string, extraNotes?: string) => Promise<boolean>;
  onDismissError: () => void;
  onDismissNotice: () => void;
}

const LANGUAGES: Array<{ value: SpeechLanguage; label: string }> = [
  { value: "auto", label: "Otomatis" },
  { value: "id-ID", label: "Indonesia" },
  { value: "ar-SA", label: "Arab" },
  { value: "en-US", label: "Inggris" },
];

export const LiveCaptureBar: React.FC<LiveCaptureBarProps> = ({
  isRecording,
  isPaused,
  isConnecting,
  isUploadingAudio,
  isImportingLink,
  elapsedSeconds,
  audioLevel,
  language,
  captureError,
  linkNotice,
  captureStatusText,
  recordedAudioUrl,
  recordedAudioDurationSeconds,
  recordedAudioSizeBytes,
  recordedAudioLabel,
  audioSavedToDrive,
  driveConnected,
  isDriveSyncing,
  onLanguageChange,
  onStartRecording,
  onTogglePause,
  onStopRecording,
  onUploadAudioFile,
  onTranscribeRecordedAudio,
  onDownloadRecordedAudio,
  onSaveRecordedAudioToDrive,
  onDiscardRecordedAudio,
  onImportSocialLink,
  onDismissError,
  onDismissNotice,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const socialUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [socialUrl, setSocialUrl] = useState("");
  const [extraNotes, setExtraNotes] = useState("");

  useEffect(() => {
    if (showLinkForm) {
      requestAnimationFrame(() => socialUrlInputRef.current?.focus());
    }
  }, [showLinkForm]);

  const meterBars = [0.22, 0.36, 0.5, 0.68, 0.85, 0.72, 0.54, 0.38];

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socialUrl.trim()) return;
    const ok = await onImportSocialLink(
      socialUrl.trim(),
      extraNotes.trim() || undefined
    );
    if (ok) {
      setSocialUrl("");
      setExtraNotes("");
      setShowLinkForm(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
          {!isRecording ? (
            <button
              type="button"
              onClick={onStartRecording}
              disabled={isConnecting || isUploadingAudio || isImportingLink}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              <span>
                {isConnecting ? "Memulai Mikrofon..." : "Mulai Rekam Suara"}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onTogglePause}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isPaused ? (
                  <>
                    <Play className="h-4 w-4 text-teal-700" />
                    <span>Lanjutkan</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4 text-amber-600" />
                    <span>Jeda</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onStopRecording}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Hentikan</span>
              </button>
            </div>
          )}

          {isRecording && (
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pl-0.5">
              <span className="font-mono text-sm font-medium text-slate-900 tabular-nums">
                {formatDuration(elapsedSeconds)}
              </span>

              <div
                className="flex items-end gap-0.5 h-5"
                aria-label="Level sinyal mikrofon"
              >
                {meterBars.map((weight, idx) => {
                  const activeHeight = isPaused
                    ? 4
                    : Math.max(4, Math.min(20, Math.round(audioLevel * weight * 28)));
                  return (
                    <span
                      key={idx}
                      style={{ height: `${activeHeight}px` }}
                      className={`w-1 rounded-sm transition-[height] duration-75 ${
                        isPaused ? "bg-slate-300" : "bg-teal-600"
                      }`}
                    />
                  );
                })}
              </div>

              <span className="text-xs font-medium text-slate-600">
                {isPaused
                  ? "Rekaman dijeda"
                  : captureStatusText || "Merekam & mentranskripsi"}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full lg:w-auto">
          <div
            className="grid grid-cols-4 sm:flex sm:items-center gap-0.5 rounded-lg bg-slate-100 p-1 w-full sm:w-auto"
            role="group"
            aria-label="Bahasa transkripsi suara"
          >
            {LANGUAGES.map((item) => {
              const active = language === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  disabled={isRecording || isConnecting}
                  onClick={() => onLanguageChange(item.value)}
                  className={`rounded-md px-2 sm:px-2.5 py-1.5 sm:py-1 text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer disabled:cursor-not-allowed ${
                    active
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isRecording || isConnecting || isUploadingAudio || isImportingLink}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isUploadingAudio ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
              ) : (
                <FileAudio className="h-3.5 w-3.5 text-slate-500" />
              )}
              <span>
                {isUploadingAudio ? "Memproses..." : "Unggah Audio"}
              </span>
            </button>

            <button
              type="button"
              disabled={isRecording || isConnecting || isUploadingAudio}
              onClick={() => setShowLinkForm((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                showLinkForm
                  ? "border-teal-700 bg-teal-50 text-teal-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isImportingLink ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
              ) : (
                <Link2 className="h-3.5 w-3.5 text-slate-500" />
              )}
              <span>{isImportingLink ? "Mencatat Link..." : "Link Sosmed"}</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUploadAudioFile(file);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>

      {showLinkForm && (
        <form
          onSubmit={handleLinkSubmit}
          className="border-t border-slate-100 pt-3 space-y-2"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              ref={socialUrlInputRef}
              type="url"
              required
              value={socialUrl}
              onChange={(e) => setSocialUrl(e.target.value)}
              placeholder="Tempel link kajian YouTube, TikTok, Instagram, atau Facebook..."
              className="w-full min-w-0 sm:flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={isImportingLink || !socialUrl.trim()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isImportingLink ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              <span>{isImportingLink ? "Memproses..." : "Catat dari Link"}</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
            <input
              type="text"
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="Tambahan caption/poin (opsional untuk IG/FB/TikTok)..."
              className="w-full min-w-0 sm:flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
            />
            <span className="text-[11px] text-slate-500">
              YouTube · TikTok · Instagram · Facebook
            </span>
          </div>
        </form>
      )}

      {!isRecording && recordedAudioUrl && (
        <AudioPlaybackPlayer
          audioUrl={recordedAudioUrl}
          durationHintSeconds={recordedAudioDurationSeconds}
          fileSizeBytes={recordedAudioSizeBytes}
          fileLabel={recordedAudioLabel}
          isSavedToDrive={audioSavedToDrive}
          driveConnected={driveConnected}
          isSyncingDrive={isDriveSyncing}
          isTranscribing={isUploadingAudio}
          onTranscribeAgain={onTranscribeRecordedAudio}
          onDownloadLocal={onDownloadRecordedAudio}
          onSaveToDrive={onSaveRecordedAudioToDrive}
          onDiscard={onDiscardRecordedAudio}
        />
      )}

      {linkNotice && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900">
          <span>{linkNotice}</span>
          <button
            type="button"
            onClick={onDismissNotice}
            className="font-medium text-amber-800 hover:underline shrink-0 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {captureError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800"
        >
          <span>{captureError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="font-medium text-red-700 hover:underline shrink-0 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}
    </div>
  );
};
