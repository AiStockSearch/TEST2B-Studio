"use client";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Empty } from "@/components/empty";
import { StatusBadge } from "@/components/status-badge";
import { NativeSelect } from "@/components/native-select";
import { useUi } from "@/stores/ui";
import { formatDate } from "@/lib/format";
import { STATUSES, STATUS_LABEL } from "@/lib/workflow";
import type { TaskRow } from "@/lib/data/types";

export function TaskList({ tasks, showObject = true, showAssignee = true, withFilter = false, emptyHint }: {
  tasks: TaskRow[]; showObject?: boolean; showAssignee?: boolean; withFilter?: boolean; emptyHint?: string;
}) {
  const { statusFilter, setStatusFilter } = useUi();
  const f = withFilter ? statusFilter : "all";
  const list = tasks.filter((t) => f === "all" || (f === "active" ? t.status !== "accepted" : t.status === f));
  return (
    <div className="grid gap-3">
      {withFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="status-filter" className="text-sm text-muted-foreground">Статус:</label>
          <NativeSelect id="status-filter" className="w-48" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="active">Все, кроме принятых</option>
            <option value="all">Все</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </NativeSelect>
          <span className="text-sm text-muted-foreground">{list.length} из {tasks.length}</span>
        </div>
      )}
      {!list.length ? (
        <Empty icon={ClipboardList} title={tasks.length ? "Нет задач с таким статусом" : "Задач пока нет"} hint={tasks.length ? undefined : emptyHint} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-background" data-testid="task-list">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/tasks/${t.id}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[showObject && t.object_name, showAssignee && `Исполнитель: ${t.assignee_name}`, formatDate(t.created_at)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
