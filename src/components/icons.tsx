import type { SVGProps } from "react";
import {
  ArrowLeft as LArrowLeft,
  ArrowUp as LArrowUp,
  Globe as LGlobe,
  History as LHistory,
  Paperclip as LPaperclip,
  Sparkles as LSparkles,
  Square as LSquare,
  ArrowRight as LArrowRight,
  BookOpen as LBookOpen,
  CalendarCheck as LCalendarCheck,
  CalendarDays as LCalendarDays,
  CalendarRange as LCalendarRange,
  Check as LCheck,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  ChevronsDownUp as LChevronsDownUp,
  CloudAlert as LCloudAlert,
  Ellipsis as LEllipsis,
  FileText as LFileText,
  Flag as LFlag,
  Folder as LFolder,
  FolderInput as LFolderInput,
  FolderPlus as LFolderPlus,
  Inbox as LInbox,
  Link as LLink,
  ListChecks as LListChecks,
  ListTree as LListTree,
  LogOut as LLogOut,
  Menu as LMenu,
  Monitor as LMonitor,
  Moon as LMoon,
  PanelLeft as LPanelLeft,
  PanelRight as LPanelRight,
  Plus as LPlus,
  Search as LSearch,
  ShoppingCart as LShoppingCart,
  SlidersHorizontal as LSlidersHorizontal,
  SquareArrowRight as LSquareArrowRight,
  SquareCheck as LSquareCheck,
  SquareMinus as LSquareMinus,
  SquarePen as LSquarePen,
  SquarePlus as LSquarePlus,
  Star as LStar,
  Sun as LSun,
  Trash2 as LTrash2,
  Undo2 as LUndo2,
  X as LX,
  type LucideIcon,
} from "lucide-react";

// Ícones de contorno da biblioteca Lucide (a mesma do Obsidian). Os nomes
// antigos (FolderIcon, SearchIcon...) continuam valendo em todo o app.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(Icon: LucideIcon, defaults: { size?: number } = {}) {
  function AppIcon({ size = defaults.size ?? 18, strokeWidth = 1.75, ...props }: IconProps) {
    return <Icon size={size} strokeWidth={Number(strokeWidth)} aria-hidden="true" {...(props as object)} />;
  }
  return AppIcon;
}

function Base({ size = 18, strokeWidth = 1.75, children, ...props }: IconProps) {
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

export const NoteIcon = make(LFileText);
export const LogoutIcon = make(LLogOut);
export const FolderIcon = make(LFolder);
export const FolderPlusIcon = make(LFolderPlus);
export const PencilIcon = make(LSquarePen);
export const SearchIcon = make(LSearch);
export const ChevronDownIcon = make(LChevronDown);
export const ChevronRightIcon = make(LChevronRight);
export const ArrowLeftIcon = make(LArrowLeft);
export const CloseIcon = make(LX);
export const PlusIcon = make(LPlus);
export const MoreIcon = make(LEllipsis, { size: 16 });
export const LinkIcon = make(LLink);
export const ListIcon = make(LListTree);
export const CloudAlertIcon = make(LCloudAlert);
export const TrashIcon = make(LTrash2);
export const MoveIcon = make(LFolderInput);
export const SlidersIcon = make(LSlidersHorizontal);
export const MenuIcon = make(LMenu);
export const TaskIcon = make(LSquareCheck);
export const UndoIcon = make(LUndo2);
export const ChevronLeftIcon = make(LChevronLeft);
export const CalendarIcon = make(LCalendarCheck);
export const CalendarWeekIcon = make(LCalendarRange);
export const CalendarMonthIcon = make(LCalendarDays);
export const MigrateIcon = make(LSquareArrowRight);
export const CancelTaskIcon = make(LSquareMinus);
export const InboxIcon = make(LInbox);
export const CheckIcon = make(LCheck);
export const ChecklistIcon = make(LListChecks);
export const FlagIcon = make(LFlag);
export const CartIcon = make(LShoppingCart);
export const StarIcon = make(LStar);
export const SunIcon = make(LSun);
export const MoonIcon = make(LMoon);
export const MonitorIcon = make(LMonitor);
export const ArrowRightIcon = make(LArrowRight);
export const SidebarLeftIcon = make(LPanelLeft);
export const SidebarRightIcon = make(LPanelRight);
export const TabNewIcon = make(LSquarePlus);
export const CollapseIcon = make(LChevronsDownUp);
export const BookIcon = make(LBookOpen);
export const SparklesIcon = make(LSparkles);
export const PaperclipIcon = make(LPaperclip);
export const SendIcon = make(LArrowUp);
export const StopIcon = make(LSquare);
export const HistoryIcon = make(LHistory);
export const GlobeIcon = make(LGlobe);

/** Nuvem com check (não existe nesta versão do Lucide). */
export function CloudCheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9H7z" />
      <path d="m9.5 13 2 2 3.5-4" />
    </Base>
  );
}
