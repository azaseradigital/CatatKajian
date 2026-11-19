import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  Menu,
  Pencil,
  Printer,
} from "lucide-react";
import type {
  KajianEnrichment,
  KajianNote,
  KajianSummary,
  SpeechLanguage,
  TranscriptSegment,
} from "./types/kajian";
import {
  downsampleTo16kPcmBase64,
  fileToBase64,
  formatDuration,
} from "./utils/audioPcm";
import type { PdfExportOptions } from "./utils/pdfExport";
import {
  clearAccessToken,
  getAccessToken,
  GoogleAuthFriendlyError,
  googleSignIn,
  googleSignInWithRedirect,
  initAuth,
  isEmbeddedIframe,
  logout,
} from "./utils/googleAuth";
import {
  createDriveFolder,
  DEFAULT_DRIVE_FOLDER_ID,
  extractDriveFolderId,
  listDriveFolderFiles,
  saveKajianNoteToDrive,
  uploadAudioToDrive,
  verifyDriveFolder,
  type DriveFileInfo,
} from "./utils/googleDrive";
import { KajianSidebar } from "./components/KajianSidebar";
import { LiveCaptureBar } from "./components/LiveCaptureBar";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { SummaryPanel } from "./components/SummaryPanel";
import { EnrichmentPanel } from "./components/EnrichmentPanel";
import { MarkdownView } from "./components/MarkdownView";
import { ExportPdfModal } from "./components/ExportPdfModal";
import { KajianDocumentContent } from "./components/KajianDocumentContent";
import {
  GoogleDriveBar,
  type DriveSaveState,
} from "./components/GoogleDriveBar";
import { DriveConfirmModal } from "./components/DriveConfirmModal";
import { PelatihanWorkspace } from "./components/PelatihanWorkspace";
import type { AppModule } from "./components/SideMenuNav";

const STORAGE_KEY = "catatkajian_notes_v1";
const DRIVE_FOLDER_STORAGE_KEY = "catatkajian_drive_folder_v1";
const AUTOSAVE_CONFIRMED_KEY = "catatkajian_autosave_confirmed_v1";

type RightTab = "transcript" | "summary" | "enrich";

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

function createEmptyNote(): KajianNote {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `kajian-${Date.now()}`,
    title: "",
    speaker: "",
    location: "",
    date: getTodayLabel(),
    notes: "",
    segments: [],
    summary: null,
    enrichment: null,
    updatedAt: Date.now(),
  };
}

function loadInitialNotes(): KajianNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Fallback to fresh note
  }
  return [createEmptyNote()];
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
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

export default function App() {
  const [activeModule, setActiveModule] = useState<AppModule>("kajian");
  const [pelatihanCreateSignal, setPelatihanCreateSignal] = useState(0);
  const [notes, setNotes] = useState<KajianNote[]>(loadInitialNotes);
  const [activeNoteId, setActiveNoteId] = useState<string>(() => notes[0]?.id ?? "");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [rightTab, setRightTab] = useState<RightTab>("transcript");
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [copiedNote, setCopiedNote] = useState(false);
  const [summaryApplied, setSummaryApplied] = useState(false);
  const [enrichmentInserted, setEnrichmentInserted] = useState(false);
  const [exportPdfOpen, setExportPdfOpen] = useState(false);
  const [pdfOptions, setPdfOptions] = useState<PdfExportOptions>({
    includeNotes: true,
    includeSummary: true,
    includeEnrichment: true,
    includeTranscript: false,
  });

  // Live audio transcription state
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
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [captureStatusText, setCaptureStatusText] = useState<string | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioMeta, setRecordedAudioMeta] = useState<{
    durationSeconds: number;
    sizeBytes: number;
    label: string;
    mimeType: string;
  } | null>(null);
  const [audioSavedToDrive, setAudioSavedToDrive] = useState(false);

  // AI summarize / enrich state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Google Drive sync state
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(null);
  const [isLoggingInDrive, setIsLoggingInDrive] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(DRIVE_FOLDER_STORAGE_KEY);
      if (saved && /^[a-zA-Z0-9_-]{15,}$/.test(saved)) {
        return saved;
      }
      return DEFAULT_DRIVE_FOLDER_ID;
    } catch {
      return DEFAULT_DRIVE_FOLDER_ID;
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
  const [confirmModalMode, setConfirmModalMode] = useState<
    null | "enable_autosave" | "overwrite_note"
  >(null);

  // Refs for audio capture, MediaRecorder, SpeechRecognition & WebSocket
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
  const pendingAutoSavePromptRef = useRef(false);
  const driveFolderIdRef = useRef(driveFolderId);
  const lastSyncedSignatureRef = useRef<Record<string, string>>({});
  const notesRef = useRef(notes);
  const activeModuleRef = useRef<AppModule>(activeModule);

  // Workspace navigation & auto-focus refs
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const notesCardRef = useRef<HTMLElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toolsCardRef = useRef<HTMLElement | null>(null);
  const enrichQueryInputRef = useRef<HTMLInputElement | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const [focusedSection, setFocusedSection] = useState<"notes" | "tools" | null>(
    null
  );

  const pulseSectionFocus = useCallback((section: "notes" | "tools") => {
    setFocusedSection(section);
    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = window.setTimeout(() => {
      setFocusedSection(null);
    }, 1100);
  }, []);

  const focusWorkspaceTarget = useCallback(
    (target: "transcript" | "summary" | "enrich" | "read" | "edit") => {
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
      if (target === "transcript" && editorMode === "preview") {
        setEditorMode("edit");
      }
      pulseSectionFocus("tools");

      requestAnimationFrame(() => {
        toolsCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        if (target === "enrich") {
          requestAnimationFrame(() => {
            enrichQueryInputRef.current?.focus({ preventScroll: true });
          });
        } else {
          toolsCardRef.current?.focus({ preventScroll: true });
        }
      });
    },
    [editorMode, pulseSectionFocus]
  );

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        window.clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  useEffect(() => {
    autoSaveEnabledRef.current = autoSaveEnabled;
  }, [autoSaveEnabled]);

  useEffect(() => {
    driveFolderIdRef.current = driveFolderId;
    try {
      localStorage.setItem(DRIVE_FOLDER_STORAGE_KEY, driveFolderId);
    } catch {
      // ignore
    }
  }, [driveFolderId]);

  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) ?? notes[0];
  }, [notes, activeNoteId]);

  useEffect(() => {
    if (activeNote && activeNote.id !== activeNoteId) {
      setActiveNoteId(activeNote.id);
    }
  }, [activeNote, activeNoteId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Ignore storage quota errors
    }
  }, [notes]);

  const updateNoteById = useCallback(
    (id: string, updater: (prev: KajianNote) => KajianNote) => {
      setNotes((prevNotes) =>
        prevNotes.map((item) =>
          item.id === id ? { ...updater(item), updatedAt: Date.now() } : item
        )
      );
    },
    []
  );

  const handleDriveAuthExpired = useCallback(() => {
    clearAccessToken();
    setDriveConnected(false);
    setAutoSaveEnabled(false);
    setDriveError(
      "Sesi Google Drive berakhir. Klik 'Sign in with Google' untuk menyambungkan kembali."
    );
  }, []);

  const refreshDriveFolderInfo = useCallback(
    async (token: string, folderId: string): Promise<boolean> => {
      try {
        const folder = await verifyDriveFolder(token, folderId);
        setDriveFolderName(folder.name);
        const files = await listDriveFolderFiles(token, folderId);
        setDriveFolderFiles(files);
        setDriveError(null);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gagal memeriksa folder Drive.";
        if (msg === "UNAUTHORIZED_DRIVE") {
          handleDriveAuthExpired();
        } else {
          setDriveFolderName(null);
          setDriveError(msg);
        }
        return false;
      }
    },
    [handleDriveAuthExpired]
  );

  const handlePostSignInAutoSave = useCallback(
    async (token: string, folderId: string) => {
      const folderOk = await refreshDriveFolderInfo(token, folderId);
      if (!folderOk) {
        pendingAutoSavePromptRef.current = false;
        return;
      }
      try {
        if (localStorage.getItem(AUTOSAVE_CONFIRMED_KEY) === "true") {
          setAutoSaveEnabled(true);
          return;
        }
      } catch {
        // ignore
      }
      pendingAutoSavePromptRef.current = false;
      if (activeModuleRef.current === "kajian") {
        setConfirmModalMode("enable_autosave");
      }
    },
    [refreshDriveFolderInfo]
  );

  const handleSharedGoogleSignInForPelatihan = useCallback(async () => {
    setDriveError(null);
    setDriveSuggestNewTab(false);
    setDriveSuggestRedirect(false);
    setIsLoggingInDrive(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setDriveConnected(true);
        setDriveUserEmail(res.user.email);
        // Quietly keep CatatKajian folder state in sync too
        void refreshDriveFolderInfo(res.accessToken, driveFolderIdRef.current);
        return { accessToken: res.accessToken, email: res.user.email };
      }
      return null;
    } finally {
      setIsLoggingInDrive(false);
    }
  }, [refreshDriveFolderInfo]);

  const handleSharedGoogleSignInRedirectForPelatihan = useCallback(async () => {
    setDriveError(null);
    setDriveSuggestNewTab(false);
    setDriveSuggestRedirect(false);
    setIsLoggingInDrive(true);
    try {
      await googleSignInWithRedirect();
    } catch (err) {
      setIsLoggingInDrive(false);
      throw err;
    }
  }, []);

  const handleSharedGoogleLogout = useCallback(async () => {
    await logout();
    setDriveConnected(false);
    setAutoSaveEnabled(false);
    setDriveFolderFiles([]);
    setDriveFolderName(null);
    setDriveSuggestNewTab(false);
    setDriveSuggestRedirect(false);
    setDriveSyncNotice(null);
  }, []);

  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setDriveConnected(true);
        setDriveUserEmail(user.email);
        setDriveSuggestNewTab(false);
        setDriveSuggestRedirect(false);
        handlePostSignInAutoSave(token, driveFolderIdRef.current);
      },
      (user) => {
        setDriveConnected(false);
        setAutoSaveEnabled(false);
        setDriveUserEmail(user?.email ?? null);
      },
      (err) => {
        setDriveError(err.message);
        setDriveSuggestNewTab(err.suggestNewTab);
        setDriveSuggestRedirect(err.suggestRedirect);
      }
    );
    return () => unsub();
  }, [handlePostSignInAutoSave]);

  const buildNoteSyncSignature = useCallback((note: KajianNote): string => {
    return JSON.stringify({
      t: note.title,
      s: note.speaker,
      l: note.location,
      d: note.date,
      n: note.notes,
      seg: note.segments.length,
      sum: note.summary?.generatedAt,
      enr: note.enrichment?.generatedAt,
      src: note.sourceUrl,
    });
  }, []);

  const syncNoteAndOptionalAudioToDrive = useCallback(
    async (
      noteToSave: KajianNote,
      options?: { includeRecordedAudio?: boolean; customAudioFile?: File }
    ) => {
      const token = getAccessToken();
      if (!token) {
        handleDriveAuthExpired();
        return;
      }

      const hasNoteBody =
        noteToSave.title.trim().length > 0 ||
        noteToSave.notes.trim().length > 0 ||
        noteToSave.segments.length > 0 ||
        Boolean(noteToSave.summary) ||
        Boolean(noteToSave.enrichment);

      const hasRecordedAudioToUpload = Boolean(
        options?.includeRecordedAudio &&
          recordedBlobRef.current &&
          !audioUploadedToDriveRef.current
      );
      const hasCustomAudioToUpload = Boolean(options?.customAudioFile);

      if (!hasNoteBody && !hasRecordedAudioToUpload && !hasCustomAudioToUpload) {
        setDriveError(
          "Catatan dan rekaman masih kosong. Tulis catatan, rekam suara, atau impor link terlebih dahulu sebelum menyimpan ke Drive."
        );
        return;
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

      const targetFolder = driveFolderIdRef.current;
      setIsDriveSyncing(true);
      setDriveSyncProgress(5);
      setDriveSyncStage("Menyiapkan unggahan ke Drive...");
      setDriveSyncNotice(null);
      setDriveError(null);

      const uploadedNames: string[] = [];

      try {
        if (hasNoteBody) {
          setDriveSyncStage("Mengunggah catatan (.md)...");
          const uploadedNote = await saveKajianNoteToDrive(
            token,
            noteToSave,
            targetFolder,
            updateStepProgress
          );
          completedSteps += 1;
          uploadedNames.push(uploadedNote.name);

          const signature = buildNoteSyncSignature(noteToSave);
          lastSyncedSignatureRef.current[noteToSave.id] = signature;
          setSyncedSignatures((prev) => ({
            ...prev,
            [noteToSave.id]: signature,
          }));

          const nowIso = new Date().toISOString();
          updateNoteById(noteToSave.id, (prev) => ({
            ...prev,
            driveNoteFileId: uploadedNote.id,
            driveNoteWebLink: uploadedNote.webViewLink,
            driveFolderId: targetFolder,
            lastDriveSyncedAt: nowIso,
          }));
        }

        if (hasRecordedAudioToUpload && recordedBlobRef.current) {
          setDriveSyncStage("Mengunggah rekaman audio...");
          const uploadedAudio = await uploadAudioToDrive(
            token,
            recordedBlobRef.current,
            noteToSave.title,
            targetFolder,
            undefined,
            updateStepProgress
          );
          completedSteps += 1;
          uploadedNames.push(uploadedAudio.name);
          audioUploadedToDriveRef.current = true;
          setAudioSavedToDrive(true);

          if (!hasNoteBody) {
            const nowIso = new Date().toISOString();
            updateNoteById(noteToSave.id, (prev) => ({
              ...prev,
              driveFolderId: targetFolder,
              lastDriveSyncedAt: nowIso,
            }));
          }
        }

        if (options?.customAudioFile) {
          setDriveSyncStage("Mengunggah file audio...");
          const uploadedCustom = await uploadAudioToDrive(
            token,
            options.customAudioFile,
            noteToSave.title,
            targetFolder,
            options.customAudioFile.name,
            updateStepProgress
          );
          completedSteps += 1;
          uploadedNames.push(uploadedCustom.name);
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
          err instanceof Error ? err.message : "Gagal menyimpan ke Google Drive.";
        if (msg === "UNAUTHORIZED_DRIVE") {
          handleDriveAuthExpired();
        } else {
          setDriveError(msg);
        }
      } finally {
        setIsDriveSyncing(false);
        setDriveSyncStage(null);
      }
    },
    [buildNoteSyncSignature, handleDriveAuthExpired, updateNoteById]
  );

  // Debounced auto-save to Google Drive when autoSaveEnabled is confirmed & active
  useEffect(() => {
    if (!autoSaveEnabled || !driveConnected || !activeNote) return;

    const hasContent =
      activeNote.title.trim().length > 0 ||
      activeNote.notes.trim().length > 0 ||
      activeNote.segments.length > 0 ||
      Boolean(activeNote.summary) ||
      Boolean(activeNote.enrichment);
    if (!hasContent) return;

    const signature = buildNoteSyncSignature(activeNote);

    if (lastSyncedSignatureRef.current[activeNote.id] === signature) {
      return;
    }

    const timer = window.setTimeout(() => {
      syncNoteAndOptionalAudioToDrive(activeNote, {
        includeRecordedAudio: false,
      });
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [
    activeNote,
    autoSaveEnabled,
    buildNoteSyncSignature,
    driveConnected,
    syncNoteAndOptionalAudioToDrive,
  ]);

  const updateActiveNote = useCallback(
    (updater: (prev: KajianNote) => KajianNote) => {
      if (!activeNote) return;
      updateNoteById(activeNote.id, updater);
    },
    [activeNote, updateNoteById]
  );

  const appendTranscriptSegment = useCallback(
    (targetId: string, text: string, timestampOverride?: string) => {
      const cleanText = text.trim();
      if (!cleanText) return;
      const seg: TranscriptSegment = {
        id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: timestampOverride ?? formatDuration(elapsedRef.current),
        text: cleanText,
        createdAt: Date.now(),
      };
      updateNoteById(targetId, (prev) => ({
        ...prev,
        segments: [...prev.segments, seg],
      }));
    },
    [updateNoteById]
  );

  const transcribeAudioBlob = useCallback(
    async (blob: Blob, targetNoteId: string, lang: SpeechLanguage) => {
      if (blob.size < 1024) return;
      setIsUploadingAudio(true);
      try {
        const file = new File([blob], "rekaman-kajian.webm", {
          type: blob.type || "audio/webm",
        });
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/kajian/transcribe-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: base64,
            mimeType: blob.type.split(";")[0] || "audio/webm",
            language: lang,
          }),
        });
        const data = (await res.json()) as {
          transcript?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "Gagal mentranskripsi audio rekaman.");
        }
        if (data.transcript?.trim()) {
          const paragraphs = data.transcript
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean);
          paragraphs.forEach((p, idx) => {
            appendTranscriptSegment(
              targetNoteId,
              p,
              paragraphs.length > 1 ? `Bagian ${idx + 1}` : formatDuration(elapsedRef.current)
            );
          });
        }
      } catch (err) {
        setCaptureError(
          err instanceof Error
            ? err.message
            : "Gagal mentranskripsi rekaman audio."
        );
      } finally {
        setIsUploadingAudio(false);
      }
    },
    [appendTranscriptSegment]
  );

  const stopAudioPipeline = useCallback(() => {
    isRecordingRef.current = false;
    isPausedRef.current = false;

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
    setIsConnecting(false);
    setAudioLevel(0);
    setInterimText("");
    setCaptureStatusText(null);
  }, []);

  useEffect(() => {
    return () => {
      stopAudioPipeline();
    };
  }, [stopAudioPipeline]);

  useEffect(() => {
    return () => {
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
    };
  }, [recordedAudioUrl]);

  const handleStartRecording = useCallback(async () => {
    if (!activeNote) return;
    setCaptureError(null);
    setRightTab("transcript");
    setIsConnecting(true);

    const targetNoteId = activeNote.id;
    recordingTargetIdRef.current = targetNoteId;
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    setIsPaused(false);
    isPausedRef.current = false;
    speechEngineWorkingRef.current = false;
    recordedChunksRef.current = [];
    recordedBlobRef.current = null;
    audioUploadedToDriveRef.current = false;
    setAudioSavedToDrive(false);
    setRecordedAudioMeta(null);
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Browser ini tidak mendukung akses mikrofon langsung. Gunakan tombol Unggah Audio."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 1. Setup AudioContext & live level meter immediately (native sampleRate for universal compatibility)
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!analyserRef.current) return;
        if (isPausedRef.current) {
          setAudioLevel(0);
        } else {
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sumSquares = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const norm = (dataArray[i] - 128) / 128;
            sumSquares += norm * norm;
          }
          const rms = Math.sqrt(sumSquares / dataArray.length);
          setAudioLevel(Math.min(1, rms * 4.5));
        }
        rafRef.current = requestAnimationFrame(updateMeter);
      };
      rafRef.current = requestAnimationFrame(updateMeter);

      // 2. Start MediaRecorder immediately so audio is always captured & replayable
      if (typeof MediaRecorder !== "undefined") {
        const mimeType = pickSupportedRecorderMime();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          if (recordedChunksRef.current.length > 0) {
            const finalMime = recorder.mimeType || "audio/webm";
            const finalBlob = new Blob(recordedChunksRef.current, {
              type: finalMime,
            });
            recordedBlobRef.current = finalBlob;
            const targetNote = notesRef.current.find((n) => n.id === targetNoteId);
            setRecordedAudioMeta({
              durationSeconds: elapsedRef.current,
              sizeBytes: finalBlob.size,
              label: targetNote?.title?.trim() || "Rekaman Kajian",
              mimeType: finalMime,
            });
            setAudioSavedToDrive(false);
            const url = URL.createObjectURL(finalBlob);
            setRecordedAudioUrl(url);

            // Auto-upload recorded audio to Google Drive when Auto-Save is active
            if (autoSaveEnabledRef.current && getAccessToken()) {
              const token = getAccessToken()!;
              setIsDriveSyncing(true);
              setDriveSyncProgress(5);
              setDriveSyncStage("Mengunggah rekaman audio...");
              setDriveSyncNotice(null);
              uploadAudioToDrive(
                token,
                finalBlob,
                targetNote?.title || "Rekaman Kajian",
                driveFolderIdRef.current,
                undefined,
                (pct) => setDriveSyncProgress(pct)
              )
                .then(async (uploadedAudio) => {
                  audioUploadedToDriveRef.current = true;
                  setAudioSavedToDrive(true);
                  const nowIso = new Date().toISOString();
                  updateNoteById(targetNoteId, (prev) => ({
                    ...prev,
                    driveFolderId: driveFolderIdRef.current,
                    lastDriveSyncedAt: nowIso,
                  }));
                  const files = await listDriveFolderFiles(
                    token,
                    driveFolderIdRef.current
                  );
                  setDriveFolderFiles(files);
                  setDriveSyncProgress(100);
                  setDriveSyncNotice(`Tersimpan ke Drive: ${uploadedAudio.name}`);
                })
                .catch((err) => {
                  const msg = err instanceof Error ? err.message : "";
                  if (msg === "UNAUTHORIZED_DRIVE") {
                    handleDriveAuthExpired();
                  } else if (msg) {
                    setDriveError(msg);
                  }
                })
                .finally(() => {
                  setIsDriveSyncing(false);
                  setDriveSyncStage(null);
                });
            }

            // If neither Web Speech API nor Gemini Live produced text, transcribe the captured audio automatically
            if (!speechEngineWorkingRef.current) {
              transcribeAudioBlob(finalBlob, targetNoteId, language);
            }
          }
        };

        recorder.start(1000);
      }

      isRecordingRef.current = true;
      setIsConnecting(false);
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        if (!isPausedRef.current) {
          elapsedRef.current += 1;
          setElapsedSeconds(elapsedRef.current);
        }
      }, 1000);

      // 3. Real-time Speech-to-Text Engine A: Browser Web Speech API (instant, continuous)
      const SpeechCtor = getSpeechRecognitionCtor();
      if (SpeechCtor) {
        const recognition = new SpeechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === "auto" ? "id-ID" : language;
        recognitionRef.current = recognition;
        setCaptureStatusText("Transkrip langsung aktif");

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          if (isPausedRef.current) return;
          speechEngineWorkingRef.current = true;
          let interimBuffer = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcriptPiece = result[0]?.transcript ?? "";
            if (result.isFinal) {
              if (transcriptPiece.trim()) {
                appendTranscriptSegment(targetNoteId, transcriptPiece);
              }
            } else {
              interimBuffer += transcriptPiece;
            }
          }
          setInterimText(interimBuffer);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
          // Non-fatal fallback: audio is still being recorded by MediaRecorder
          if (event.error === "no-speech" || event.error === "aborted") {
            return;
          }
          if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "network") {
            recognitionRef.current = null;
            setCaptureStatusText("Merekam audio (transkrip otomatis saat selesai)");
          }
        };

        recognition.onend = () => {
          if (isRecordingRef.current && !isPausedRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch {
              // ignore restart race
            }
          }
        };

        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
        }
      } else {
        setCaptureStatusText("Merekam audio (transkrip AI saat selesai)");
      }

      // 4. Optional Live API WebSocket upgrade if Web Speech API isn't available
      if (!SpeechCtor) {
        try {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const wsUrl = `${protocol}//${window.location.host}/ws/transcribe?lang=${encodeURIComponent(
            language
          )}`;
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data) as {
                ready?: boolean;
                interimTranscript?: string;
                transcript?: string;
                unsupportedLive?: boolean;
              };

              if (msg.unsupportedLive) {
                ws.close();
                wsRef.current = null;
                return;
              }

              if (msg.ready && audioCtxRef.current && streamRef.current && !processorRef.current) {
                const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;
                const zeroGain = audioCtxRef.current.createGain();
                zeroGain.gain.value = 0;

                source.connect(processor);
                processor.connect(zeroGain);
                zeroGain.connect(audioCtxRef.current.destination);

                processor.onaudioprocess = (e) => {
                  if (isPausedRef.current) return;
                  const sock = wsRef.current;
                  if (!sock || sock.readyState !== WebSocket.OPEN) return;
                  const base64Pcm = downsampleTo16kPcmBase64(
                    e.inputBuffer.getChannelData(0),
                    audioCtx.sampleRate
                  );
                  sock.send(JSON.stringify({ audio: base64Pcm }));
                };
                setCaptureStatusText("Transkrip Live AI aktif");
              }

              if (typeof msg.interimTranscript === "string") {
                speechEngineWorkingRef.current = true;
                setInterimText(msg.interimTranscript);
              }
              if (typeof msg.transcript === "string" && msg.transcript.trim()) {
                speechEngineWorkingRef.current = true;
                setInterimText("");
                appendTranscriptSegment(targetNoteId, msg.transcript);
              }
            } catch {
              // ignore
            }
          };

          ws.onerror = () => {
            wsRef.current = null;
          };
        } catch {
          // Ignore WebSocket errors; MediaRecorder fallback still captures audio
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal mengakses mikrofon. Pastikan izin mikrofon diaktifkan.";
      setCaptureError(
        msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("denied")
          ? "Izin mikrofon ditolak browser. Aktifkan izin mikrofon di bilah alamat browser (ikon gembok/kamera) lalu coba kembali."
          : msg.includes("NotFound") || msg.includes("Requested device not found")
          ? "Perangkat mikrofon tidak ditemukan. Pastikan mikrofon terhubung atau gunakan tombol Unggah Audio."
          : msg
      );
      stopAudioPipeline();
    }
  }, [
    activeNote,
    appendTranscriptSegment,
    language,
    recordedAudioUrl,
    stopAudioPipeline,
    transcribeAudioBlob,
  ]);

  const handleTogglePause = () => {
    const next = !isPaused;
    isPausedRef.current = next;
    setIsPaused(next);

    if (mediaRecorderRef.current) {
      try {
        if (next && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.pause();
        } else if (!next && mediaRecorderRef.current.state === "paused") {
          mediaRecorderRef.current.resume();
        }
      } catch {
        // ignore
      }
    }

    if (recognitionRef.current) {
      try {
        if (next) {
          recognitionRef.current.stop();
        } else {
          recognitionRef.current.start();
        }
      } catch {
        // ignore
      }
    }
  };

  const handleTranscribeRecordedAudio = () => {
    if (!activeNote || !recordedBlobRef.current) return;
    transcribeAudioBlob(recordedBlobRef.current, activeNote.id, language);
  };

  const handleDownloadRecordedAudio = () => {
    const blob = recordedBlobRef.current;
    if (!blob) return;
    const mime = blob.type.toLowerCase();
    const ext = mime.includes("mp4")
      ? "m4a"
      : mime.includes("mpeg")
      ? "mp3"
      : mime.includes("wav")
      ? "wav"
      : mime.includes("ogg")
      ? "ogg"
      : "webm";
    const slug = (activeNote?.title || "rekaman-kajian")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "rekaman-kajian"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDiscardRecordedAudio = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];
    audioUploadedToDriveRef.current = false;
    setRecordedAudioUrl(null);
    setRecordedAudioMeta(null);
    setAudioSavedToDrive(false);
  };

  const handleSaveRecordedAudioToDrive = () => {
    if (!activeNote || !recordedBlobRef.current) return;
    syncNoteAndOptionalAudioToDrive(activeNote, {
      includeRecordedAudio: true,
    });
  };

  const handleUploadAudioFile = async (file: File) => {
    if (!activeNote) return;
    if (file.size > 20 * 1024 * 1024) {
      setCaptureError(
        "Ukuran file audio maksimal 20 MB untuk transkripsi langsung."
      );
      return;
    }

    // Load uploaded audio into the built-in player immediately so user can listen & review
    recordedBlobRef.current = file;
    audioUploadedToDriveRef.current = false;
    setAudioSavedToDrive(false);
    setRecordedAudioMeta({
      durationSeconds: 0,
      sizeBytes: file.size,
      label: file.name,
      mimeType: file.type || "audio/mpeg",
    });
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(URL.createObjectURL(file));

    setCaptureError(null);
    setIsUploadingAudio(true);
    setRightTab("transcript");

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/kajian/transcribe-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: file.type || "audio/mpeg",
          language,
        }),
      });
      const data = (await res.json()) as {
        transcript?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Gagal mentranskripsi rekaman audio.");
      }

      if (data.transcript?.trim()) {
        const paragraphs = data.transcript
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
        const newSegments: TranscriptSegment[] = paragraphs.map((text, idx) => ({
          id: `file-${Date.now()}-${idx}`,
          timestamp: `Audio ${idx + 1}`,
          text,
          createdAt: Date.now() + idx,
        }));
        updateActiveNote((prev) => ({
          ...prev,
          segments: [...prev.segments, ...newSegments],
        }));
      }

      if (autoSaveEnabledRef.current && getAccessToken()) {
        setIsDriveSyncing(true);
        setDriveSyncProgress(5);
        setDriveSyncStage("Mengunggah file audio ke Drive...");
        try {
          const uploadedFile = await uploadAudioToDrive(
            getAccessToken()!,
            file,
            activeNote.title,
            driveFolderIdRef.current,
            file.name,
            (pct) => setDriveSyncProgress(pct)
          );
          audioUploadedToDriveRef.current = true;
          setAudioSavedToDrive(true);
          const nowIso = new Date().toISOString();
          updateNoteById(activeNote.id, (prev) => ({
            ...prev,
            driveFolderId: driveFolderIdRef.current,
            lastDriveSyncedAt: nowIso,
          }));
          const files = await listDriveFolderFiles(
            getAccessToken()!,
            driveFolderIdRef.current
          );
          setDriveFolderFiles(files);
          setDriveSyncProgress(100);
          setDriveSyncNotice(`Tersimpan ke Drive: ${uploadedFile.name}`);
        } finally {
          setIsDriveSyncing(false);
          setDriveSyncStage(null);
        }
      }
    } catch (err) {
      setCaptureError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memproses file audio."
      );
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleImportSocialLink = async (
    url: string,
    extraNotes?: string
  ): Promise<boolean> => {
    setCaptureError(null);
    setLinkNotice(null);
    setIsImportingLink(true);

    try {
      const res = await fetch("/api/kajian/from-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, extraNotes }),
      });

      const data = (await res.json()) as {
        title?: string;
        speaker?: string;
        platform?: string;
        sourceUrl?: string;
        notesMarkdown?: string;
        transcriptSegments?: Array<{ timestamp: string; text: string }>;
        sources?: Array<{ title: string; uri: string }>;
        warning?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(
          data.error || "Gagal mencatat kajian dari tautan media sosial."
        );
      }

      const now = Date.now();
      const newSegments: TranscriptSegment[] = (data.transcriptSegments ?? []).map(
        (seg, idx) => ({
          id: `link-${now}-${idx}`,
          timestamp: seg.timestamp || `00:${String(idx).padStart(2, "0")}`,
          text: seg.text,
          createdAt: now + idx,
        })
      );

      const sources = data.sources ?? [];
      const enrichment: KajianEnrichment | null =
        sources.length > 0
          ? {
              markdown:
                "Sumber referensi online yang ditemukan saat memproses tautan kajian:\n\n" +
                sources.map((s) => `- [${s.title}](${s.uri})`).join("\n"),
              sources,
              query: data.sourceUrl || url,
              generatedAt: new Date().toISOString(),
            }
          : null;

      const resolvedTitle = data.title?.trim() || `Kajian ${data.platform || "Sosmed"}`;
      const resolvedSpeaker = data.speaker?.trim() || "";
      const resolvedPlatform = data.platform?.trim() || "Sosmed";
      const resolvedUrl = data.sourceUrl || url;
      const resolvedNotes = data.notesMarkdown?.trim() || "";

      const isActiveEmpty = Boolean(
        activeNote &&
          !activeNote.title.trim() &&
          !activeNote.notes.trim() &&
          activeNote.segments.length === 0 &&
          !activeNote.sourceUrl
      );

      if (isActiveEmpty && activeNote) {
        updateNoteById(activeNote.id, (prev) => ({
          ...prev,
          title: resolvedTitle,
          speaker: prev.speaker.trim() || resolvedSpeaker,
          location: prev.location.trim() || resolvedPlatform,
          notes: resolvedNotes,
          segments: newSegments,
          sourceUrl: resolvedUrl,
          sourcePlatform: resolvedPlatform,
          enrichment: enrichment ?? prev.enrichment,
        }));
      } else {
        const fresh = createEmptyNote();
        const populated: KajianNote = {
          ...fresh,
          title: resolvedTitle,
          speaker: resolvedSpeaker,
          location: resolvedPlatform,
          notes: resolvedNotes,
          segments: newSegments,
          sourceUrl: resolvedUrl,
          sourcePlatform: resolvedPlatform,
          enrichment,
          updatedAt: now,
        };
        setNotes((prev) => [populated, ...prev]);
        setActiveNoteId(populated.id);
      }

      setEditorMode("preview");
      if (newSegments.length > 0) {
        setRightTab("transcript");
      }
      if (data.warning) {
        setLinkNotice(data.warning);
      }
      return true;
    } catch (err) {
      setCaptureError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memproses link kajian."
      );
      return false;
    } finally {
      setIsImportingLink(false);
    }
  };

  const combinedTranscript = useMemo(() => {
    if (!activeNote) return "";
    return activeNote.segments.map((s) => s.text).join("\n");
  }, [activeNote]);

  const hasNoteOrTranscript = Boolean(
    activeNote &&
      (activeNote.notes.trim().length > 0 || combinedTranscript.trim().length > 0)
  );

  const handleGenerateSummary = async () => {
    if (!activeNote) return;
    setSummaryError(null);
    setIsSummarizing(true);
    setRightTab("summary");

    try {
      const res = await fetch("/api/kajian/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeNote.title,
          speaker: activeNote.speaker,
          location: activeNote.location,
          notes: activeNote.notes,
          transcript: combinedTranscript,
        }),
      });
      const data = (await res.json()) as KajianSummary & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Gagal meringkas kajian.");
      }
      updateActiveNote((prev) => ({
        ...prev,
        summary: data,
      }));
    } catch (err) {
      setSummaryError(
        err instanceof Error ? err.message : "Gagal terhubung ke server AI."
      );
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleEnrichOnline = async (customQuery?: string) => {
    if (!activeNote) return;
    setEnrichError(null);
    setIsEnriching(true);
    setRightTab("enrich");

    try {
      const res = await fetch("/api/kajian/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeNote.title,
          speaker: activeNote.speaker,
          notes: activeNote.notes,
          transcript: combinedTranscript,
          customQuery,
        }),
      });
      const data = (await res.json()) as KajianEnrichment & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Gagal melengkapi catatan secara online.");
      }
      updateActiveNote((prev) => ({
        ...prev,
        enrichment: data,
      }));
    } catch (err) {
      setEnrichError(
        err instanceof Error ? err.message : "Gagal melengkapi secara online."
      );
    } finally {
      setIsEnriching(false);
    }
  };

  const appendToNotes = (block: string) => {
    if (!activeNote || !block.trim()) return;
    updateActiveNote((prev) => {
      const existing = prev.notes.trimEnd();
      const separator = existing ? "\n\n" : "";
      return {
        ...prev,
        notes: `${existing}${separator}${block.trim()}`,
      };
    });
  };

  const handleApplySummaryToNotes = (mode: "replace" | "append") => {
    if (!activeNote?.summary) return;
    const s = activeNote.summary;
    const formatted = [
      "## Ringkasan Kajian",
      s.ringkasanSingkat,
      s.poinUtama.length
        ? `### Poin Pembahasan\n${s.poinUtama.map((p) => `- ${p}`).join("\n")}`
        : "",
      s.nasihatPraktis.length
        ? `### Amal & Hikmah Praktis\n${s.nasihatPraktis
            .map((p) => `- ${p}`)
            .join("\n")}`
        : "",
      s.istilahKunci.length
        ? `### Istilah Kunci\n${s.istilahKunci
            .map((t) => `- **${t.istilah}**: ${t.makna}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (mode === "replace") {
      updateActiveNote((prev) => ({ ...prev, notes: formatted }));
    } else {
      appendToNotes(formatted);
    }
    setSummaryApplied(true);
    setTimeout(() => setSummaryApplied(false), 2000);
  };

  const handleInsertEnrichmentToNotes = () => {
    if (!activeNote?.enrichment?.markdown) return;
    appendToNotes(`## Pelengkap & Dalil Rujukan\n\n${activeNote.enrichment.markdown}`);
    setEnrichmentInserted(true);
    setTimeout(() => setEnrichmentInserted(false), 2000);
  };

  const handleCreateNewNote = () => {
    if (isRecording) {
      stopAudioPipeline();
    }
    const fresh = createEmptyNote();
    setNotes((prev) => [fresh, ...prev]);
    setActiveNoteId(fresh.id);
    setEditorMode("edit");
    setSummaryError(null);
    setEnrichError(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      titleInputRef.current?.focus({ preventScroll: true });
    });
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => {
      const remaining = prev.filter((n) => n.id !== id);
      if (remaining.length === 0) {
        const fresh = createEmptyNote();
        setActiveNoteId(fresh.id);
        return [fresh];
      }
      if (id === activeNoteId) {
        setActiveNoteId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleCopyFullNote = async () => {
    if (!activeNote) return;
    const header = [
      `# ${activeNote.title || "Catatan Kajian"}`,
      [activeNote.speaker, activeNote.location, activeNote.date]
        .filter(Boolean)
        .join(" · "),
      "",
      activeNote.notes,
    ]
      .filter((line) => line !== undefined)
      .join("\n");
    try {
      await navigator.clipboard.writeText(header.trim());
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 2000);
    } catch {
      // Ignore clipboard permission failure
    }
  };

  const handleDownloadMarkdown = () => {
    if (!activeNote) return;
    const filenameSlug = (activeNote.title || "catatan-kajian")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const content = [
      `# ${activeNote.title || "Catatan Kajian"}`,
      "",
      [activeNote.speaker, activeNote.location, activeNote.date]
        .filter(Boolean)
        .join(" · "),
      "",
      activeNote.notes,
      activeNote.segments.length
        ? `\n\n---\n\n## Lampiran Transkrip Suara\n\n${activeNote.segments
            .map((s) => `- **[${s.timestamp}]** ${s.text}`)
            .join("\n")}`
        : "",
    ].join("\n");

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameSlug || "catatan-kajian"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllJson = () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arsip-catatan-kajian-${new Date().toISOString().slice(0, 10)}.json`;
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
        ) as KajianNote[];
        if (valid.length > 0) {
          setNotes(valid);
          setActiveNoteId(valid[0].id);
        }
      }
    } catch {
      setCaptureError("File cadangan JSON tidak valid.");
    }
  };

  const wordCount = useMemo(() => {
    const text = activeNote?.notes.trim() ?? "";
    if (!text) return 0;
    return text.split(/\s+/).length;
  }, [activeNote?.notes]);

  const activeDriveSaveState: DriveSaveState = useMemo(() => {
    if (isDriveSyncing) return "syncing";
    if (driveError && driveConnected) return "error";
    if (!activeNote) return "empty";

    const hasNoteBody =
      activeNote.title.trim().length > 0 ||
      activeNote.notes.trim().length > 0 ||
      activeNote.segments.length > 0 ||
      Boolean(activeNote.summary) ||
      Boolean(activeNote.enrichment);
    const hasPendingAudio = Boolean(recordedAudioUrl && !audioSavedToDrive);

    if (!hasNoteBody && !recordedAudioUrl) {
      return activeNote.lastDriveSyncedAt ? "saved" : "empty";
    }

    if (hasPendingAudio) {
      return "unsaved";
    }

    if (!hasNoteBody && audioSavedToDrive) {
      return "saved";
    }

    if (
      activeNote.lastDriveSyncedAt &&
      activeNote.driveFolderId === driveFolderId
    ) {
      const currentSig = buildNoteSyncSignature(activeNote);
      const syncedSig = syncedSignatures[activeNote.id];
      if (syncedSig) {
        return syncedSig === currentSig ? "saved" : "unsaved";
      }
      const syncedMs = Date.parse(activeNote.lastDriveSyncedAt);
      if (Number.isFinite(syncedMs) && activeNote.updatedAt <= syncedMs + 3000) {
        return "saved";
      }
    }

    return "unsaved";
  }, [
    activeNote,
    audioSavedToDrive,
    buildNoteSyncSignature,
    driveConnected,
    driveError,
    driveFolderId,
    isDriveSyncing,
    recordedAudioUrl,
    syncedSignatures,
  ]);

  return (
    <>
      <div className="no-print min-h-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden">
        {/* Clean Minimal Top Bar (Menu lives in the Side Menu Bar) */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            aria-label="Buka daftar menu dan arsip"
          >
            <Menu className="h-4 w-4 text-slate-600" />
            <span>Menu</span>
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {activeModule === "pelatihan" ? "Rekam Pelatihan" : "CatatKajian"}
          </a>
        </div>

        <div className="flex items-center shrink-0">
          {activeModule === "kajian" ? (
            <button
              type="button"
              onClick={handleCreateNewNote}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kajian Baru
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPelatihanCreateSignal((n) => n + 1)}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pelatihan Baru
            </button>
          )}
        </div>
      </header>

      {activeModule === "pelatihan" ? (
        <PelatihanWorkspace
          onSelectModule={(mod) => {
            setMobileSidebarOpen(false);
            setActiveModule(mod);
          }}
          mobileSidebarOpen={mobileSidebarOpen}
          onCloseMobileSidebar={() => setMobileSidebarOpen(false)}
          createSignal={pelatihanCreateSignal}
          driveConnected={driveConnected}
          driveUserEmail={driveUserEmail}
          isLoggingInDrive={isLoggingInDrive}
          onGoogleSignIn={handleSharedGoogleSignInForPelatihan}
          onGoogleSignInRedirect={handleSharedGoogleSignInRedirectForPelatihan}
          onGoogleLogout={handleSharedGoogleLogout}
          onDriveAuthExpired={handleDriveAuthExpired}
        />
      ) : (
      <div className="flex flex-1 min-h-0">
        <div className="no-print">
          <KajianSidebar
            activeModule={activeModule}
            onSelectModule={(mod) => {
              if (mod !== "kajian" && isRecording) {
                stopAudioPipeline();
              }
              setMobileSidebarOpen(false);
              setActiveModule(mod);
            }}
            notes={notes}
            activeNoteId={activeNote?.id ?? ""}
            onSelectNote={(id) => {
              setActiveNoteId(id);
              setSummaryError(null);
              setEnrichError(null);
              setDriveSyncNotice(null);
            }}
            onCreateNote={handleCreateNewNote}
            onDeleteNote={handleDeleteNote}
            onExportAll={handleExportAllJson}
            onImportAll={handleImportAllJson}
            mobileOpen={mobileSidebarOpen}
            onCloseMobile={() => setMobileSidebarOpen(false)}
          />
        </div>

        <main className="flex-1 min-w-0 px-3 py-4 sm:px-6 sm:py-5 lg:px-8 max-w-[1320px] mx-auto w-full space-y-4 sm:space-y-5">
          {activeNote && (
            <section className="space-y-2">
              <input
                ref={titleInputRef}
                type="text"
                value={activeNote.title}
                onChange={(e) =>
                  updateActiveNote((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                placeholder="Judul Kajian (mis. Tafsir Al-Asr & Manajemen Waktu)"
                aria-label="Judul Kajian"
                className="w-full bg-transparent font-display text-xl sm:text-3xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-300 focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                <input
                  type="text"
                  value={activeNote.speaker}
                  onChange={(e) =>
                    updateActiveNote((prev) => ({
                      ...prev,
                      speaker: e.target.value,
                    }))
                  }
                  placeholder="Nama Pemateri / Ustadz"
                  aria-label="Nama Pemateri"
                  className="w-full sm:w-auto sm:min-w-[170px] bg-transparent text-slate-800 placeholder:text-slate-400 border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                />
                <span aria-hidden="true" className="hidden sm:inline text-slate-300">
                  ·
                </span>
                <input
                  type="text"
                  value={activeNote.location}
                  onChange={(e) =>
                    updateActiveNote((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                  placeholder="Masjid / Majelis / Online"
                  aria-label="Lokasi Majelis"
                  className="min-w-0 flex-1 sm:flex-none sm:min-w-[170px] bg-transparent text-slate-700 placeholder:text-slate-400 border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                />
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <input
                  type="text"
                  value={activeNote.date}
                  onChange={(e) =>
                    updateActiveNote((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  aria-label="Tanggal Kajian"
                  className="w-24 sm:w-28 shrink-0 bg-transparent text-slate-500 tabular-nums border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                />
                {activeNote.sourceUrl && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline text-slate-300">
                      ·
                    </span>
                    <a
                      href={activeNote.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto inline-flex items-center gap-1 text-xs font-medium text-teal-800 hover:underline py-0.5"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        Sumber: {activeNote.sourcePlatform || "Media Sosial"}
                      </span>
                    </a>
                  </>
                )}
              </div>
            </section>
          )}

          <div className="no-print space-y-3">
            <LiveCaptureBar
              isRecording={isRecording}
              isPaused={isPaused}
              isConnecting={isConnecting}
              isUploadingAudio={isUploadingAudio}
              isImportingLink={isImportingLink}
              elapsedSeconds={elapsedSeconds}
              audioLevel={audioLevel}
              language={language}
              captureError={captureError}
              linkNotice={linkNotice}
              captureStatusText={captureStatusText}
              recordedAudioUrl={recordedAudioUrl}
              recordedAudioDurationSeconds={recordedAudioMeta?.durationSeconds}
              recordedAudioSizeBytes={recordedAudioMeta?.sizeBytes}
              recordedAudioLabel={recordedAudioMeta?.label}
              audioSavedToDrive={audioSavedToDrive}
              driveConnected={driveConnected}
              isDriveSyncing={isDriveSyncing}
              onLanguageChange={setLanguage}
              onStartRecording={handleStartRecording}
              onTogglePause={handleTogglePause}
              onStopRecording={stopAudioPipeline}
              onUploadAudioFile={handleUploadAudioFile}
              onTranscribeRecordedAudio={handleTranscribeRecordedAudio}
              onDownloadRecordedAudio={handleDownloadRecordedAudio}
              onSaveRecordedAudioToDrive={handleSaveRecordedAudioToDrive}
              onDiscardRecordedAudio={handleDiscardRecordedAudio}
              onImportSocialLink={handleImportSocialLink}
              onDismissError={() => setCaptureError(null)}
              onDismissNotice={() => setLinkNotice(null)}
            />

            <GoogleDriveBar
              isConnected={driveConnected}
              userEmail={driveUserEmail}
              folderId={driveFolderId}
              folderName={driveFolderName}
              autoSaveEnabled={autoSaveEnabled}
              saveState={activeDriveSaveState}
              isSyncing={isDriveSyncing}
              syncProgress={driveSyncProgress}
              syncStageText={driveSyncStage}
              syncSuccessMessage={driveSyncNotice}
              lastSyncedAt={activeNote?.lastDriveSyncedAt}
              driveNoteLink={activeNote?.driveNoteWebLink}
              driveError={driveError}
              driveSuggestNewTab={driveSuggestNewTab}
              driveSuggestRedirect={driveSuggestRedirect}
              folderFiles={driveFolderFiles}
              isLoggingIn={isLoggingInDrive}
              onGoogleSignIn={async () => {
                pendingAutoSavePromptRef.current = false;
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
                setIsLoggingInDrive(true);
                try {
                  const res = await googleSignIn();
                  if (res) {
                    setDriveConnected(true);
                    setDriveUserEmail(res.user.email);
                    await handlePostSignInAutoSave(res.accessToken, driveFolderId);
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
                } finally {
                  setIsLoggingInDrive(false);
                }
              }}
              onGoogleSignInRedirect={async () => {
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
                setIsLoggingInDrive(true);
                try {
                  await googleSignInWithRedirect();
                } catch (err) {
                  setIsLoggingInDrive(false);
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
                pendingAutoSavePromptRef.current = true;
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
                setIsLoggingInDrive(true);
                try {
                  const res = await googleSignIn();
                  if (res) {
                    setDriveConnected(true);
                    setDriveUserEmail(res.user.email);
                    await handlePostSignInAutoSave(res.accessToken, driveFolderId);
                  }
                } catch (err) {
                  pendingAutoSavePromptRef.current = false;
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
                } finally {
                  setIsLoggingInDrive(false);
                }
              }}
              onLogout={async () => {
                await logout();
                setDriveConnected(false);
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
                    localStorage.removeItem(AUTOSAVE_CONFIRMED_KEY);
                  } catch {
                    // ignore
                  }
                } else {
                  setConfirmModalMode("enable_autosave");
                }
              }}
              onManualSave={() => {
                if (!activeNote) return;
                if (
                  activeNote.driveNoteFileId &&
                  activeNote.driveFolderId === driveFolderId &&
                  !autoSaveEnabled
                ) {
                  setConfirmModalMode("overwrite_note");
                } else {
                  syncNoteAndOptionalAudioToDrive(activeNote, {
                    includeRecordedAudio: true,
                  });
                }
              }}
              onChangeFolder={(input) => {
                const nextId = extractDriveFolderId(input);
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
                  refreshDriveFolderInfo(token, nextId);
                }
              }}
              onResetDefaultFolder={() => {
                setDriveError(null);
                setDriveSyncNotice(null);
                setDriveFolderId(DEFAULT_DRIVE_FOLDER_ID);
                driveFolderIdRef.current = DEFAULT_DRIVE_FOLDER_ID;
                const token = getAccessToken();
                if (token) {
                  refreshDriveFolderInfo(token, DEFAULT_DRIVE_FOLDER_ID);
                }
              }}
              onCreatePersonalFolder={async () => {
                const token = getAccessToken();
                if (!token) {
                  handleDriveAuthExpired();
                  return;
                }
                setDriveError(null);
                setIsDriveSyncing(true);
                setDriveSyncProgress(30);
                setDriveSyncStage("Membuat folder CatatKajian di Drive Anda...");
                try {
                  const created = await createDriveFolder(token, "CatatKajian");
                  setDriveFolderId(created.id);
                  driveFolderIdRef.current = created.id;
                  setDriveFolderName(created.name);
                  setDriveFolderFiles([]);
                  setDriveSyncProgress(100);
                  setDriveSyncNotice(
                    `Folder baru "${created.name}" siap digunakan di Google Drive Anda.`
                  );
                } catch (err) {
                  const msg =
                    err instanceof Error
                      ? err.message
                      : "Gagal membuat folder baru di Google Drive.";
                  if (msg === "UNAUTHORIZED_DRIVE") {
                    handleDriveAuthExpired();
                  } else {
                    setDriveError(msg);
                  }
                } finally {
                  setIsDriveSyncing(false);
                  setDriveSyncStage(null);
                }
              }}
              onRefreshFiles={() => {
                const token = getAccessToken();
                if (token) {
                  refreshDriveFolderInfo(token, driveFolderId);
                }
              }}
              onDismissSuccess={() => setDriveSyncNotice(null)}
              onDismissError={() => {
                setDriveError(null);
                setDriveSuggestNewTab(false);
                setDriveSuggestRedirect(false);
              }}
            />
          </div>

          {activeNote && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
              <section
                ref={notesCardRef}
                tabIndex={-1}
                aria-label="Editor dan tampilan baca catatan kajian"
                className={`scroll-mt-20 lg:col-span-7 flex flex-col min-w-0 rounded-xl border bg-white min-h-[360px] lg:min-h-[520px] transition-all duration-300 focus:outline-none ${
                  focusedSection === "notes"
                    ? "border-teal-500/80 ring-2 ring-teal-700/20"
                    : "border-slate-200/90"
                }`}
              >
                <div className="no-print flex flex-col gap-2.5 border-b border-slate-200 px-3.5 py-3 sm:px-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5 min-w-0">
                      <h2 className="font-sans text-sm font-semibold text-slate-900 whitespace-nowrap">
                        Catatan Kajian
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
                        title="Salin catatan"
                      >
                        {copiedNote ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-teal-700" />
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
                        title="Unduh file Markdown"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>.md</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isEmbeddedIframe()) {
                            if (
                              activeNote &&
                              !activeNote.notes.trim() &&
                              activeNote.segments.length > 0
                            ) {
                              setPdfOptions((prev) => ({
                                ...prev,
                                includeTranscript: true,
                              }));
                            }
                            setExportPdfOpen(true);
                            return;
                          }
                          window.print();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="Cetak atau simpan sebagai PDF lewat browser"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Cetak</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (activeNote && !activeNote.notes.trim() && activeNote.segments.length > 0) {
                          setPdfOptions((prev) => ({ ...prev, includeTranscript: true }));
                        }
                        setExportPdfOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      title="Pratinjau & unduh sebagai PDF rapi"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      <span>Unduh PDF</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col p-3.5 sm:p-6 min-w-0">
                  {editorMode === "edit" ? (
                    <textarea
                      ref={notesTextareaRef}
                      dir="auto"
                      value={activeNote.notes}
                      onChange={(e) =>
                        updateActiveNote((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                      placeholder="Tulis poin kajian di sini, atau sisipkan dari transkrip suara, ringkasan, dan rujukan online di panel berikutnya..."
                      className="min-h-[260px] lg:min-h-[420px] flex-1 w-full resize-none bg-transparent text-[15px] leading-[1.75] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    />
                  ) : activeNote.notes.trim() ? (
                    <div className="mx-auto w-full max-w-[68ch] py-1">
                      <MarkdownView content={activeNote.notes} />
                    </div>
                  ) : (
                    <div className="py-12 text-center text-sm text-slate-400">
                      Catatan masih kosong. Pindah ke mode Tulis untuk mulai
                      menulis atau sisipkan hasil transkrip suara.
                    </div>
                  )}
                </div>
              </section>

              <section
                ref={toolsCardRef}
                tabIndex={-1}
                aria-label="Alat transkrip, ringkasan, dan rujukan online"
                className={`scroll-mt-20 no-print lg:col-span-5 flex flex-col min-w-0 rounded-xl border bg-white min-h-[420px] lg:min-h-[520px] max-h-[620px] lg:max-h-[680px] transition-all duration-300 focus:outline-none ${
                  focusedSection === "tools"
                    ? "border-teal-500/80 ring-2 ring-teal-700/20"
                    : "border-slate-200/90"
                }`}
              >
                <div className="border-b border-slate-200 px-3 py-2.5">
                  <div
                    className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
                    role="tablist"
                    aria-label="Alat kajian"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "transcript"}
                      onClick={() => focusWorkspaceTarget("transcript")}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
                        rightTab === "transcript"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Transkrip ({activeNote.segments.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "summary"}
                      onClick={() => focusWorkspaceTarget("summary")}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
                        rightTab === "summary"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Ringkasan
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "enrich"}
                      onClick={() => focusWorkspaceTarget("enrich")}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
                        rightTab === "enrich"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Lengkapi Online
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  {rightTab === "transcript" && (
                    <TranscriptPanel
                      segments={activeNote.segments}
                      interimText={interimText}
                      isRecording={isRecording}
                      isPaused={isPaused}
                      onInsertSegment={(text) => appendToNotes(text)}
                      onAppendAllToNotes={() => {
                        const text = activeNote.segments
                          .map((s) => `[${s.timestamp}] ${s.text}`)
                          .join("\n");
                        appendToNotes(`## Transkrip Kajian\n\n${text}`);
                      }}
                      onClearTranscript={() => {
                        updateActiveNote((prev) => ({
                          ...prev,
                          segments: [],
                        }));
                      }}
                    />
                  )}

                  {rightTab === "summary" && (
                    <SummaryPanel
                      summary={activeNote.summary}
                      isLoading={isSummarizing}
                      error={summaryError}
                      hasContent={hasNoteOrTranscript}
                      appliedRecently={summaryApplied}
                      onGenerate={handleGenerateSummary}
                      onApplyToNotes={handleApplySummaryToNotes}
                    />
                  )}

                  {rightTab === "enrich" && (
                    <EnrichmentPanel
                      enrichment={activeNote.enrichment}
                      isLoading={isEnriching}
                      error={enrichError}
                      hasContent={hasNoteOrTranscript}
                      insertedRecently={enrichmentInserted}
                      queryInputRef={enrichQueryInputRef}
                      onEnrich={handleEnrichOnline}
                      onInsertToNotes={handleInsertEnrichmentToNotes}
                    />
                  )}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
      )}
      </div>

      {activeModule === "kajian" && activeNote && (
        <>
          <ExportPdfModal
            isOpen={exportPdfOpen}
            note={activeNote}
            options={pdfOptions}
            onChangeOptions={setPdfOptions}
            onClose={() => setExportPdfOpen(false)}
          />

          {/* Dedicated Print-Friendly A4 Layout */}
          <div className="hidden print-only mx-auto max-w-[794px] bg-white">
            <KajianDocumentContent note={activeNote} options={pdfOptions} />
          </div>

          <DriveConfirmModal
            isOpen={confirmModalMode !== null}
            title={
              confirmModalMode === "enable_autosave"
                ? "Aktifkan Auto-Simpan Google Drive?"
                : "Perbarui File di Google Drive?"
            }
            description={
              confirmModalMode === "enable_autosave"
                ? "Aplikasi akan menyimpan dan memperbarui file catatan serta mengunggah rekaman audio baru secara otomatis ke folder Google Drive Anda."
                : `File catatan "${activeNote.title.trim() || "Catatan Kajian"}.md" sudah ada di Google Drive. Apakah Anda ingin memperbarui isinya dengan perubahan terbaru?`
            }
            details={[
              `Folder tujuan: ${driveFolderName || driveFolderId}`,
              confirmModalMode === "enable_autosave"
                ? "Catatan (.md) diperbarui otomatis saat ada perubahan"
                : "Konten file lama di Google Drive akan diganti dengan versi terbaru",
              confirmModalMode === "enable_autosave"
                ? "Rekaman suara baru langsung diunggah setelah rekaman dihentikan"
                : "Rekaman audio baru (jika ada) juga akan diunggah ke folder yang sama",
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
                  localStorage.setItem(AUTOSAVE_CONFIRMED_KEY, "true");
                } catch {
                  // ignore
                }
                const hasNoteOrAudio =
                  activeNote.title.trim().length > 0 ||
                  activeNote.notes.trim().length > 0 ||
                  activeNote.segments.length > 0 ||
                  Boolean(activeNote.summary) ||
                  Boolean(activeNote.enrichment) ||
                  Boolean(recordedBlobRef.current);
                if (hasNoteOrAudio) {
                  syncNoteAndOptionalAudioToDrive(activeNote, {
                    includeRecordedAudio: true,
                  });
                } else {
                  setDriveSyncNotice(
                    "Auto-Simpan Google Drive aktif. Catatan dan rekaman baru akan otomatis terunggah."
                  );
                }
              } else if (mode === "overwrite_note") {
                syncNoteAndOptionalAudioToDrive(activeNote, {
                  includeRecordedAudio: true,
                });
              }
            }}
          />
        </>
      )}
    </>
  );
}
