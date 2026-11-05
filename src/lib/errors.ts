// Перевод ошибок БД (триггеры/RLS/ограничения) в человеческий текст.
const RULES: [RegExp, string][] = [
  [/comment is required for rework/i, "Для возврата на доработку нужен комментарий"],
  [/transition .* is not allowed/i, "Такой переход статуса запрещён"],
  [/only the assignee can move/i, "Менять этот статус может только назначенный исполнитель"],
  [/only manager can/i, "Это действие доступно только постановщику"],
  [/task not found/i, "Задача не найдена или недоступна"],
  [/accepted task is read-only/i, "Принятую задачу менять нельзя"],
  [/cannot reassign task under review/i, "Нельзя переназначить задачу, пока она на проверке"],
  [/status change must not modify other fields/i, "Статус и поля задачи меняются отдельно"],
  [/assignee must be a worker/i, "Исполнителем может быть только исполнитель"],
  [/violates foreign key constraint.*tasks_object_id_fkey|still referenced from table "tasks"/i, "Нельзя удалить объект, в котором есть задачи"],
  [/row-level security|permission denied|42501/i, "Недостаточно прав для этого действия"],
  [/check constraint|violates check/i, "Проверьте заполнение полей (пустые значения или слишком длинный текст)"],
  [/not authenticated|JWT/i, "Сессия истекла, войдите снова"],
];

export function humanizeDbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  for (const [re, text] of RULES) if (re.test(msg)) return text;
  console.error("[db]", msg);
  return "Не удалось выполнить действие. Попробуйте ещё раз";
}
