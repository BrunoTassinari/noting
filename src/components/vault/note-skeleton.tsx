"use client";

import Link from "next/link";
import { MenuIcon } from "@/components/icons";
import { TabHistoryNav } from "./tabs";
import { displayFolder, folderSegments, type NoteMeta } from "@/lib/note-paths";

const LINES = ["92%", "78%", "86%", "40%", "0", "70%", "88%", "55%"];

/** Nota abrindo: já mostra nome, pasta e o "formato" do texto. */
export function NoteSkeleton({ note }: { note: NoteMeta }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label={`Abrindo ${note.title}`}>
      <div className="flex h-[60px] shrink-0 items-center gap-1 bg-panel px-2 md:hidden">
        <Link href="/" aria-label="Abrir arquivos" className="flex size-11 items-center justify-center rounded-[10px] text-text">
          <MenuIcon size={22} />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-semibold text-text-strong">{note.title}</div>
          <div className="truncate text-xs text-muted">{displayFolder(note.path)}</div>
        </div>
        <span className="size-11" />
      </div>

      <div className="hidden h-9 shrink-0 items-center gap-2 bg-surface px-3 text-xs text-muted md:flex">
        <TabHistoryNav />
        {folderSegments(note.path).map((seg, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>{seg}</span>
            <span aria-hidden="true">/</span>
          </span>
        ))}
        <span className="truncate text-text">{note.title}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-surface px-5 pt-5 md:px-10 md:pt-10">
        <div className="w-full">
          <div className="mb-5 text-[28px] font-semibold leading-tight text-text-strong md:text-[32px]">
            {note.title}
          </div>
          <div className="flex flex-col gap-3.5">
            {LINES.map((w, i) => (
              <div
                key={i}
                className="h-3.5 animate-pulse rounded bg-card"
                style={{ width: w, opacity: w === "0" ? 0 : 1, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
