import type { KajianNote } from "../types/kajian";
import type { TrainingSession } from "../types/pelatihan";
import { buildPelatihanMarkdownContent } from "./pelatihanPdfExport";

export const DEFAULT_DRIVE_FOLDER_ID = "1OHZGyn7y_FocGIEyVNnTmobU2SC0X8UJ";
export const DEFAULT_DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/1OHZGyn7y_FocGIEyVNnTmobU2SC0X8UJ?usp=sharing";

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  capabilities?: {
    canAddChildren?: boolean;
  };
}

export function extractDriveFolderId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_DRIVE_FOLDER_ID;
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];
  const idParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam?.[1]) return idParam[1];
  return trimmed;
}

export function buildKajianMarkdownContent(note: KajianNote): string {
  const title = note.title.trim() || "Catatan Kajian";
  const meta = [
    note.speaker.trim() ? `Pemateri: ${note.speaker.trim()}` : "",
    note.location.trim() ? `Majelis: ${note.location.trim()}` : "",
    note.date.trim() ? `Tanggal: ${note.date.trim()}` : "",
    note.sourceUrl?.trim()
      ? `Sumber (${note.sourcePlatform || "Link"}): ${note.sourceUrl.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const sections: string[] = [`# ${title}`];
  if (meta) sections.push(meta);

  if (note.notes.trim()) {
    sections.push(note.notes.trim());
  }

  if (note.summary) {
    const s = note.summary;
    const sumLines = ["## Ringkasan Kajian", "", s.ringkasanSingkat];
    if (s.poinUtama.length > 0) {
      sumLines.push("", "### Poin Pembahasan", ...s.poinUtama.map((p) => `- ${p}`));
    }
    if (s.nasihatPraktis.length > 0) {
      sumLines.push(
        "",
        "### Amal & Hikmah Praktis",
        ...s.nasihatPraktis.map((p) => `- ${p}`)
      );
    }
    if (s.istilahKunci.length > 0) {
      sumLines.push(
        "",
        "### Istilah Kunci",
        ...s.istilahKunci.map((t) => `- **${t.istilah}**: ${t.makna}`)
      );
    }
    sections.push(sumLines.join("\n"));
  }

  if (note.enrichment?.markdown) {
    const enrichLines = [
      "## Pelengkap & Dalil Rujukan Online",
      "",
      note.enrichment.markdown,
    ];
    if (note.enrichment.sources.length > 0) {
      enrichLines.push(
        "",
        "### Sumber Online",
        ...note.enrichment.sources.map((src) => `- [${src.title}](${src.uri})`)
      );
    }
    sections.push(enrichLines.join("\n"));
  }

  if (note.segments.length > 0) {
    sections.push(
      [
        "## Transkrip Suara",
        "",
        ...note.segments.map((seg) => `- **[${seg.timestamp}]** ${seg.text}`),
      ].join("\n")
    );
  }

  return sections.join("\n\n");
}

function buildSafeFileName(title: string, ext: string): string {
  const base = (title.trim() || "Catatan Kajian")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 90);
  return `${base}.${ext}`;
}

function mapDriveHttpError(status: number, rawBody: string): Error {
  let msg = `Google Drive error (${status})`;
  try {
    const data = JSON.parse(rawBody) as {
      error?: { message?: string; code?: number };
    };
    if (data?.error?.message) {
      msg = data.error.message;
    }
  } catch {
    // ignore
  }
  if (status === 401) {
    return new Error("UNAUTHORIZED_DRIVE");
  }
  if (status === 403 || status === 404) {
    return new Error(
      `Tidak memiliki izin atau folder Google Drive tidak ditemukan (${msg}). Pastikan akun Google Anda memiliki akses Edit pada folder tujuan atau klik Ubah Folder.`
    );
  }
  return new Error(msg);
}

async function parseDriveError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => "");
  return mapDriveHttpError(res.status, text);
}

export async function verifyDriveFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFileInfo> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      folderId
    )}?fields=id,name,webViewLink,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw await parseDriveError(res);
  }
  const info = (await res.json()) as DriveFileInfo;
  if (info.capabilities && info.capabilities.canAddChildren === false) {
    throw new Error(
      `Folder "${info.name}" hanya memiliki izin Lihat (Read-only). Minta akses Editor dari pemilik folder atau klik "Ubah Folder" ke folder Google Drive Anda sendiri.`
    );
  }
  return info;
}

export async function createDriveFolder(
  accessToken: string,
  folderName = "CatatKajian"
): Promise<DriveFileInfo> {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,mimeType&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      }),
    }
  );
  if (!res.ok) {
    throw await parseDriveError(res);
  }
  return (await res.json()) as DriveFileInfo;
}

export async function findOrCreateDriveFolder(
  accessToken: string,
  folderName: string
): Promise<DriveFileInfo> {
  const escaped = folderName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=5&fields=files(id,name,mimeType,webViewLink,capabilities(canAddChildren))&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (res.ok) {
    const data = (await res.json()) as { files?: DriveFileInfo[] };
    const writable = (data.files ?? []).find(
      (f) => f.capabilities?.canAddChildren !== false
    );
    if (writable) {
      return writable;
    }
  }
  return createDriveFolder(accessToken, folderName);
}

export async function listDriveFolderFiles(
  accessToken: string,
  folderId: string
): Promise<DriveFileInfo[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name,mimeType,modifiedTime,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw await parseDriveError(res);
  }
  const data = (await res.json()) as { files?: DriveFileInfo[] };
  return data.files ?? [];
}

function multipartUpload(
  accessToken: string,
  metadata: Record<string, unknown>,
  blob: Blob,
  existingFileId?: string,
  onProgress?: (percent: number) => void
): Promise<DriveFileInfo> {
  const boundary = `catatkajian_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart =
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `${delimiter}Content-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`;

  const body = new Blob([metaPart, blob, closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        existingFileId
      )}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink&supportsAllDrives=true`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink&supportsAllDrives=true`;

  return new Promise<DriveFileInfo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(existingFileId ? "PATCH" : "POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

    if (onProgress) {
      onProgress(5);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.max(
            5,
            Math.min(98, Math.round((event.loaded / event.total) * 100))
          );
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        try {
          resolve(JSON.parse(xhr.responseText) as DriveFileInfo);
        } catch {
          reject(new Error("Respons Google Drive tidak valid."));
        }
      } else {
        reject(mapDriveHttpError(xhr.status, xhr.responseText || ""));
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          "Koneksi terputus saat mengunggah ke Google Drive. Periksa internet Anda dan coba lagi."
        )
      );
    };

    xhr.onabort = () => {
      reject(new Error("Unggahan ke Google Drive dibatalkan."));
    };

    xhr.send(body);
  });
}

export async function saveKajianNoteToDrive(
  accessToken: string,
  note: KajianNote,
  folderId: string,
  onProgress?: (percent: number) => void
): Promise<DriveFileInfo> {
  const markdown = buildKajianMarkdownContent(note);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const fileName = buildSafeFileName(note.title, "md");

  if (note.driveNoteFileId && note.driveFolderId === folderId) {
    try {
      return await multipartUpload(
        accessToken,
        { name: fileName },
        blob,
        note.driveNoteFileId,
        onProgress
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // If file was deleted from Drive externally, create a fresh file
      if (!msg.includes("404") && !msg.includes("tidak ditemukan")) {
        throw err;
      }
    }
  }

  return multipartUpload(
    accessToken,
    {
      name: fileName,
      parents: [folderId],
      mimeType: "text/markdown",
    },
    blob,
    undefined,
    onProgress
  );
}

export async function savePelatihanSessionToDrive(
  accessToken: string,
  session: TrainingSession,
  folderId: string,
  onProgress?: (percent: number) => void
): Promise<DriveFileInfo> {
  const markdown = buildPelatihanMarkdownContent(session);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const rawTitle = session.title.trim() || `Pelatihan ${session.category}`;
  const fileName = buildSafeFileName(`Pelatihan - ${rawTitle}`, "md");

  if (session.driveNoteFileId && session.driveFolderId === folderId) {
    try {
      return await multipartUpload(
        accessToken,
        { name: fileName },
        blob,
        session.driveNoteFileId,
        onProgress
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("404") && !msg.includes("tidak ditemukan")) {
        throw err;
      }
    }
  }

  return multipartUpload(
    accessToken,
    {
      name: fileName,
      parents: [folderId],
      mimeType: "text/markdown",
    },
    blob,
    undefined,
    onProgress
  );
}

export async function uploadAudioToDrive(
  accessToken: string,
  audioBlob: Blob,
  noteTitle: string,
  folderId: string,
  customFileName?: string,
  onProgress?: (percent: number) => void,
  filePrefix = "Rekaman"
): Promise<DriveFileInfo> {
  const mime = audioBlob.type.split(";")[0] || "audio/webm";
  const ext = mime.includes("mp4")
    ? "m4a"
    : mime.includes("mpeg")
    ? "mp3"
    : mime.includes("wav")
    ? "wav"
    : mime.includes("ogg")
    ? "ogg"
    : "webm";

  const timeTag = new Date()
    .toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    .replace(/[:.]/g, "-");

  const safeTitle = (noteTitle.trim() || "Audio")
    .replace(/[\\/:*?"<>|]/g, "-")
    .slice(0, 60);
  const fileName =
    customFileName || `${filePrefix} - ${safeTitle} (${timeTag}).${ext}`;

  return multipartUpload(
    accessToken,
    {
      name: fileName,
      parents: [folderId],
    },
    audioBlob,
    undefined,
    onProgress
  );
}
