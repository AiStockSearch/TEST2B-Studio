// Ограничения вложений. Дублируют bucket (mime, 5 МБ) и политики/триггер БД (5 файлов на задачу и тип).
export const BUCKET = "task-photos";
export const MAX_FILES = 5;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const ACCEPT = Object.keys(MIME_EXT).join(",");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function pathPattern(taskId: string, kind: "brief" | "result") {
  return new RegExp(`^${taskId}/${kind}/${UUID}\\.(jpg|jpeg|png|webp)$`);
}

/** Ошибка для пользователя или null. existing — уже прикреплено к задаче этого типа. */
export function validateFiles(files: File[] | { type: string; size: number }[], existing = 0): string | null {
  if (existing + files.length > MAX_FILES) return `Можно прикрепить не больше ${MAX_FILES} фото (уже ${existing})`;
  for (const f of files) {
    if (!MIME_EXT[f.type]) return "Подходят только фото JPG, PNG или WebP";
    if (f.size > MAX_BYTES) return "Файл больше 5 МБ";
  }
  return null;
}
