import type { GroundingSource, TranscriptSegment } from "./kajian";

export type TrainingCategory =
  | "Workshop"
  | "Seminar"
  | "Bootcamp"
  | "In-House"
  | "Webinar";

export type TrainingMarkerKind = "penting" | "aksi" | "sop" | "pertanyaan";

export interface TrainingMarker {
  id: string;
  timestamp: string;
  kind: TrainingMarkerKind;
  note: string;
  createdAt: number;
}

export type ActionPriority = "Tinggi" | "Sedang" | "Rendah";

export interface TrainingActionItem {
  id: string;
  task: string;
  owner: string;
  dueHint: string;
  priority: ActionPriority;
  done: boolean;
}

export interface TrainingModule {
  judul: string;
  ringkasan: string;
  poinKunci: string[];
  langkahPraktis: string[];
}

export interface TrainingTerm {
  istilah: string;
  penjelasan: string;
}

export interface TrainingQuizQuestion {
  id: string;
  pertanyaan: string;
  pilihan: string[];
  jawabanIndex: number;
  pembahasan: string;
}

export interface TrainingSmartAnalysis {
  ringkasanEksekutif: string;
  tujuanPembelajaran: string[];
  modulMateri: TrainingModule[];
  tindakLanjut: Array<{
    task: string;
    owner: string;
    dueHint: string;
    priority: ActionPriority;
  }>;
  istilahKunci: TrainingTerm[];
  kuisEvaluasi: TrainingQuizQuestion[];
  catatanRapiMarkdown: string;
  generatedAt: string;
}

export interface TrainingQaEntry {
  id: string;
  question: string;
  answerMarkdown: string;
  sources: GroundingSource[];
  createdAt: string;
}

export interface TrainingSession {
  id: string;
  title: string;
  trainer: string;
  organizer: string;
  category: TrainingCategory;
  date: string;
  notes: string;
  segments: TranscriptSegment[];
  markers: TrainingMarker[];
  actionItems: TrainingActionItem[];
  analysis: TrainingSmartAnalysis | null;
  qaHistory: TrainingQaEntry[];
  sourceUrl?: string;
  sourcePlatform?: string;
  driveNoteFileId?: string;
  driveNoteWebLink?: string;
  driveFolderId?: string;
  lastDriveSyncedAt?: string;
  updatedAt: number;
}
