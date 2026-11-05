"use client";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { BUCKET, MIME_EXT } from "./rules";

/** Загружает файлы в Storage от имени пользователя; возвращает пути. При ошибке удалять нечего — откат делает вызывающий. */
export async function uploadPhotos(taskId: string, kind: "brief" | "result", files: File[]): Promise<string[]> {
  const sb = createBrowserSupabase();
  const paths: string[] = [];
  for (const f of files) {
    const path = `${taskId}/${kind}/${crypto.randomUUID()}.${MIME_EXT[f.type]}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
    if (error) throw new Error(/row-level security|unauthorized|403/i.test(error.message)
      ? "Нет прав прикрепить фото к этой задаче" : /size|exceed/i.test(error.message) ? "Файл больше 5 МБ" : "Не удалось загрузить фото");
    paths.push(path);
  }
  return paths;
}
