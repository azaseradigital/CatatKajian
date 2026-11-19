import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileAudio,
  FileDown,
  Link2,
  Loader2,
  Mic,
  Pause,
  Pencil,
  Play,
  Square,
} from "lucide-react";
import type { SpeechLanguage, TranscriptSegment } from "../types/kajian";
import type {
  ActionPriority,
  TrainingActionItem,
  TrainingCategory,
  TrainingMarkerKind,
  TrainingSession,
  TrainingSmartAnalysis,
} from "../types/pelatihan";
import {
  downsampleTo16kPcmBase64,
  fileToBase64,
  formatDuration,
} from "../utils/audioPcm";
import {
  getAccessToken,
  GoogleAuthFriendlyError,
} from "../utils/googleAuth";
import {
  createDriveFolder,
  extractDriveFolderId,
  findOrCreateDriveFolder,
  listDriveFolderFiles,
  savePelatihanSessionToDrive,
  uploadAudioToDrive,
  verifyDriveFolder,
  type DriveFileInfo,
} from "../utils/googleDrive";
import {
  buildPelatihanMarkdownContent,
  exportPelatihanToPdf,
} from "../utils/pelatihanPdfExport";
import { AudioPlaybackPlayer } from "./AudioPlaybackPlayer";
import { DriveConfirmModal } from "./DriveConfirmModal";
import { GoogleDriveBar, type DriveSaveState } from "./GoogleDriveBar";
import { MarkdownView } from "./MarkdownView";
import { PelatihanSidebar } from "./PelatihanSidebar";
import type { AppModule } from "./SideMenuNav";
import {
  PelatihanActionPlanPanel,
  PelatihanAnalysisPanel,
  PelatihanAskPanel,
  PelatihanQuizPanel,
  PelatihanTranscriptPanel,
} from "./PelatihanSmartPanels";

const TRAINING_STORAGE_KEY = "catatpelatihan_sessions_v1";
const TRAINING_DRIVE_FOLDER_KEY = "catatpelatihan_drive_folder_v1";
const TRAINING_AUTOSAVE_CONFIRMED_KEY = "catatpelatihan_autosave_confirmed_v1";
const DEFAULT_TRAINING_FOLDER_NAME = "Rekam Pelatihan";

type TrainingRightTab = "transcript" | "analysis" | "actions" | "quiz" | "ask";

const CATEGORIES: TrainingCategory[] = [
  "Workshop",
  "Seminar",
  "Bootcamp",
  "In-House",
  "Webinar",
];

const LANGUAGES: Array<{ value: SpeechLanguage; label: string }> = [
  { value: "auto", label: "Otomatis" },
  { value: "id-ID", label: "Indonesia" },
  { value: "en-US", label: "Inggris" },
];

const QUICK_MARKERS: Array<{ kind: TrainingMarkerKind; label: string }> = [
  { kind: "penting", label: "Poin Penting" },
  { kind: "aksi", label: "Tugas / Aksi" },
  { kind: "sop", label: "SOP / Langkah" },
  { kind: "pertanyaan", label: "Pertanyaan" },
];

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function createEmptyTrainingSession(): TrainingSession {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `pelatihan-${Date.now()}`,
    title: "",
    trainer: "",
    organizer: "",
    category: "Workshop",
    date: getTodayLabel(),
    notes: "",
    segments: [],
    markers: [],
    actionItems: [],
    analysis: null,
    qaHistory: [],
    updatedAt: Date.now(),
  };
}

function loadInitialSessions(): TrainingSession[] {
  try {
    const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return [createEmptyTrainingSession()];
}

function pickSupportedRecorderMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const mime of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(mime)
    ) {
      return mime;
    }
  }
  return "";
}

interface PelatihanWorkspaceProps {
  onSelectModule: (module: AppModule) => void;
  mobileSidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
  createSignal: number;
  driveConnected: boolean;
  driveUserEmail: string | null;
  isLoggingInDrive: boolean;
  onGoogleSignIn: () => Promise<{ accessToken: string; email: string | null } | null>;
  onGoogleSignInRedirect: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onDriveAuthExpired: () => void;
}

export const PelatihanWorkspace: React.FC<PelatihanWorkspaceProps> = ({
  onSelectModule,
  mobileSidebarOpen,
  onCloseMobileSidebar,
  createSignal,
  driveConnected,
  driveUserEmail,
  isLoggingInDrive,
  onGoogleSignIn,
  onGoogleSignInRedirect,
  onGoogleLogout,
  onDriveAuthExpired,
}) => {
  const [sessions, setSessions] = useState<TrainingSession[]>(loadInitialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[0]?.id ?? ""
  );

  const [rightTab, setRightTab] = useState<TrainingRightTab>("transcript");
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [copiedNote, setCopiedNote] = useState(false);
  const [analysisApplied, setAnalysisApplied] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Audio recording & live transcription state
  const [language, setLanguage] = useState<SpeechLanguage>("auto");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isImportingLink, setIsImportingLink] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureStatusText, setCaptureStatusText] = useState<string | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioMeta, setRecordedAudioMeta] = useState<{
    durationSeconds: number;
    sizeBytes: number;
    label: string;
    mimeType: string;
  } | null>(null);

  // Quick Marker & Link inputs
  const [showMarkerBar, setShowMarkerBar] = useState(false);
  const [markerNote, setMarkerNote] = useState("");
  const [markerFeedback, setMarkerFeedback] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkExtraNotes, setLinkExtraNotes] = useState("");

  // Smart AI state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Google Drive sync state (dedicated folder & auto-save for Rekam Pelatihan)
  const [driveFolderId, setDriveFolderId] = useState<string>(() => {
    try {
      return localStorage.getItem(TRAINING_DRIVE_FOLDER_KEY) || "";
    } catch {
      return "";
    }
  });
  const [driveFolderName, setDriveFolderName] = useState<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [driveSyncProgress, setDriveSyncProgress] = useState(0);
  const [driveSyncStage, setDriveSyncStage] = useState<string | null>(null);
  const [driveSyncNotice, setDriveSyncNotice] = useState<string | null>(null);
  const [syncedSignatures, setSyncedSignatures] = useState<Record<string, string>>(
    {}
  );
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSuggestNewTab, setDriveSuggestNewTab] = useState(false);
  const [driveSuggestRedirect, setDriveSuggestRedirect] = useState(false);
  const [driveFolderFiles, setDriveFolderFiles] = useState<DriveFileInfo[]>([]);
  const [audioSavedToDrive, setAudioSavedToDrive] = useState(false);
  const [confirmModalMode, setConfirmModalMode] = useState<
    null | "enable_autosave" | "overwrite_session"
  >(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const audioUploadedToDriveRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const recordingTargetIdRef = useRef<string>("");
  const speechEngineWorkingRef = useRef(false);
  const autoSaveEnabledRef = useRef(false);
  const driveFolderIdRef = useRef(driveFolderId);
  const lastSyncedSignatureRef = useRef<Record<string, string>>({});
  const sessionsRef = useRef(sessions);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const notesCardRef = useRef<HTMLElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toolsCardRef = useRef<HTMLElement | null>(null);
  const askInputRef = useRef<HTMLInputElement | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const lastCreateSignalRef = useRef<number>(createSignal);
  const [focusedSection, setFocusedSection] = useState<"notes" | "tools" | null>(
    null
  );

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    autoSaveEnabledRef.current = autoSaveEnabled;
  }, [autoSaveEnabled]);

  useEffect(() => {
    driveFolderIdRef.current = driveFolderId;
    try {
      if (driveFolderId) {
        localStorage.setItem(TRAINING_DRIVE_FOLDER_KEY, driveFolderId);
      } else {
        localStorage.removeItem(TRAINING_DRIVE_FOLDER_KEY);
      }
    } catch {
      // ignore
    }
  }, [driveFolderId]);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (activeSession && activeSession.id !== activeSessionId) {
      setActiveSessionId(activeSession.id);
    }
  }, [activeSession, activeSessionId]);

  useEffect(() => {
    try {
      localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // ignore quota error
    }
  }, [sessions]);

  useEffect(() => {
    if (showLinkForm) {
      requestAnimationFrame(() => linkInputRef.current?.focus());
    }
  }, [showLinkForm]);

  const pulseSectionFocus = useCallback((section: "notes" | "tools") => {
    setFocusedSection(section);
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => {
      setFocusedSection(null);
    }, 1100);
  }, []);

  const focusWorkspaceTarget = useCallback(
    (target: TrainingRightTab | "read" | "edit") => {
      if (target === "read") {
        setEditorMode("preview");
        pulseSectionFocus("notes");
        requestAnimationFrame(() => {
          notesCardRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          notesCardRef.current?.focus({ preventScroll: true });
        });
        return;
      }
      if (target === "edit") {
        setEditorMode("edit");
        pulseSectionFocus("notes");
        requestAnimationFrame(() => {
          notesCardRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          requestAnimationFrame(() => {
            notesTextareaRef.current?.focus({ preventScroll: true });
          });
        });
        return;
      }

      setRightTab(target);
      pulseSectionFocus("tools");
      requestAnimationFrame(() => {
        toolsCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        if (target === "ask") {
          requestAnimationFrame(() => {
            askInputRef.current?.focus({ preventScroll: true });
          });
        } else {
          toolsCardRef.current?.focus({ preventScroll: true });
        }
      });
    },
    [pulseSectionFocus]
  );

  const updateSessionById = useCallback(
    (id: string, updater: (prev: TrainingSession) => TrainingSession) => {
      setSessions((prev) =>
        prev.map((item) =>
          item.id === id ? { ...updater(item), updatedAt: Date.now() } : item
        )
      );
    },
    []
  );

  const updateActiveSession = useCallback(
    (updater: (prev: TrainingSession) => TrainingSession) => {
      if (!activeSession) return;
      updateSessionById(activeSession.id, updater);
    },
    [activeSession, updateSessionById]
  );

  const handleLocalDriveAuthExpired = useCallback(() => {
    setAutoSaveEnabled(false);
    setDriveError(
      "Sesi Google Drive berakhir. Klik 'Sign in with Google' untuk menyambungkan kembali."
    );
    onDriveAuthExpired();
  }, [onDriveAuthExpired]);

  const ensureAndRefreshTrainingFolder = useCallback(
    async (token: string, preferredFolderId?: string): Promise<string | null> => {
      const targetId = (preferredFolderId ?? driveFolderIdRef.current).trim();
      try {
        let folder: DriveFileInfo;
        if (targetId) {
          folder = await verifyDriveFolder(token, targetId);
        } else {
          folder = await findOrCreateDriveFolder(
            token,
            DEFAULT_TRAINING_FOLDER_NAME
          );
          setDriveFolderId(folder.id);
          driveFolderIdRef.current = folder.id;
        }
        setDriveFolderName(folder.name);
        const files = await listDriveFolderFiles(token, folder.id);
        setDriveFolderFiles(files);
        setDriveError(null);
        return folder.id;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Gagal memeriksa folder Drive pelatihan.";
        if (msg === "UNAUTHORIZED_DRIVE") {
          handleLocalDriveAuthExpired();
        } else {
          setDriveFolderName(null);
          setDriveError(msg);
        }
        return null;
      }
    },
    [handleLocalDriveAuthExpired]
  );

  const handlePostSignInTrainingDrive = useCallback(
    async (token: string, promptIfUnconfirmed: boolean) => {
      const resolvedFolderId = await ensureAndRefreshTrainingFolder(token);
      if (!resolvedFolderId) return;
      try {
        if (localStorage.getItem(TRAINING_AUTOSAVE_CONFIRMED_KEY) === "true") {
          setAutoSaveEnabled(true);
          return;
        }
      } catch {
        // ignore
      }
      if (promptIfUnconfirmed) {
        setConfirmModalMode("enable_autosave");
      }
    },
    [ensureAndRefreshTrainingFolder]
  );

  // Sync automatically when user is already signed in via shared Google account
  useEffect(() => {
    if (!driveConnected) {
      setAutoSaveEnabled(false);
      setDriveFolderFiles([]);
      setDriveFolderName(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    void handlePostSignInTrainingDrive(token, false);
  }, [driveConnected, handlePostSignInTrainingDrive]);

  const buildSessionSyncSignature = useCallback(
    (session: TrainingSession): string => {
      return JSON.stringify({
        t: session.title,
        tr: session.trainer,
        o: session.organizer,
        c: session.category,
        d: session.date,
        n: session.notes,
        seg: session.segments.length,
        mk: session.markers.length,
        act: session.actionItems.map((a) => `${a.id}:${a.done}:${a.task}`).join("|"),
        ana: session.analysis?.generatedAt,
        qa: session.qaHistory.length,
        src: session.sourceUrl,
      });
    },
    []
  );

  const hasSessionBody = useCallback((session: TrainingSession): boolean => {
    return (
      session.title.trim().length > 0 ||
      session.notes.trim().length > 0 ||
      session.segments.length > 0 ||
      session.markers.length > 0 ||
      session.actionItems.length > 0 ||
      Boolean(session.analysis)
    );
  }, []);

  const syncTrainingSessionToDrive = useCallback(
    async (
      sessionToSave: TrainingSession,
      options?: { includeRecordedAudio?: boolean; customAudioFile?: File }
    ) => {
      const token = getAccessToken();
      if (!token) {
        handleLocalDriveAuthExpired();
        return;
      }

      const hasNoteBody = hasSessionBody(sessionToSave);
      const hasRecordedAudioToUpload = Boolean(
        options?.includeRecordedAudio &&
          recordedBlobRef.current &&
          !audioUploadedToDriveRef.current
      );
      const hasCustomAudioToUpload = Boolean(options?.customAudioFile);

      if (!hasNoteBody && !hasRecordedAudioToUpload && !hasCustomAudioToUpload) {
        setDriveError(
          "Catatan dan rekaman pelatihan masih kosong. Tulis catatan, rekam audio, atau impor link terlebih dahulu."
        );
        return;
      }

      let targetFolder = driveFolderIdRef.current.trim();
      if (!targetFolder) {
        const resolved = await ensureAndRefreshTrainingFolder(token, "");
        if (!resolved) return;
        targetFolder = resolved;
      }

      const totalSteps =
        (hasNoteBody ? 1 : 0) +
        (hasRecordedAudioToUpload ? 1 : 0) +
        (hasCustomAudioToUpload ? 1 : 0);
      let completedSteps = 0;

      const updateStepProgress = (stepPct: number) => {
        const overall = Math.round(
          ((completedSteps + stepPct / 100) / Math.max(1, totalSteps)) * 100
        );
        setDriveSyncProgress(Math.max(5, Math.min(99, overall)));
      };

      setIsDriveSyncing(true);
      setDriveSyncProgress(5);
      setDriveSyncStage("Menyiapkan unggahan ke Drive...");
      setDriveSyncNotice(null);
      setDriveError(null);

      const uploadedNames: string[] = [];

      try {
        if (hasNoteBody) {
          setDriveSyncStage("Mengunggah catatan pelatihan (.md)...");
          const uploadedNote = await savePelatihanSessionToDrive(
            token,
            sessionToSave,
            targetFolder,
            updateStepProgress
          );
          completedSteps += 1;
          uploadedNames.push(uploadedNote.name);

          const signature = buildSessionSyncSignature(sessionToSave);
          lastSyncedSignatureRef.current[sessionToSave.id] = signature;
          setSyncedSignatures((prev) => ({
            ...prev,
            [sessionToSave.id]: signature,
          }));

          const nowIso = new Date().toISOString();
          updateSessionById(sessionToSave.id, (prev) => ({
            ...prev,
            driveNoteFileId: uploadedNote.id,
            driveNoteWebLink: uploadedNote.webViewLink,
            driveFolderId: targetFolder,
            lastDriveSyncedAt: nowIso,
          }));
        }

        if (hasRecordedAudioToUpload && recordedBlobRef.current) {
          setDriveSyncStage("Mengunggah rekaman audio pelatihan...");
          const uploadedAudio = await uploadAudioToDrive(
            token,
            recordedBlobRef.current,
            sessionToSave.title || sessionToSave.category,
            targetFolder,
            undefined,
            updateStepProgress,
            "Rekaman Pelatihan"
          );
          completedSteps += 1;
          uploadedNames.push(uploadedAudio.name);
          audioUploadedToDriveRef.current = true;
          setAudioSavedToDrive(true);

          if (!hasNoteBody) {
            const nowIso = new Date().toISOString();
            updateSessionById(sessionToSave.id, (prev) => ({
              ...prev,
              driveFolderId: targetFolder,
              lastDriveSyncedAt: nowIso,
            }));
          }
        }

        if (options?.customAudioFile) {
          setDriveSyncStage("Mengunggah file audio pelatihan...");
          const uploadedCustom = await uploadAudioToDrive(
            token,
            options.customAudioFile,
            sessionToSave.title || sessionToSave.category,
            targetFolder,
            options.customAudioFile.name,
            updateStepProgress,
            "Rekaman Pelatihan"
          );
          completedSteps += 1;
          uploadedNames.push(uploadedCustom.name);
          audioUploadedToDriveRef.current = true;
          setAudioSavedToDrive(true);

          if (!hasNoteBody) {
            const nowIso = new Date().toISOString();
            updateSessionById(sessionToSave.id, (prev) => ({
              ...prev,
              driveFolderId: targetFolder,
              lastDriveSyncedAt: nowIso,
            }));
          }
        }

        setDriveSyncStage("Memperbarui daftar file...");
        setDriveSyncProgress(98);
        const files = await listDriveFolderFiles(token, targetFolder);
        setDriveFolderFiles(files);
        setDriveSyncProgress(100);
        setDriveSyncNotice(
          uploadedNames.length > 0
            ? `Tersimpan ke Drive: ${uploadedNames.join(" & ")}`
            : "Tersimpan ke Google Drive."
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Gagal menyimpan pelatihan ke Google Drive.";
        if (msg === "UNAUTHORIZED_DRIVE") {
          handleLocalDriveAuthExpired();
        } else {
          setDriveError(msg);
        }
      } finally {
        setIsDriveSyncing(false);
        setDriveSyncStage(null);
      }
    },
    [
      buildSessionSyncSignature,
      ensureAndRefreshTrainingFolder,
      handleLocalDriveAuthExpired,
      hasSessionBody,
      updateSessionById,
    ]
  );

  // Debounced auto-save to Google Drive when autoSaveEnabled is active
  useEffect(() => {
    if (!autoSaveEnabled || !driveConnected || !activeSession) return;
    if (!hasSessionBody(activeSession)) return;

    const signature = buildSessionSyncSignature(activeSession);
    if (lastSyncedSignatureRef.current[activeSession.id] === signature) {
      return;
    }

    const timer = window.setTimeout(() => {
      void syncTrainingSessionToDrive(activeSession, {
        includeRecordedAudio: false,
      });
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [
    activeSession,
    autoSaveEnabled,
    buildSessionSyncSignature,
    driveConnected,
    hasSessionBody,
    syncTrainingSessionToDrive,
  ]);

  const appendTranscriptSegment = useCallback(
    (targetId: string, rawText: string, customTimestamp?: string) => {
      const cleaned = rawText.replace(/\s+/g, " ").trim();
      if (!cleaned) return;
      const newSeg: TranscriptSegment = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `seg-${Date.now()}-${Math.random()}`,
        timestamp: customTimestamp ?? formatDuration(elapsedRef.current),
        text: cleaned,
        createdAt: Date.now(),
      };
      updateSessionById(targetId, (prev) => ({
        ...prev,
        segments: [...prev.segments, newSeg],
      }));
    },
    [updateSessionById]
  );

  const transcribeAudioBlob = useCallback(
    async (
      blob: Blob,
      targetId: string,
      label?: string
    ): Promise<string | null> => {
      if (blob.size < 1200) return null;
      setIsUploadingAudio(true);
      setCaptureError(null);
      try {
        const base64 = await fileToBase64(blob);
        const mimeType = (blob.type || "audio/webm").split(";")[0];
        const res = await fetch("/api/pelatihan/transcribe-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: base64,
            mimeType,
            language,
          }),
        });
        const data = (await res.json()) as { transcript?: string; error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Gagal mentranskripsikan rekaman pelatihan.");
        }
        const text = (data.transcript ?? "").trim();
        if (text) {
          appendTranscriptSegment(targetId, text, label || "Rekaman");
          setRightTab("transcript");
        }
        return text;
      } catch (err) {
        setCaptureError(
          err instanceof Error
            ? err.message
            : "Gagal memproses transkripsi audio pelatihan."
        );
        return null;
      } finally {
        setIsUploadingAudio(false);
      }
    },
    [appendTranscriptSegment, language]
  );

  const stopAudioPipeline = useCallback(() => {
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    setIsConnecting(false);
    setAudioLevel(0);
    setInterimText("");
    setCaptureStatusText(null);

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const targetId = recordingTargetIdRef.current;
    const hadLiveSpeech = speechEngineWorkingRef.current;
    const capturedDuration = elapsedRef.current;
    mediaRecorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        if (chunks.length > 0) {
          const mime = recorder.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type: mime });
          recordedBlobRef.current = blob;
          audioUploadedToDriveRef.current = false;
          setAudioSavedToDrive(false);
          setRecordedAudioUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          setRecordedAudioMeta({
            durationSeconds: capturedDuration,
            sizeBytes: blob.size,
            label: "Putar Ulang Rekaman Pelatihan",
            mimeType: mime,
          });
          if (!hadLiveSpeech && targetId) {
            void transcribeAudioBlob(blob, targetId, "Rekaman AI");
          }
          // Auto-upload recorded training audio to Google Drive when Auto-Simpan is active
          if (autoSaveEnabledRef.current && getAccessToken() && targetId) {
            const latestSession = sessionsRef.current.find(
              (s) => s.id === targetId
            );
            if (latestSession) {
              void syncTrainingSessionToDrive(latestSession, {
                includeRecordedAudio: true,
              });
            }
          }
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      try {
        recorder.stop();
      } catch {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [syncTrainingSessionToDrive, transcribeAudioBlob]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
      if (isRecordingRef.current) {
        stopAudioPipeline();
      }
    };
  }, [stopAudioPipeline]);

  useEffect(() => {
    return () => {
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
    };
  }, [recordedAudioUrl]);

  const handleCreateNewSession = useCallback(() => {
    if (isRecordingRef.current) {
      stopAudioPipeline();
    }
    const fresh = createEmptyTrainingSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    setEditorMode("edit");
    setAnalysisError(null);
    setAskError(null);
    setCaptureError(null);
    setDriveSyncNotice(null);
    setAudioSavedToDrive(false);
    audioUploadedToDriveRef.current = false;
    setRecordedAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRecordedAudioMeta(null);
    recordedBlobRef.current = null;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      titleInputRef.current?.focus({ preventScroll: true });
    });
  }, [stopAudioPipeline]);

  // Trigger new training session from header CTA
  useEffect(() => {
    if (createSignal !== lastCreateSignalRef.current) {
      lastCreateSignalRef.current = createSignal;
      handleCreateNewSession();
    }
  }, [createSignal, handleCreateNewSession]);

  const startBrowserSpeechFallback = useCallback(
    (targetId: string) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setCaptureStatusText("Merekam audio (transkrip AI otomatis saat berhenti)");
        return;
      }
      try {
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = language === "en-US" ? "en-US" : "id-ID";

        rec.onresult = (event) => {
          if (!isRecordingRef.current || isPausedRef.current) return;
          speechEngineWorkingRef.current = true;
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const transcript = res[0]?.transcript || "";
            if (res.isFinal) {
              appendTranscriptSegment(targetId, transcript);
            } else {
              interim += transcript;
            }
          }
          setInterimText(interim.trim());
        };

        rec.onerror = () => {
          setCaptureStatusText("Merekam audio (transkrip AI saat berhenti)");
        };

        rec.onend = () => {
          if (isRecordingRef.current && !isPausedRef.current) {
            try {
              rec.start();
            } catch {
              // ignore restart race
            }
          }
        };

        rec.start();
        recognitionRef.current = rec;
        setCaptureStatusText("Merekam & mentranskripsi langsung");
      } catch {
        setCaptureStatusText("Merekam audio (transkrip AI saat berhenti)");
      }
    },
    [appendTranscriptSegment, language]
  );

  const handleStartRecording = async () => {
    if (!activeSession || isRecording || isConnecting) return;
    setCaptureError(null);
    setIsConnecting(true);
    speechEngineWorkingRef.current = false;
    recordingTargetIdRef.current = activeSession.id;
    audioUploadedToDriveRef.current = false;
    setAudioSavedToDrive(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mime = pickSupportedRecorderMime();
      recordedChunksRef.current = [];
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(audioCtx.destination);

      isRecordingRef.current = true;
      isPausedRef.current = false;
      elapsedRef.current = 0;
      setElapsedSeconds(0);
      setIsRecording(true);
      setIsPaused(false);
      setIsConnecting(false);
      setRightTab("transcript");

      timerRef.current = window.setInterval(() => {
        if (!isPausedRef.current) {
          elapsedRef.current += 1;
          setElapsedSeconds(elapsedRef.current);
        }
      }, 1000);

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!isRecordingRef.current) return;
        analyser.getByteFrequencyData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
        const avg = sum / dataArr.length / 255;
        setAudioLevel(isPausedRef.current ? 0 : Math.min(1, avg * 2.2));
        rafRef.current = requestAnimationFrame(updateMeter);
      };
      rafRef.current = requestAnimationFrame(updateMeter);

      // Try WebSocket Live API first, fall back to browser speech + final AI audio transcription
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws/transcribe?lang=${encodeURIComponent(
        language
      )}`;

      let wsReady = false;
      let fallbackTriggered = false;
      const triggerFallback = () => {
        if (fallbackTriggered || !isRecordingRef.current) return;
        fallbackTriggered = true;
        startBrowserSpeechFallback(activeSession.id);
      };

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const readyTimeout = window.setTimeout(() => {
        if (!wsReady) {
          try {
            ws.close();
          } catch {
            // ignore
          }
          triggerFallback();
        }
      }, 3500);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            ready?: boolean;
            transcript?: string;
            interimTranscript?: string;
            unsupportedLive?: boolean;
          };
          if (msg.ready) {
            wsReady = true;
            window.clearTimeout(readyTimeout);
            setCaptureStatusText("Transkrip AI langsung aktif");
          }
          if (msg.interimTranscript) {
            speechEngineWorkingRef.current = true;
            setInterimText(msg.interimTranscript);
          }
          if (msg.transcript) {
            speechEngineWorkingRef.current = true;
            setInterimText("");
            appendTranscriptSegment(activeSession.id, msg.transcript);
          }
          if (msg.unsupportedLive) {
            window.clearTimeout(readyTimeout);
            triggerFallback();
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        window.clearTimeout(readyTimeout);
        triggerFallback();
      };

      processor.onaudioprocess = (ev) => {
        if (
          !isRecordingRef.current ||
          isPausedRef.current ||
          !wsReady ||
          ws.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        const channel = ev.inputBuffer.getChannelData(0);
        const pcmBase64 = downsampleTo16kPcmBase64(channel, audioCtx.sampleRate);
        ws.send(JSON.stringify({ audio: pcmBase64 }));
      };
    } catch (err) {
      stopAudioPipeline();
      setCaptureError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Izin mikrofon ditolak. Aktifkan izin mikrofon di browser lalu coba lagi."
          : "Gagal mengakses mikrofon. Pastikan perangkat memiliki mikrofon aktif."
      );
    }
  };

  const handleTogglePause = () => {
    if (!isRecording) return;
    const nextPaused = !isPaused;
    isPausedRef.current = nextPaused;
    setIsPaused(nextPaused);

    if (mediaRecorderRef.current) {
      try {
        if (nextPaused && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.pause();
        } else if (!nextPaused && mediaRecorderRef.current.state === "paused") {
          mediaRecorderRef.current.resume();
        }
      } catch {
        // ignore
      }
    }

    if (recognitionRef.current) {
      try {
        if (nextPaused) recognitionRef.current.stop();
        else recognitionRef.current.start();
      } catch {
        // ignore
      }
    }
  };

  const handleAddMarker = (kind: TrainingMarkerKind) => {
    if (!activeSession) return;
    const timestamp = isRecording
      ? formatDuration(elapsedRef.current)
      : activeSession.segments.length > 0
      ? activeSession.segments[activeSession.segments.length - 1].timestamp
      : new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });

    const newMarker = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `mk-${Date.now()}-${Math.random()}`,
      timestamp,
      kind,
      note: markerNote.trim(),
      createdAt: Date.now(),
    };

    updateActiveSession((prev) => ({
      ...prev,
      markers: [newMarker, ...prev.markers],
    }));

    setMarkerNote("");
    const kindLabel =
      QUICK_MARKERS.find((m) => m.kind === kind)?.label || "Penanda";
    setMarkerFeedback(`${kindLabel} ditandai (${timestamp})`);
    setTimeout(() => setMarkerFeedback(null), 2000);
  };

  const handleUploadAudioFile = async (file: File) => {
    if (!activeSession) return;
    if (file.size > 20 * 1024 * 1024) {
      setCaptureError("Ukuran file audio maksimal 20 MB.");
      return;
    }
    recordedBlobRef.current = file;
    audioUploadedToDriveRef.current = false;
    setAudioSavedToDrive(false);
    setRecordedAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setRecordedAudioMeta({
      durationSeconds: 0,
      sizeBytes: file.size,
      label: file.name,
      mimeType: file.type || "audio/mpeg",
    });
    await transcribeAudioBlob(file, activeSession.id, file.name.slice(0, 18));

    if (autoSaveEnabledRef.current && getAccessToken()) {
      const latest =
        sessionsRef.current.find((s) => s.id === activeSession.id) ??
        activeSession;
      await syncTrainingSessionToDrive(latest, {
        includeRecordedAudio: false,
        customAudioFile: file,
      });
    }
  };

  const handleImportLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !linkUrl.trim() || isImportingLink) return;
    setCaptureError(null);
    setIsImportingLink(true);
    try {
      const res = await fetch("/api/pelatihan/from-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: linkUrl.trim(),
          extraNotes: linkExtraNotes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        title?: string;
        trainer?: string;
        platform?: string;
        sourceUrl?: string;
        notesMarkdown?: string;
        transcriptSegments?: Array<{ timestamp: string; text: string }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengekstrak materi dari tautan.");
      }

      const importedSegments: TranscriptSegment[] = (
        data.transcriptSegments ?? []
      ).map((seg, idx) => ({
        id: `link-${Date.now()}-${idx}`,
        timestamp: seg.timestamp,
        text: seg.text,
        createdAt: Date.now() + idx,
      }));

      updateActiveSession((prev) => ({
        ...prev,
        title: prev.title.trim() ? prev.title : data.title || prev.title,
        trainer: prev.trainer.trim() ? prev.trainer : data.trainer || prev.trainer,
        sourceUrl: data.sourceUrl || linkUrl.trim(),
        sourcePlatform: data.platform || "Web",
        notes: data.notesMarkdown
          ? prev.notes.trim()
            ? `${prev.notes.trim()}\n\n${data.notesMarkdown}`
            : data.notesMarkdown
          : prev.notes,
        segments:
          importedSegments.length > 0
            ? [...prev.segments, ...importedSegments]
            : prev.segments,
      }));

      setLinkUrl("");
      setLinkExtraNotes("");
      setShowLinkForm(false);
    } catch (err) {
      setCaptureError(
        err instanceof Error ? err.message : "Gagal mencatat dari tautan video."
      );
    } finally {
      setIsImportingLink(false);
    }
  };

  const handleRunSmartAnalysis = async () => {
    if (!activeSession || isAnalyzing) return;
    setAnalysisError(null);
    setIsAnalyzing(true);
    setRightTab("analysis");

    try {
      const transcriptText = activeSession.segments
        .map((s) => `[${s.timestamp}] ${s.text}`)
        .join("\n");
      const res = await fetch("/api/pelatihan/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeSession.title,
          trainer: activeSession.trainer,
          organizer: activeSession.organizer,
          category: activeSession.category,
          transcript: transcriptText,
          notes: activeSession.notes,
          markers: activeSession.markers.map((m) => ({
            timestamp: m.timestamp,
            kind: m.kind,
            note: m.note,
          })),
        }),
      });
      const data = (await res.json()) as TrainingSmartAnalysis & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Gagal menjalankan Analisis Smart.");
      }

      updateActiveSession((prev) => {
        // Merge AI-extracted action items without duplicating existing tasks
        const existingLower = new Set(
          prev.actionItems.map((i) => i.task.trim().toLowerCase())
        );
        const newActions: TrainingActionItem[] = (data.tindakLanjut || [])
          .filter((a) => a.task.trim() && !existingLower.has(a.task.trim().toLowerCase()))
          .map((a, idx) => ({
            id: `act-${Date.now()}-${idx}`,
            task: a.task.trim(),
            owner: a.owner || "Peserta",
            dueHint: a.dueHint || "Minggu ini",
            priority: a.priority || "Sedang",
            done: false,
          }));

        return {
          ...prev,
          analysis: data,
          actionItems: [...prev.actionItems, ...newActions],
        };
      });
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Gagal menganalisis sesi pelatihan."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAskAssistant = async (question: string, useWebSearch: boolean) => {
    if (!activeSession || isAsking) return;
    setAskError(null);
    setIsAsking(true);
    try {
      const transcriptText = activeSession.segments
        .map((s) => `[${s.timestamp}] ${s.text}`)
        .join("\n");
      const res = await fetch("/api/pelatihan/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeSession.title,
          trainer: activeSession.trainer,
          category: activeSession.category,
          transcript: transcriptText,
          notes: activeSession.notes,
          question,
          useWebSearch,
        }),
      });
      const data = (await res.json()) as {
        answerMarkdown?: string;
        sources?: Array<{ title: string; uri: string }>;
        createdAt?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Gagal mendapatkan jawaban asisten.");
      }

      updateActiveSession((prev) => ({
        ...prev,
        qaHistory: [
          {
            id: `qa-${Date.now()}`,
            question,
            answerMarkdown: data.answerMarkdown || "",
            sources: data.sources || [],
            createdAt: data.createdAt || new Date().toISOString(),
          },
          ...prev.qaHistory,
        ],
      }));
    } catch (err) {
      setAskError(
        err instanceof Error ? err.message : "Gagal menghubungi asisten materi."
      );
    } finally {
      setIsAsking(false);
    }
  };

  const handleInsertToNotes = (text: string) => {
    if (!text.trim()) return;
    updateActiveSession((prev) => ({
      ...prev,
      notes: prev.notes.trim()
        ? `${prev.notes.trim()}\n\n${text.trim()}`
        : text.trim(),
    }));
  };

  const handleCopyFullNote = async () => {
    if (!activeSession) return;
    try {
      await navigator.clipboard.writeText(
        buildPelatihanMarkdownContent(activeSession)
      );
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadMarkdown = () => {
    if (!activeSession) return;
    const md = buildPelatihanMarkdownContent(activeSession);
    const slug = (activeSession.title || "pelatihan")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pelatihan-${slug || "catatan"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!activeSession || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportPelatihanToPdf(
        activeSession,
        !activeSession.notes.trim() && activeSession.segments.length > 0
      );
    } catch {
      setCaptureError("Gagal menyusun file PDF pelatihan.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadRecordedAudio = () => {
    const blob = recordedBlobRef.current;
    if (!blob) return;
    const ext = blob.type.includes("mp4")
      ? "m4a"
      : blob.type.includes("mpeg")
      ? "mp3"
      : blob.type.includes("wav")
      ? "wav"
      : "webm";
    const slug = (activeSession?.title || "pelatihan")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekaman-pelatihan-${slug || "sesi"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllJson = () => {
    const blob = new Blob([JSON.stringify(sessions, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arsip-pelatihan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportAllJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(
          (item) => item && typeof item.id === "string" && typeof item.notes === "string"
        ) as TrainingSession[];
        if (valid.length > 0) {
          setSessions(valid);
          setActiveSessionId(valid[0].id);
        }
      }
    } catch {
      setCaptureError("File cadangan JSON pelatihan tidak valid.");
    }
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh = createEmptyTrainingSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (id === activeSessionId) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const wordCount = useMemo(() => {
    const t = activeSession?.notes.trim() ?? "";
    return t ? t.split(/\s+/).length : 0;
  }, [activeSession?.notes]);

  const hasContent = Boolean(
    activeSession &&
      (activeSession.notes.trim().length > 0 ||
        activeSession.segments.length > 0 ||
        activeSession.markers.length > 0)
  );

  const openActionCount =
    activeSession?.actionItems.filter((a) => !a.done).length ?? 0;

  const activeDriveSaveState: DriveSaveState = useMemo(() => {
    if (isDriveSyncing) return "syncing";
    if (driveError && driveConnected) return "error";
    if (!activeSession) return "empty";

    const hasBody = hasSessionBody(activeSession);
    const hasPendingAudio = Boolean(recordedAudioUrl && !audioSavedToDrive);

    if (!hasBody && !recordedAudioUrl) {
      return activeSession.lastDriveSyncedAt ? "saved" : "empty";
    }
    if (hasPendingAudio) return "unsaved";
    if (!hasBody && audioSavedToDrive) return "saved";

    if (
      activeSession.lastDriveSyncedAt &&
      driveFolderId &&
      activeSession.driveFolderId === driveFolderId
    ) {
      const currentSig = buildSessionSyncSignature(activeSession);
      const syncedSig = syncedSignatures[activeSession.id];
      if (syncedSig) {
        return syncedSig === currentSig ? "saved" : "unsaved";
      }
      const syncedMs = Date.parse(activeSession.lastDriveSyncedAt);
      if (Number.isFinite(syncedMs) && activeSession.updatedAt <= syncedMs + 3000) {
        return "saved";
      }
    }
    return "unsaved";
  }, [
    activeSession,
    audioSavedToDrive,
    buildSessionSyncSignature,
    driveConnected,
    driveError,
    driveFolderId,
    hasSessionBody,
    isDriveSyncing,
    recordedAudioUrl,
    syncedSignatures,
  ]);

  const meterBars = [0.22, 0.36, 0.5, 0.68, 0.85, 0.72, 0.54, 0.38];

  return (
    <div className="flex flex-1 min-h-0">
      <div className="no-print">
        <PelatihanSidebar
          activeModule="pelatihan"
          onSelectModule={(mod) => {
            if (mod !== "pelatihan" && isRecordingRef.current) {
              stopAudioPipeline();
            }
            onSelectModule(mod);
          }}
          sessions={sessions}
          activeSessionId={activeSession?.id ?? ""}
          onSelectSession={(id) => {
            if (isRecordingRef.current) stopAudioPipeline();
            setActiveSessionId(id);
            setAnalysisError(null);
            setAskError(null);
            setCaptureError(null);
            setDriveSyncNotice(null);
          }}
          onCreateSession={handleCreateNewSession}
          onDeleteSession={handleDeleteSession}
          onExportAll={handleExportAllJson}
          onImportAll={handleImportAllJson}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={onCloseMobileSidebar}
        />
      </div>

      <main className="flex-1 min-w-0 px-3 py-4 sm:px-6 sm:py-5 lg:px-8 max-w-[1320px] mx-auto w-full space-y-4">
        {activeSession && (
          <>
            {/* Clean Training Title & Metadata */}
            <section className="space-y-1.5">
              <input
                ref={titleInputRef}
                type="text"
                value={activeSession.title}
                onChange={(e) =>
                  updateActiveSession((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                placeholder="Judul Pelatihan (mis. Manajemen Proyek Agile & OKR Tim)"
                aria-label="Judul Pelatihan"
                className="w-full bg-transparent font-display text-xl sm:text-3xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-300 focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                <select
                  value={activeSession.category}
                  onChange={(e) =>
                    updateActiveSession((prev) => ({
                      ...prev,
                      category: e.target.value as TrainingCategory,
                    }))
                  }
                  aria-label="Kategori pelatihan"
                  className="bg-transparent text-xs font-semibold text-indigo-800 focus:outline-none cursor-pointer py-0.5 pr-1"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <input
                  type="text"
                  value={activeSession.trainer}
                  onChange={(e) =>
                    updateActiveSession((prev) => ({
                      ...prev,
                      trainer: e.target.value,
                    }))
                  }
                  placeholder="Nama Trainer / Instruktur"
                  aria-label="Nama Trainer"
                  className="w-full sm:w-auto sm:min-w-[175px] bg-transparent text-slate-800 placeholder:text-slate-400 border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                />
                <span aria-hidden="true" className="hidden sm:inline text-slate-300">
                  ·
                </span>
                <input
                  type="text"
                  value={activeSession.organizer}
                  onChange={(e) =>
                    updateActiveSession((prev) => ({
                      ...prev,
                      organizer: e.target.value,
                    }))
                  }
                  placeholder="Instansi / Penyelenggara"
                  aria-label="Penyelenggara Pelatihan"
                  className="min-w-0 flex-1 sm:flex-none sm:min-w-[175px] bg-transparent text-slate-700 placeholder:text-slate-400 border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                />
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <input
                  type="text"
                  value={activeSession.date}
                  onChange={(e) =>
                    updateActiveSession((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  aria-label="Tanggal Pelatihan"
                  className="w-24 sm:w-28 shrink-0 bg-transparent text-slate-500 tabular-nums border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                />
                {activeSession.sourceUrl && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline text-slate-300">
                      ·
                    </span>
                    <a
                      href={activeSession.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-800 hover:underline py-0.5"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span>Sumber: {activeSession.sourcePlatform || "Video"}</span>
                    </a>
                  </>
                )}
              </div>
            </section>

            {/* Smart Training Recorder & Moment Tagging Card */}
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 sm:gap-3">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={handleStartRecording}
                      disabled={isConnecting || isUploadingAudio || isImportingLink}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isConnecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                      <span>
                        {isConnecting
                          ? "Memulai Mikrofon..."
                          : "Mulai Rekam Pelatihan"}
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleTogglePause}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isPaused ? (
                          <>
                            <Play className="h-4 w-4 text-indigo-700" />
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
                        onClick={stopAudioPipeline}
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
                          const h = isPaused
                            ? 4
                            : Math.max(
                                4,
                                Math.min(20, Math.round(audioLevel * weight * 28))
                              );
                          return (
                            <span
                              key={idx}
                              style={{ height: `${h}px` }}
                              className={`w-1 rounded-sm transition-[height] duration-75 ${
                                isPaused ? "bg-slate-300" : "bg-indigo-600"
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
                    className="grid grid-cols-3 sm:flex sm:items-center gap-0.5 rounded-lg bg-slate-100 p-1 w-full sm:w-auto"
                    role="group"
                    aria-label="Bahasa pelatihan"
                  >
                    {LANGUAGES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        disabled={isRecording || isConnecting}
                        onClick={() => setLanguage(item.value)}
                        className={`rounded-md px-2.5 py-1.5 sm:py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed ${
                          language === item.value
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={
                        isRecording || isConnecting || isUploadingAudio || isImportingLink
                      }
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {isUploadingAudio ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-700" />
                      ) : (
                        <FileAudio className="h-3.5 w-3.5 text-slate-500" />
                      )}
                      <span>{isUploadingAudio ? "Proses..." : "Audio"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isRecording || isConnecting || isUploadingAudio}
                      onClick={() => setShowLinkForm((p) => !p)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                        showLinkForm
                          ? "border-indigo-700 bg-indigo-50 text-indigo-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {isImportingLink ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-700" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5 text-slate-500" />
                      )}
                      <span>Link Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowMarkerBar((p) => !p)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        showMarkerBar || isRecording
                          ? "border-indigo-700 bg-indigo-50 text-indigo-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      title="Tandai momen penting, tugas, atau SOP saat pelatihan"
                    >
                      <Bookmark className="h-3.5 w-3.5 text-indigo-700" />
                      <span>Tandai</span>
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
                        void handleUploadAudioFile(file);
                        e.target.value = "";
                      }
                    }}
                  />
                </div>
              </div>

              {/* Smart Quick-Marker Strip (auto-shown while recording or toggled) */}
              {(isRecording || showMarkerBar) && (
                <div className="flex flex-col md:flex-row md:items-center gap-2 border-t border-slate-100 pt-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 shrink-0">
                    <Bookmark className="h-3.5 w-3.5 text-indigo-700" />
                    <span>Tandai Momen:</span>
                  </div>
                  <input
                    type="text"
                    value={markerNote}
                    onChange={(e) => setMarkerNote(e.target.value)}
                    placeholder="Catatan singkat momen ini (opsional), lalu klik kategori..."
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {QUICK_MARKERS.map((m) => (
                      <button
                        key={m.kind}
                        type="button"
                        onClick={() => handleAddMarker(m.kind)}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/70 hover:text-indigo-900 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        + {m.label}
                      </button>
                    ))}
                  </div>
                  {markerFeedback && (
                    <span className="text-xs font-medium text-indigo-700 shrink-0">
                      {markerFeedback}
                    </span>
                  )}
                </div>
              )}

              {/* Optional Webinar/Video Link Form */}
              {showLinkForm && (
                <form
                  onSubmit={handleImportLink}
                  className="border-t border-slate-100 pt-3 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      ref={linkInputRef}
                      type="url"
                      required
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="Tempel link video pelatihan / webinar YouTube atau media lain..."
                      className="w-full min-w-0 sm:flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isImportingLink || !linkUrl.trim()}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {isImportingLink ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {isImportingLink ? "Memproses..." : "Catat dari Link"}
                      </span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={linkExtraNotes}
                    onChange={(e) => setLinkExtraNotes(e.target.value)}
                    placeholder="Konteks tambahan pelatihan (opsional)..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
                  />
                </form>
              )}

              {/* Built-in Audio Playback Preview */}
              {!isRecording && recordedAudioUrl && (
                <AudioPlaybackPlayer
                  audioUrl={recordedAudioUrl}
                  durationHintSeconds={recordedAudioMeta?.durationSeconds}
                  fileSizeBytes={recordedAudioMeta?.sizeBytes}
                  fileLabel={recordedAudioMeta?.label}
                  isSavedToDrive={audioSavedToDrive}
                  driveConnected={driveConnected}
                  isSyncingDrive={isDriveSyncing}
                  isTranscribing={isUploadingAudio}
                  onTranscribeAgain={() => {
                    if (recordedBlobRef.current && activeSession) {
                      void transcribeAudioBlob(
                        recordedBlobRef.current,
                        activeSession.id,
                        "Transkrip Ulang"
                      );
                    }
                  }}
                  onDownloadLocal={handleDownloadRecordedAudio}
                  onSaveToDrive={() => {
                    if (activeSession && recordedBlobRef.current) {
                      void syncTrainingSessionToDrive(activeSession, {
                        includeRecordedAudio: true,
                      });
                    }
                  }}
                  onDiscard={() => {
                    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
                    setRecordedAudioUrl(null);
                    setRecordedAudioMeta(null);
                    recordedBlobRef.current = null;
                    audioUploadedToDriveRef.current = false;
                    setAudioSavedToDrive(false);
                  }}
                />
              )}

              {captureError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800"
                >
                  <span>{captureError}</span>
                  <button
                    type="button"
                    onClick={() => setCaptureError(null)}
                    className="font-medium text-red-700 hover:underline shrink-0 cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              )}
            </div>

            {/* Dedicated Google Drive Sync Bar for Rekam Pelatihan */}
            <GoogleDriveBar
              accent="indigo"
              isConnected={driveConnected}
              userEmail={driveUserEmail}
              folderId={driveFolderId}
              folderName={driveFolderName}
              emptyFolderLabel="Folder Rekam Pelatihan (otomatis)"
              createFolderLabel="Buat Folder Rekam Pelatihan"
              defaultFolderLabel="Folder Rekam Pelatihan"
              autoSaveEnabled={autoSaveEnabled}
              saveState={activeDriveSaveState}
              isSyncing={isDriveSyncing}
              syncProgress={driveSyncProgress}
              syncStageText={driveSyncStage}
              syncSuccessMessage={driveSyncNotice}
              lastSyncedAt={activeSession.lastDriveSyncedAt}
              driveNoteLink={activeSession.driveNoteWebLink}
              driveError={driveError}
              driveSuggestNewTab={driveSuggestNewTab}
              driveSuggestRedirect={driveSuggestRedirect}
              folderFiles={driveFolderFiles}
              isLoggingIn={isLoggingInDrive}
              onGoogleSignIn={async () => {
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
                try {
                  const res = await onGoogleSignIn();
                  if (res) {
                    await handlePostSignInTrainingDrive(res.accessToken, true);
                  }
                } catch (err) {
                  if (err instanceof GoogleAuthFriendlyError) {
                    setDriveError(err.message);
                    setDriveSuggestNewTab(err.suggestNewTab);
                    setDriveSuggestRedirect(err.suggestRedirect);
                  } else {
                    setDriveError(
                      err instanceof Error
                        ? err.message
                        : "Gagal masuk ke akun Google."
                    );
                  }
                }
              }}
              onGoogleSignInRedirect={async () => {
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
                try {
                  await onGoogleSignInRedirect();
                } catch (err) {
                  if (err instanceof GoogleAuthFriendlyError) {
                    setDriveError(err.message);
                    setDriveSuggestNewTab(err.suggestNewTab);
                    setDriveSuggestRedirect(err.suggestRedirect);
                  } else {
                    setDriveError(
                      err instanceof Error
                        ? err.message
                        : "Gagal mengalihkan ke halaman login Google."
                    );
                  }
                }
              }}
              onEnableAutoSaveAndSignIn={async () => {
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
                try {
                  const res = await onGoogleSignIn();
                  if (res) {
                    await handlePostSignInTrainingDrive(res.accessToken, true);
                  }
                } catch (err) {
                  if (err instanceof GoogleAuthFriendlyError) {
                    setDriveError(err.message);
                    setDriveSuggestNewTab(err.suggestNewTab);
                    setDriveSuggestRedirect(err.suggestRedirect);
                  } else {
                    setDriveError(
                      err instanceof Error
                        ? err.message
                        : "Gagal masuk ke akun Google."
                    );
                  }
                }
              }}
              onLogout={async () => {
                await onGoogleLogout();
                setAutoSaveEnabled(false);
                setDriveFolderFiles([]);
                setDriveFolderName(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
                setDriveSyncNotice(null);
              }}
              onToggleAutoSave={() => {
                if (autoSaveEnabled) {
                  setAutoSaveEnabled(false);
                  try {
                    localStorage.removeItem(TRAINING_AUTOSAVE_CONFIRMED_KEY);
                  } catch {
                    // ignore
                  }
                } else {
                  setConfirmModalMode("enable_autosave");
                }
              }}
              onManualSave={() => {
                if (!activeSession) return;
                if (
                  activeSession.driveNoteFileId &&
                  activeSession.driveFolderId === driveFolderId &&
                  !autoSaveEnabled
                ) {
                  setConfirmModalMode("overwrite_session");
                } else {
                  void syncTrainingSessionToDrive(activeSession, {
                    includeRecordedAudio: true,
                  });
                }
              }}
              onChangeFolder={(input) => {
                const trimmed = input.trim();
                if (!trimmed) {
                  setDriveError(
                    "Masukkan link folder Google Drive atau ID folder terlebih dahulu."
                  );
                  return;
                }
                const nextId = extractDriveFolderId(trimmed);
                if (!/^[a-zA-Z0-9_-]{15,}$/.test(nextId)) {
                  setDriveError(
                    "Link atau ID folder Google Drive tidak valid. Tempel link folder seperti https://drive.google.com/drive/folders/..."
                  );
                  return;
                }
                setDriveError(null);
                setDriveSyncNotice(null);
                setDriveFolderId(nextId);
                driveFolderIdRef.current = nextId;
                const token = getAccessToken();
                if (token) {
                  void ensureAndRefreshTrainingFolder(token, nextId);
                }
              }}
              onResetDefaultFolder={async () => {
                setDriveError(null);
                setDriveSyncNotice(null);
                setDriveFolderId("");
                driveFolderIdRef.current = "";
                const token = getAccessToken();
                if (token) {
                  await ensureAndRefreshTrainingFolder(token, "");
                }
              }}
              onCreatePersonalFolder={async () => {
                const token = getAccessToken();
                if (!token) {
                  handleLocalDriveAuthExpired();
                  return;
                }
                setDriveError(null);
                setDriveSyncNotice(null);
                try {
                  const created = await createDriveFolder(
                    token,
                    DEFAULT_TRAINING_FOLDER_NAME
                  );
                  setDriveFolderId(created.id);
                  driveFolderIdRef.current = created.id;
                  setDriveFolderName(created.name);
                  const files = await listDriveFolderFiles(token, created.id);
                  setDriveFolderFiles(files);
                  setDriveSyncNotice(
                    `Folder "${created.name}" berhasil dibuat di Google Drive Anda.`
                  );
                } catch (err) {
                  const msg =
                    err instanceof Error
                      ? err.message
                      : "Gagal membuat folder Rekam Pelatihan di Google Drive.";
                  if (msg === "UNAUTHORIZED_DRIVE") {
                    handleLocalDriveAuthExpired();
                  } else {
                    setDriveError(msg);
                  }
                }
              }}
              onRefreshFiles={() => {
                const token = getAccessToken();
                if (token) {
                  void ensureAndRefreshTrainingFolder(token);
                }
              }}
              onDismissSuccess={() => setDriveSyncNotice(null)}
              onDismissError={() => {
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
              }}
            />

            {/* Two-Column Clean Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
              {/* Left: Notes Editor */}
              <section
                ref={notesCardRef}
                tabIndex={-1}
                aria-label="Editor catatan pelatihan"
                className={`scroll-mt-20 lg:col-span-7 flex flex-col min-w-0 rounded-xl border bg-white min-h-[380px] lg:min-h-[540px] transition-all duration-300 focus:outline-none ${
                  focusedSection === "notes"
                    ? "border-indigo-500/80 ring-2 ring-indigo-700/20"
                    : "border-slate-200/90"
                }`}
              >
                <div className="flex flex-col gap-2.5 border-b border-slate-200 px-3.5 py-3 sm:px-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5 min-w-0">
                      <h2 className="font-sans text-sm font-semibold text-slate-900 whitespace-nowrap">
                        Catatan Pelatihan
                      </h2>
                      <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                        {wordCount} kata
                      </span>
                    </div>

                    <div className="xl:hidden flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => focusWorkspaceTarget("edit")}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          editorMode === "edit"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Tulis</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => focusWorkspaceTarget("read")}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          editorMode === "preview"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Eye className="h-3 w-3" />
                        <span>Baca</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5">
                    <div className="hidden xl:flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
                      <button
                        type="button"
                        onClick={() => focusWorkspaceTarget("edit")}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          editorMode === "edit"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Tulis</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => focusWorkspaceTarget("read")}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          editorMode === "preview"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Eye className="h-3 w-3" />
                        <span>Baca</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyFullNote}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedNote ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-indigo-700" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadMarkdown}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>.md</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isExportingPdf || !hasContent}
                      onClick={handleDownloadPdf}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isExportingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      <span>Unduh PDF</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col p-3.5 sm:p-6 min-w-0">
                  {editorMode === "edit" ? (
                    <textarea
                      ref={notesTextareaRef}
                      value={activeSession.notes}
                      onChange={(e) =>
                        updateActiveSession((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                      placeholder="Tulis poin pelatihan, studi kasus, atau sisipkan hasil Analisis Smart, SOP, dan daftar tindak lanjut dari panel di samping..."
                      className="min-h-[260px] lg:min-h-[440px] flex-1 w-full resize-none bg-transparent text-[15px] leading-[1.75] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    />
                  ) : activeSession.notes.trim() ? (
                    <div className="mx-auto w-full max-w-[68ch] py-1">
                      <MarkdownView content={activeSession.notes} />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                      Belum ada catatan pelatihan untuk ditampilkan dalam Mode Baca.
                    </div>
                  )}
                </div>
              </section>

              {/* Right: Smart Training Intelligence Panel */}
              <section
                ref={toolsCardRef}
                tabIndex={-1}
                aria-label="Panel fitur pintar pelatihan"
                className={`scroll-mt-20 lg:col-span-5 flex flex-col min-w-0 rounded-xl border bg-white h-[500px] lg:h-[620px] overflow-hidden transition-all duration-300 focus:outline-none ${
                  focusedSection === "tools"
                    ? "border-indigo-500/80 ring-2 ring-indigo-700/20"
                    : "border-slate-200/90"
                }`}
              >
                <div className="border-b border-slate-200 px-2.5 py-2">
                  <div
                    className="grid grid-cols-5 gap-0.5 rounded-lg bg-slate-100 p-1"
                    role="tablist"
                    aria-label="Fitur pintar pelatihan"
                  >
                    {(
                      [
                        { id: "transcript", label: "Transkrip" },
                        { id: "analysis", label: "Smart AI" },
                        {
                          id: "actions",
                          label: openActionCount > 0 ? `Aksi (${openActionCount})` : "Aksi",
                        },
                        { id: "quiz", label: "Kuis" },
                        { id: "ask", label: "Tanya" },
                      ] as Array<{ id: TrainingRightTab; label: string }>
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={rightTab === tab.id}
                        onClick={() => focusWorkspaceTarget(tab.id)}
                        className={`rounded-md px-1.5 py-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
                          rightTab === tab.id
                            ? "bg-white text-indigo-900 shadow-xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                {rightTab === "transcript" && (
                  <PelatihanTranscriptPanel
                    segments={activeSession.segments}
                    markers={activeSession.markers}
                    interimText={interimText}
                    isRecording={isRecording}
                    onInsertText={handleInsertToNotes}
                    onInsertAllTranscript={() => {
                      const joined = activeSession.segments
                        .map((s) => `- **[${s.timestamp}]** ${s.text}`)
                        .join("\n");
                      handleInsertToNotes(`## Transkrip Pelatihan\n\n${joined}`);
                    }}
                    onDeleteMarker={(id) =>
                      updateActiveSession((prev) => ({
                        ...prev,
                        markers: prev.markers.filter((m) => m.id !== id),
                      }))
                    }
                    onClearTranscript={() =>
                      updateActiveSession((prev) => ({
                        ...prev,
                        segments: [],
                      }))
                    }
                  />
                )}

                {rightTab === "analysis" && (
                  <PelatihanAnalysisPanel
                    analysis={activeSession.analysis}
                    isLoading={isAnalyzing}
                    error={analysisError}
                    hasContent={hasContent}
                    appliedRecently={analysisApplied}
                    onGenerate={handleRunSmartAnalysis}
                    onApplyToNotes={() => {
                      if (!activeSession.analysis) return;
                      handleInsertToNotes(
                        activeSession.analysis.catatanRapiMarkdown ||
                          activeSession.analysis.ringkasanEksekutif
                      );
                      setAnalysisApplied(true);
                      setTimeout(() => setAnalysisApplied(false), 1800);
                    }}
                  />
                )}

                {rightTab === "actions" && (
                  <PelatihanActionPlanPanel
                    items={activeSession.actionItems}
                    onToggleItem={(id) =>
                      updateActiveSession((prev) => ({
                        ...prev,
                        actionItems: prev.actionItems.map((item) =>
                          item.id === id ? { ...item, done: !item.done } : item
                        ),
                      }))
                    }
                    onAddItem={(task, priority: ActionPriority, dueHint) =>
                      updateActiveSession((prev) => ({
                        ...prev,
                        actionItems: [
                          {
                            id: `act-${Date.now()}`,
                            task,
                            owner: "Saya",
                            dueHint,
                            priority,
                            done: false,
                          },
                          ...prev.actionItems,
                        ],
                      }))
                    }
                    onDeleteItem={(id) =>
                      updateActiveSession((prev) => ({
                        ...prev,
                        actionItems: prev.actionItems.filter((i) => i.id !== id),
                      }))
                    }
                    onInsertChecklistToNotes={() => {
                      const lines = activeSession.actionItems.map(
                        (i) =>
                          `- [${i.done ? "x" : " "}] ${i.task} (${i.priority}${
                            i.dueHint ? ` · ${i.dueHint}` : ""
                          })`
                      );
                      handleInsertToNotes(
                        `## Rencana Tindak Lanjut\n\n${lines.join("\n")}`
                      );
                    }}
                  />
                )}

                {rightTab === "quiz" && (
                  <PelatihanQuizPanel
                    questions={activeSession.analysis?.kuisEvaluasi ?? []}
                    isLoadingAnalysis={isAnalyzing}
                    hasContent={hasContent}
                    onGenerateAnalysis={handleRunSmartAnalysis}
                  />
                )}

                {rightTab === "ask" && (
                  <PelatihanAskPanel
                    history={activeSession.qaHistory}
                    isLoading={isAsking}
                    error={askError}
                    hasContent={hasContent}
                    inputRef={askInputRef}
                    onAsk={handleAskAssistant}
                    onInsertAnswer={handleInsertToNotes}
                  />
                )}
                </div>
              </section>
            </div>
          </>
        )}
      </main>

      {activeSession && (
        <DriveConfirmModal
          accent="indigo"
          isOpen={confirmModalMode !== null}
          title={
            confirmModalMode === "enable_autosave"
              ? "Aktifkan Auto-Simpan Pelatihan ke Drive?"
              : "Perbarui File Pelatihan di Google Drive?"
          }
          description={
            confirmModalMode === "enable_autosave"
              ? "Aplikasi akan menyimpan dan memperbarui catatan pelatihan (termasuk analisis Smart AI, rencana aksi, penanda momen, transkrip) serta mengunggah rekaman audio secara otomatis ke folder khusus pelatihan di Google Drive Anda."
              : `File pelatihan "${
                  activeSession.title.trim() || `Pelatihan ${activeSession.category}`
                }.md" sudah ada di Google Drive. Apakah Anda ingin memperbarui isinya dengan versi terbaru?`
          }
          details={[
            `Folder tujuan: ${
              driveFolderName ||
              driveFolderId ||
              `${DEFAULT_TRAINING_FOLDER_NAME} (otomatis dibuat)`
            }`,
            confirmModalMode === "enable_autosave"
              ? "Catatan pelatihan (.md) diperbarui otomatis saat ada perubahan"
              : "Konten file lama di Google Drive akan diganti dengan versi terbaru",
            confirmModalMode === "enable_autosave"
              ? "Rekaman suara atau file audio pelatihan otomatis diunggah ke folder yang sama"
              : "Rekaman audio pelatihan baru (jika ada) juga akan diunggah ke folder yang sama",
          ]}
          confirmLabel={
            confirmModalMode === "enable_autosave"
              ? "Aktifkan Auto-Simpan"
              : "Perbarui & Simpan"
          }
          onCancel={() => setConfirmModalMode(null)}
          onConfirm={() => {
            const mode = confirmModalMode;
            setConfirmModalMode(null);
            if (mode === "enable_autosave") {
              setAutoSaveEnabled(true);
              try {
                localStorage.setItem(TRAINING_AUTOSAVE_CONFIRMED_KEY, "true");
              } catch {
                // ignore
              }
              if (hasSessionBody(activeSession) || Boolean(recordedBlobRef.current)) {
                void syncTrainingSessionToDrive(activeSession, {
                  includeRecordedAudio: true,
                });
              } else {
                setDriveSyncNotice(
                  "Auto-Simpan Pelatihan aktif. Catatan dan rekaman pelatihan akan otomatis tersimpan ke folder khusus di Drive."
                );
              }
            } else if (mode === "overwrite_session") {
              void syncTrainingSessionToDrive(activeSession, {
                includeRecordedAudio: true,
              });
            }
          }}
        />
      )}
    </div>
  );
};
