import React, { useRef, useState } from "react";
import {
  BookOpen,
  Download,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type { KajianNote } from "../types/kajian";
import { SideMenuNav, type AppModule } from "./SideMenuNav";

interface KajianSidebarProps {
  activeModule: AppModule;
  onSelectModule: (module: AppModule) => void;
  notes: KajianNote[];
  activeNoteId: string;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  onExportAll: () => void;
  onImportAll: (file: File) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const KajianSidebar: React.FC<KajianSidebarProps> = ({
  activeModule,
  onSelectModule,
  notes,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onExportAll,
  onImportAll,
  mobileOpen,
  onCloseMobile,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filteredNotes = notes.filter((note) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      note.title.toLowerCase().includes(q) ||
      note.speaker.toLowerCase().includes(q) ||
      note.location.toLowerCase().includes(q) ||
      note.notes.toLowerCase().includes(q)
    );
  });

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <SideMenuNav
        activeModule={activeModule}
        onSelectModule={onSelectModule}
        onCloseMobile={onCloseMobile}
      />

      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="text-xs font-semibold tracking-wide text-slate-500">
          Arsip Kajian ({notes.length})
        </span>
        <button
          type="button"
          onClick={() => {
            onCreateNote();
            onCloseMobile();
          }}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Buat catatan kajian baru"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Baru</span>
        </button>
      </div>

      <div className="px-3 py-2.5 border-b border-slate-200">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul atau pemateri..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filteredNotes.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <BookOpen className="mx-auto mb-2 h-5 w-5 text-slate-400" />
            <p className="text-xs text-slate-500">
              {searchQuery.trim()
                ? "Tidak ada catatan yang cocok dengan pencarian."
                : "Belum ada catatan kajian tersimpan."}
            </p>
            {!searchQuery.trim() && (
              <button
                type="button"
                onClick={onCreateNote}
                className="mt-3 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 transition-colors cursor-pointer"
              >
                Catat Kajian Pertama
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {filteredNotes.map((note) => {
              const isActive = note.id === activeNoteId;
              const isConfirming = confirmDeleteId === note.id;
              return (
                <li key={note.id}>
                  <div
                    className={`group flex items-start justify-between gap-2 rounded-lg px-3 py-2.5 transition-colors ${
                      isActive
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNote(note.id);
                        setConfirmDeleteId(null);
                        onCloseMobile();
                      }}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div
                        className={`truncate text-sm ${
                          isActive
                            ? "font-semibold text-slate-900"
                            : "font-medium text-slate-800"
                        }`}
                      >
                        {note.title.trim() || "Kajian Tanpa Judul"}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <span className="truncate">
                          {note.speaker.trim() || "Pemateri belum diisi"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0 tabular-nums">{note.date}</span>
                      </div>
                    </button>

                    {notes.length > 1 && (
                      <div className="shrink-0 pt-0.5">
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteNote(note.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-200 cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(note.id)}
                            className="rounded p-1.5 text-slate-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 hover:bg-slate-200 hover:text-red-600 transition-opacity cursor-pointer"
                            aria-label={`Hapus ${note.title || "catatan"}`}
                            title="Hapus catatan"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 px-3 py-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onExportAll}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Cadangkan</span>
        </button>
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Impor</span>
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onImportAll(file);
              e.target.value = "";
            }
          }}
        />
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[264px] shrink-0 h-full">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[280px] max-w-[85vw] h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
