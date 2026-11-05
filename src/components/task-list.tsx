import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Empty } from "@/components/empty";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import type { TaskRow } from "@/lib/data/types";

// Список уже отфильтрован на сервере по параметрам URL.
export function TaskList({ tasks, total, showObject = true, showAssignee = true, emptyHint }: {
  tasks: TaskRow[]; total?: number; showObject?: boolean; showAssignee?: boolean; emptyHint?: string;
}) {
  const filteredOut = (total ?? tasks.length) > 0;
  if (!tasks.length)
    return <Empty icon={ClipboardList} title={filteredOut ? "Нет задач под выбранные фильтры" : "Задач пока нет"} hint={filteredOut ? "Измените фильтры выше." : emptyHint} />;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background" data-testid="task-list">
      {tasks.map((t) => (
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
  );
}
