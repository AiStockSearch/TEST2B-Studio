import { cn } from "@/lib/utils";
import { STATUS_LABEL, type TaskStatus } from "@/lib/workflow";

const COLORS: Record<TaskStatus, string> = {
  new: "bg-slate-100 text-slate-700 ring-slate-200",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
  review: "bg-amber-50 text-amber-800 ring-amber-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rework: "bg-red-50 text-red-700 ring-red-200",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", COLORS[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}
