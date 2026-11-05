// Таблица переходов — зеркало public.task_transition_actor() в БД.
// БД остаётся источником правды; здесь — только чтобы UI показывал доступные действия.
export type Role = "manager" | "worker";
export type TaskStatus = "new" | "in_progress" | "review" | "accepted" | "rework";

export const STATUSES: TaskStatus[] = ["new", "in_progress", "review", "accepted", "rework"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  review: "На проверке",
  accepted: "Принята",
  rework: "На доработке",
};

export const ROLE_LABEL: Record<Role, string> = { manager: "Постановщик", worker: "Исполнитель" };

type Actor = "assignee" | "manager";
export interface Transition {
  from: TaskStatus;
  to: TaskStatus;
  actor: Actor;
  label: string;
  commentRequired: boolean;
}

export const TRANSITIONS: readonly Transition[] = [
  { from: "new", to: "in_progress", actor: "assignee", label: "Взять в работу", commentRequired: false },
  { from: "in_progress", to: "review", actor: "assignee", label: "Отправить на проверку", commentRequired: false },
  { from: "review", to: "accepted", actor: "manager", label: "Принять", commentRequired: false },
  { from: "review", to: "rework", actor: "manager", label: "Вернуть на доработку", commentRequired: true },
  { from: "rework", to: "in_progress", actor: "assignee", label: "Взять в работу", commentRequired: false },
];

export function findTransition(from: TaskStatus, to: TaskStatus): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export interface Viewer {
  id: string;
  role: Role;
}

/** Действия, доступные пользователю для задачи в текущем статусе. */
export function availableTransitions(
  viewer: Viewer,
  task: { status: TaskStatus; assignee_id: string },
): Transition[] {
  return TRANSITIONS.filter((t) => {
    if (t.from !== task.status) return false;
    if (t.actor === "manager") return viewer.role === "manager";
    return viewer.id === task.assignee_id;
  });
}

/** Серверная предпроверка (дублирует триггер tasks_guard; финальное слово за БД). */
export function checkTransition(
  viewer: Viewer,
  task: { status: TaskStatus; assignee_id: string },
  to: TaskStatus,
  comment: string | null | undefined,
): string | null {
  const t = findTransition(task.status, to);
  if (!t) return `Переход «${STATUS_LABEL[task.status]}» → «${STATUS_LABEL[to]}» запрещён`;
  if (!availableTransitions(viewer, task).includes(t)) return "Это действие вам недоступно";
  if (t.commentRequired && !comment?.trim()) return "Для возврата на доработку нужен комментарий";
  return null;
}

/** Почему у пользователя нет действий в этом статусе (текст для карточки задачи). */
export function waitingReason(viewer: Viewer, task: { status: TaskStatus; assignee_id: string }, assigneeName = "исполнитель"): string {
  if (task.status === "accepted") return "Задача принята и закрыта. Дальнейших действий нет.";
  if (task.status === "review")
    return viewer.role === "manager" ? "" : "Задача на проверке у постановщика. Дождитесь решения: принять или вернуть на доработку.";
  if (viewer.role === "manager") {
    const next = { new: "взять задачу в работу", in_progress: "выполнить работу и отправить на проверку", rework: "взять задачу в доработку" }[task.status];
    return `Сейчас ход исполнителя (${assigneeName}): ${next}. Постановщик подключится, когда задача придёт на проверку.`;
  }
  return "Это действие доступно только назначенному исполнителю.";
}
