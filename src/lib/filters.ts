import { STATUSES, type TaskStatus } from "@/lib/workflow";
import type { TaskRow } from "@/lib/data/types";

// Фильтры живут в URL (?status=…&assignee=…&object=…): ссылкой можно поделиться, «назад» работает.
export type StatusParam = TaskStatus | "all" | "active";
export function parseStatus(v: string | string[] | undefined, fallback: StatusParam = "all"): StatusParam {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "all" || s === "active" || STATUSES.includes(s as TaskStatus) ? (s as StatusParam) : fallback;
}
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function filterTasks(tasks: TaskRow[], f: { status: StatusParam; assigneeId?: string; objectId?: string }) {
  return tasks.filter((t) =>
    (f.status === "all" || (f.status === "active" ? t.status !== "accepted" : t.status === f.status)) &&
    (!f.assigneeId || t.assignee_id === f.assigneeId) &&
    (!f.objectId || t.object_id === f.objectId));
}

export function statusCounts(tasks: TaskRow[]) {
  return Object.fromEntries(STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length])) as Record<TaskStatus, number>;
}
