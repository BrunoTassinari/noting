import type { SVGProps } from "react";

// Ícones de traço (sem emoji), no mesmo estilo do design.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, strokeWidth = 1.8, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Base>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </Base>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Base>
  );
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 10v6M9 13h6" />
    </Base>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    </Base>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Base>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <path d="m9 6 6 6-6 6" />
    </Base>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base strokeWidth={2.2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function MoreIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Base>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </Base>
  );
}

export function CloudCheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9H7z" />
      <path d="m9.5 13 2 2 3.5-4" />
    </Base>
  );
}

export function CloudAlertIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9H7z" />
      <path d="M12 10.5v3M12 16h.01" />
    </Base>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Base>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M10 13h6M13.5 10.5 16 13l-2.5 2.5" />
    </Base>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Base>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function TaskIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Base>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Base>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <path d="m15 6-6 6 6 6" />
    </Base>
  );
}

/** Calendário com o dia marcado ("Hoje"). */
export function CalendarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
      <rect x="8" y="13" width="3.5" height="3.5" rx="0.8" />
    </Base>
  );
}

/** Calendário com uma linha destacada (semana). */
export function CalendarWeekIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
      <path d="M7.5 14.5h9" strokeWidth={2.6} />
    </Base>
  );
}

/** Calendário com a grade do mês. */
export function CalendarMonthIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
      <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01M16 17h.01" strokeWidth={2.4} />
    </Base>
  );
}
