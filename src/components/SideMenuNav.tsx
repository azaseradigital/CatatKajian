import React from "react";
import { BookOpen, Briefcase, X } from "lucide-react";

export type AppModule = "kajian" | "pelatihan";

interface SideMenuNavProps {
  activeModule: AppModule;
  onSelectModule: (module: AppModule) => void;
  onCloseMobile: () => void;
}

export const SideMenuNav: React.FC<SideMenuNavProps> = ({
  activeModule,
  onSelectModule,
  onCloseMobile,
}) => {
  const handleSelect = (mod: AppModule) => {
    onSelectModule(mod);
    onCloseMobile();
  };

  return (
    <div className="border-b border-slate-200 px-3 pt-3.5 pb-3">
      <div className="flex items-center justify-between px-1.5 mb-2">
        <span className="text-[11px] font-semibold tracking-wide text-slate-400">
          Daftar Menu
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          aria-label="Tutup menu samping"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label="Daftar menu utama" className="space-y-1">
        <button
          type="button"
          onClick={() => handleSelect("kajian")}
          aria-current={activeModule === "kajian" ? "page" : undefined}
          className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer ${
            activeModule === "kajian"
              ? "bg-teal-50 text-teal-900 font-semibold"
              : "text-slate-700 font-medium hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <BookOpen
            className={`h-4 w-4 shrink-0 ${
              activeModule === "kajian" ? "text-teal-700" : "text-slate-400"
            }`}
          />
          <span className="truncate">CatatKajian</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelect("pelatihan")}
          aria-current={activeModule === "pelatihan" ? "page" : undefined}
          className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer ${
            activeModule === "pelatihan"
              ? "bg-indigo-50 text-indigo-900 font-semibold"
              : "text-slate-700 font-medium hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Briefcase
            className={`h-4 w-4 shrink-0 ${
              activeModule === "pelatihan" ? "text-indigo-700" : "text-slate-400"
            }`}
          />
          <span className="truncate">Rekam Pelatihan</span>
        </button>
      </nav>
    </div>
  );
};
