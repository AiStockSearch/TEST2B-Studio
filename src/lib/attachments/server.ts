import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttachmentRow } from "@/lib/data/types";
import { BUCKET } from "./rules";

export type AttachmentView = AttachmentRow & { url: string | null };

/** Подписанные ссылки на 1 час, от имени пользователя (политика storage.objects решает, что ему видно). */
export async function withSignedUrls(rows: AttachmentRow[]): Promise<AttachmentView[]> {
  if (!rows.length) return [];
  const sb = await createClient();
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 3600);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null }));
}
