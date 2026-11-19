import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface DriveConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  accent?: "teal" | "indigo";
  onConfirm: () => void;
  onCancel: () => void;
}

export const DriveConfirmModal: React.FC<DriveConfirmModalProps> = ({
  isOpen,
  title,
  description,
  details,
  confirmLabel,
  accent = "teal",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const confirmBtnClass =
    accent === "indigo"
      ? "rounded-lg bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 transition-colors cursor-pointer"
      : "rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer";

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-confirm-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3
                id="drive-confirm-title"
                className="text-base font-semibold text-slate-900"
              >
                {title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Tutup dialog konfirmasi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {details.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
            {details.map((item, idx) => (
              <li key={idx}>• {item}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmBtnClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
