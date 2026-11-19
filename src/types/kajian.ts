export interface TranscriptSegment {
  id: string;
  timestamp: string;
  text: string;
  createdAt: number;
}

export interface KajianTerm {
  istilah: string;
  makna: string;
}

export interface KajianSummary {
  ringkasanSingkat: string;
  poinUtama: string[];
  nasihatPraktis: string[];
  istilahKunci: KajianTerm[];
  catatanRapih: string;
  generatedAt: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface KajianEnrichment {
  markdown: string;
  sources: GroundingSource[];
  query?: string;
  generatedAt: string;
}

export interface KajianNote {
  id: string;
  title: string;
  speaker: string;
  location: string;
  date: string;
  notes: string;
  segments: TranscriptSegment[];
  summary: KajianSummary | null;
  enrichment: KajianEnrichment | null;
  driveNoteFileId?: string;
  driveNoteWebLink?: string;
  driveFolderId?: string;
  lastDriveSyncedAt?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  updatedAt: number;
}

export type SpeechLanguage = "auto" | "id-ID" | "ar-SA" | "en-US";
