"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { cn } from "@/lib/utils";
import { STATUSES, STATUS_LABEL, type TaskStatus } from "@/lib/workflow";

/** Обновление query-параметра без перезагрузки (router.replace) с индикатором. */
export function useQueryParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (key: string, value: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (value === null || value === "") p.delete(key); else p.set(key, value);
    const qs = p.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, set, pending };
}

export interface Opt { id: string; name: string }

export function TaskFilters({ status, statusDefault = "all", assignee, object, workers, objects, shown, total }: {
  status: string; statusDefault?: string; assignee?: string; object?: string; workers?: Opt[]; objects?: Opt[]; shown: number; total: number;
}) {
  const { set, pending } = useQueryParam();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="task-filters">
      <label htmlFor="status-filter" className="text-sm text-muted-foreground">Статус:</label>
      <NativeSelect id="status-filter" className="w-48" value={status}
        onChange={(e) => set("status", e.target.value === statusDefault ? null : e.target.value)}>
        <option value="active">Все, кроме принятых</option>
        <option value="all">Все</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </NativeSelect>
      {workers && (
        <>
          <label htmlFor="assignee-filter" className="text-sm text-muted-foreground">Исполнитель:</label>
          <NativeSelect id="assignee-filter" className="w-48" value={assignee ?? ""} onChange={(e) => set("assignee", e.target.value)}>
            <option value="">Все</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </NativeSelect>
        </>
      )}
      {objects && (
        <>
          <label htmlFor="object-filter" className="text-sm text-muted-foreground">Объект:</label>
          <NativeSelect id="object-filter" className="w-52" value={object ?? ""} onChange={(e) => set("object", e.target.value)}>
            <option value="">Все объекты</option>
            {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </NativeSelect>
        </>
      )}
      <span className="text-sm text-muted-foreground" data-testid="filter-count">{shown} из {total}</span>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

/** Счётчики по статусам — кликабельные «чипы», ставят ?status=. */
export function StatusChips({ counts, current, base }: { counts: Record<TaskStatus, number>; current: string; base: string }) {
  const { params } = useQueryParam();
  const href = (s: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (s) p.set("status", s); else p.delete("status");
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const chip = (key: string, label: string, n: number, on: boolean, h: string) => (
    <Link key={key} href={h} replace scroll={false} data-testid={`chip-${key}`}
      className={cn("rounded-full border px-3 py-1 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted", !n && !on && "opacity-50")}>
      {label}: {n}
    </Link>
  );
  return (
    <div className="flex flex-wrap gap-2" data-testid="status-chips">
      {chip("all", "Все", total, current === "all", href(null))}
      {STATUSES.map((s) => chip(s, STATUS_LABEL[s], counts[s], current === s, href(s)))}
    </div>
  );
}
