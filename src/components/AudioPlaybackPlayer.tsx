import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Cloud,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import { formatDuration } from "../utils/audioPcm";

interface AudioPlaybackPlayerProps {
  audioUrl: string;
  durationHintSeconds?: number;
  fileSizeBytes?: number;
  fileLabel?: string;
  isSavedToDrive?: boolean;
  driveConnected?: boolean;
  isSyncingDrive?: boolean;
  isTranscribing?: boolean;
  onTranscribeAgain: () => void;
  onDownloadLocal: () => void;
  onSaveToDrive?: () => void;
  onDiscard: () => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const;

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AudioPlaybackPlayer: React.FC<AudioPlaybackPlayerProps> = ({
  audioUrl,
  durationHintSeconds = 0,
  fileSizeBytes,
  fileLabel,
  isSavedToDrive = false,
  driveConnected = false,
  isSyncingDrive = false,
  isTranscribing = false,
  onTranscribeAgain,
  onDownloadLocal,
  onSaveToDrive,
  onDiscard,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);

  // Reset player state when audioUrl changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setMediaDuration(0);
    setPlaybackRate(1);
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.playbackRate = 1;
    }
  }, [audioUrl]);

  const effectiveDuration =
    Number.isFinite(mediaDuration) && mediaDuration > 0
      ? mediaDuration
      : durationHintSeconds > 0
      ? durationHintSeconds
      : 0;

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      try {
        el.playbackRate = playbackRate;
        await el.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (nextSeconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(effectiveDuration || nextSeconds, nextSeconds));
    el.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const skipBy = (delta: number) => {
    const el = audioRef.current;
    const base = el ? el.currentTime : currentTime;
    handleSeek(base + delta);
  };

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(
      playbackRate as (typeof SPEED_OPTIONS)[number]
    );
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  const sizeLabel = formatFileSize(fileSizeBytes);
  const progressPct =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))
      : 0;

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2.5">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setMediaDuration(d);
          }
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setMediaDuration(d);
          }
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="font-semibold text-slate-800 truncate max-w-[220px] sm:max-w-xs">
            {fileLabel?.trim() || "Putar Ulang Rekaman Kajian"}
          </span>
          {sizeLabel && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-500 tabular-nums">{sizeLabel}</span>
            </>
          )}
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          {isSavedToDrive ? (
            <span className="inline-flex items-center gap-1 text-teal-800 font-medium">
              <Check className="h-3 w-3" />
              <span>Tersimpan di Drive</span>
            </span>
          ) : (
            <span className="text-amber-700 font-medium">
              Pratinjau sebelum disimpan
            </span>
          )}
        </div>

        <span className="font-mono text-xs text-slate-600 tabular-nums shrink-0">
          {formatDuration(currentTime)} /{" "}
          {effectiveDuration > 0 ? formatDuration(effectiveDuration) : "--:--"}
        </span>
      </div>

      {/* Built-in Interactive Player Bar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white hover:bg-teal-800 transition-colors cursor-pointer"
            aria-label={isPlaying ? "Jeda pemutaran audio" : "Putar rekaman audio"}
            title={isPlaying ? "Jeda" : "Putar ulang rekaman"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current translate-x-[1px]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => skipBy(-10)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="Mundur 10 detik"
            title="Mundur 10 detik"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => skipBy(10)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="Maju 10 detik"
            title="Maju 10 detik"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Interactive Timeline Seek Bar */}
        <div className="relative flex-1 min-w-[140px] flex items-center">
          <div className="relative w-full h-1.5 rounded-full bg-slate-200 overflow-hidden pointer-events-none">
            <div
              className="h-full bg-teal-700 transition-[width] duration-75"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={effectiveDuration > 0 ? effectiveDuration : 1}
            step={0.1}
            value={Math.min(currentTime, effectiveDuration || 1)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            disabled={effectiveDuration <= 0}
            aria-label="Geser posisi pemutaran audio"
            className="absolute inset-0 w-full h-6 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={cycleSpeed}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors tabular-nums cursor-pointer"
            title="Ubah kecepatan pemutaran"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label={isMuted ? "Aktifkan suara" : "Bisukan suara"}
            title={isMuted ? "Aktifkan suara" : "Bisukan"}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-slate-400" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Actions for reviewing, transcribing, and saving the recording */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDownloadLocal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Unduh file rekaman audio ke perangkat"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Unduh Audio</span>
          </button>

          {driveConnected && !isSavedToDrive && onSaveToDrive && (
            <button
              type="button"
              disabled={isSyncingDrive}
              onClick={onSaveToDrive}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSyncingDrive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Cloud className="h-3.5 w-3.5" />
              )}
              <span>{isSyncingDrive ? "Menyimpan..." : "Simpan Audio ke Drive"}</span>
            </button>
          )}

          <button
            type="button"
            disabled={isTranscribing}
            onClick={onTranscribeAgain}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isTranscribing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            <span>Transkrip Ulang (AI)</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Hapus pratinjau rekaman ini"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Buang</span>
        </button>
      </div>
    </div>
  );
};
