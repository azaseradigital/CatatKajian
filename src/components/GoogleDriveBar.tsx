import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Cloud,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";
import type { DriveFileInfo } from "../utils/googleDrive";

export type DriveSaveState = "empty" | "unsaved" | "syncing" | "saved" | "error";

interface GoogleDriveBarProps {
  accent?: "teal" | "indigo";
  isConnected: boolean;
  userEmail: string | null;
  folderId: string;
  folderName: string | null;
  emptyFolderLabel?: string;
  createFolderLabel?: string;
  defaultFolderLabel?: string;
  autoSaveEnabled: boolean;
  saveState: DriveSaveState;
  isSyncing: boolean;
  syncProgress: number;
  syncStageText: string | null;
  syncSuccessMessage: string | null;
  lastSyncedAt?: string;
  driveNoteLink?: string;
  driveError: string | null;
  driveSuggestNewTab?: boolean;
  driveSuggestRedirect?: boolean;
  folderFiles: DriveFileInfo[];
  isLoggingIn: boolean;
  onGoogleSignIn: () => void;
  onGoogleSignInRedirect: () => void;
  onEnableAutoSaveAndSignIn: () => void;
  onLogout: () => void;
  onToggleAutoSave: () => void;
  onManualSave: () => void;
  onChangeFolder: (newFolderInput: string) => void;
  onResetDefaultFolder?: () => void;
  onCreatePersonalFolder: () => void;
  onRefreshFiles: () => void;
  onDismissSuccess: () => void;
  onDismissError: () => void;
}

export const GoogleDriveBar: React.FC<GoogleDriveBarProps> = ({
  accent = "teal",
  isConnected,
  userEmail,
  folderId,
  folderName,
  emptyFolderLabel = "Folder Khusus Drive",
  createFolderLabel = "Buat Folder CatatKajian",
  defaultFolderLabel = "Folder Default",
  autoSaveEnabled,
  saveState,
  isSyncing,
  syncProgress,
  syncStageText,
  syncSuccessMessage,
  lastSyncedAt,
  driveNoteLink,
  driveError,
  driveSuggestNewTab = false,
  driveSuggestRedirect = false,
  folderFiles,
  isLoggingIn,
  onGoogleSignIn,
  onGoogleSignInRedirect,
  onEnableAutoSaveAndSignIn,
  onLogout,
  onToggleAutoSave,
  onManualSave,
  onChangeFolder,
  onResetDefaultFolder,
  onCreatePersonalFolder,
  onRefreshFiles,
  onDismissSuccess,
  onDismissError,
}) => {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderInput, setFolderInput] = useState(folderId);
  const [showFiles, setShowFiles] = useState(false);
  const [copiedAppUrl, setCopiedAppUrl] = useState(false);

  const isIndigo = accent === "indigo";
  const accentClasses = isIndigo
    ? {
        icon: "text-indigo-700",
        link: "text-indigo-800",
        statusSync: "text-indigo-700",
        statusSaved: "text-indigo-800",
        primaryBtn: "bg-indigo-700 hover:bg-indigo-800",
        activeToggle: "border-indigo-700 bg-indigo-50 text-indigo-900",
        progressText: "text-indigo-800",
        progressBar: "bg-indigo-700",
        noticeBox: "border-indigo-200 bg-indigo-50/70 text-indigo-900",
        noticeIcon: "text-indigo-700",
        noticeLink: "text-indigo-800",
        noticeClose: "text-indigo-700",
        inputFocus: "focus:border-indigo-600",
        createBtn: "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100",
      }
    : {
        icon: "text-teal-700",
        link: "text-teal-800",
        statusSync: "text-teal-700",
        statusSaved: "text-teal-800",
        primaryBtn: "bg-teal-700 hover:bg-teal-800",
        activeToggle: "border-teal-700 bg-teal-50 text-teal-900",
        progressText: "text-teal-800",
        progressBar: "bg-teal-700",
        noticeBox: "border-teal-200 bg-teal-50/70 text-teal-900",
        noticeIcon: "text-teal-700",
        noticeLink: "text-teal-800",
        noticeClose: "text-teal-700",
        inputFocus: "focus:border-teal-600",
        createBtn: "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100",
      };

  useEffect(() => {
    if (editingFolder) {
      requestAnimationFrame(() => folderInputRef.current?.focus());
    }
  }, [editingFolder]);

  const folderUrl = folderId
    ? `https://drive.google.com/drive/folders/${folderId}`
    : null;
  const formattedSyncTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 sm:px-5 space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <Cloud className={`h-4 w-4 shrink-0 ${accentClasses.icon}`} />
          <span className="text-xs font-semibold text-slate-900 whitespace-nowrap">
            Google Drive
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          {folderUrl ? (
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 text-xs font-medium hover:underline truncate max-w-[165px] sm:max-w-[230px] ${accentClasses.link}`}
              title={`Buka folder Google Drive (${folderId})`}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {folderName || `Folder ${folderId.slice(0, 10)}...`}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 truncate max-w-[200px] sm:max-w-[260px]">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{folderName || emptyFolderLabel}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setFolderInput(folderId);
              setEditingFolder((prev) => !prev);
            }}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline cursor-pointer"
          >
            {editingFolder ? "Tutup" : "Ubah Folder"}
          </button>

          {saveState !== "empty" && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-xs truncate max-w-full">
                {isSyncing ? (
                  <span className={`inline-flex items-center gap-1.5 font-medium ${accentClasses.statusSync}`}>
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    <span>{syncStageText || "Menyimpan ke Drive..."}</span>
                    <span className="tabular-nums">{syncProgress}%</span>
                  </span>
                ) : saveState === "saved" && formattedSyncTime ? (
                  <span className={`inline-flex items-center gap-1 font-medium ${accentClasses.statusSaved}`}>
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>Tersimpan di Drive · {formattedSyncTime}</span>
                  </span>
                ) : saveState === "error" ? (
                  <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Gagal menyimpan ke Drive</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {lastSyncedAt
                        ? "Perubahan belum tersimpan"
                        : "Belum tersimpan di Drive"}
                    </span>
                  </span>
                )}
              </span>
            </>
          )}

          {isConnected && saveState === "empty" && userEmail && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-xs text-slate-500 truncate max-w-[220px]">
                {userEmail}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {!isConnected ? (
            <>
              <button
                type="button"
                disabled={isLoggingIn}
                onClick={onEnableAutoSaveAndSignIn}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 h-9 text-xs font-semibold text-white disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${accentClasses.primaryBtn}`}
                title="Hubungkan Google Drive lalu aktifkan Auto-Simpan otomatis"
              >
                <Cloud className="h-3.5 w-3.5" />
                <span>Aktifkan Auto-Simpan</span>
              </button>

              <button
                type="button"
                disabled={isLoggingIn}
                onClick={onGoogleSignIn}
                className="gsi-material-button flex-1 sm:flex-none inline-flex items-center justify-center gap-2.5 rounded-[4px] border border-[#747775] bg-white px-3 h-9 text-xs font-medium text-[#1f1f1f] hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="h-4 w-4 block shrink-0"
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                <span>
                  {isLoggingIn ? "Menghubungkan..." : "Sign in with Google"}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleAutoSave}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  autoSaveEnabled
                    ? accentClasses.activeToggle
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Auto-Simpan: {autoSaveEnabled ? "Aktif" : "Nonaktif"}
              </button>

              <button
                type="button"
                disabled={isSyncing}
                onClick={onManualSave}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${accentClasses.primaryBtn}`}
              >
                {isSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                <span>{isSyncing ? "Mengunggah..." : "Simpan ke Drive"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !showFiles;
                  setShowFiles(next);
                  if (next) onRefreshFiles();
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {showFiles ? "Tutup Daftar" : "Isi Folder"}
              </button>

              {driveNoteLink && (
                <a
                  href={driveNoteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 whitespace-nowrap shrink-0 ${accentClasses.link}`}
                  title="Lihat file catatan di Google Drive"
                >
                  <span>Buka File</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                title="Putuskan akun Google"
                aria-label="Keluar dari akun Google"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {isSyncing && (
        <div
          className="space-y-1 pt-0.5"
          role="progressbar"
          aria-valuenow={syncProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={syncStageText || "Progres simpan Google Drive"}
        >
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span>{syncStageText || "Menyimpan file ke Google Drive..."}</span>
            <span className={`font-mono font-medium tabular-nums ${accentClasses.progressText}`}>
              {syncProgress}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${accentClasses.progressBar}`}
              style={{ width: `${Math.max(4, syncProgress)}%` }}
            />
          </div>
        </div>
      )}

      {!isSyncing && syncSuccessMessage && !driveError && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${accentClasses.noticeBox}`}>
          <div className="flex items-center gap-2 min-w-0">
            <Check className={`h-3.5 w-3.5 shrink-0 ${accentClasses.noticeIcon}`} />
            <span className="truncate font-medium">{syncSuccessMessage}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {driveNoteLink && (
              <a
                href={driveNoteLink}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 font-semibold hover:underline ${accentClasses.noticeLink}`}
              >
                <span>Lihat di Drive</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              onClick={onDismissSuccess}
              className={`font-medium hover:underline cursor-pointer ${accentClasses.noticeClose}`}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {editingFolder && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onChangeFolder(folderInput);
            setEditingFolder(false);
          }}
          className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5"
        >
          <input
            ref={folderInputRef}
            type="text"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder="Tempel link folder Google Drive atau ID folder..."
            className={`min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none ${accentClasses.inputFocus}`}
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            Simpan Folder
          </button>
          {onResetDefaultFolder && (
            <button
              type="button"
              onClick={() => {
                onResetDefaultFolder();
                setEditingFolder(false);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              {defaultFolderLabel}
            </button>
          )}
          {isConnected && (
            <button
              type="button"
              onClick={() => {
                onCreatePersonalFolder();
                setEditingFolder(false);
              }}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${accentClasses.createBtn}`}
            >
              {createFolderLabel}
            </button>
          )}
        </form>
      )}

      {showFiles && isConnected && (
        <div className="border-t border-slate-100 pt-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              File Terbaru di Folder Drive
            </span>
            <button
              type="button"
              onClick={onRefreshFiles}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Muat Ulang</span>
            </button>
          </div>
          {folderFiles.length === 0 ? (
            <p className="text-xs text-slate-400">
              Belum ada file tersimpan di folder ini.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {folderFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <span className="truncate font-medium text-slate-700">
                    {file.name}
                  </span>
                  <div className="flex items-center gap-3 shrink-0 text-slate-400">
                    {file.modifiedTime && (
                      <span className="tabular-nums">
                        {new Date(file.modifiedTime).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`hover:underline font-medium ${accentClasses.link}`}
                      >
                        Buka
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {driveError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
        >
          <span className="flex-1 min-w-[200px]">{driveError}</span>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isConnected &&
              (driveError.includes("izin") ||
                driveError.includes("Read-only") ||
                driveError.includes("ditemukan")) && (
                <button
                  type="button"
                  onClick={onCreatePersonalFolder}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Buat Folder di Drive Saya</span>
                </button>
              )}
            {!isConnected && driveSuggestRedirect && (
              <button
                type="button"
                disabled={isLoggingIn}
                onClick={onGoogleSignInRedirect}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>Login Tanpa Pop-up</span>
              </button>
            )}
            {driveSuggestNewTab && typeof window !== "undefined" && (
              <>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap"
                >
                  <span>Buka di Tab Baru</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setCopiedAppUrl(true);
                      setTimeout(() => setCopiedAppUrl(false), 2000);
                    } catch {
                      // ignore clipboard errors
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copiedAppUrl ? (
                    <>
                      <Check className="h-3 w-3 text-teal-700" />
                      <span>Link Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Salin Link</span>
                    </>
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onDismissError}
              className="font-medium text-red-700 hover:underline shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
