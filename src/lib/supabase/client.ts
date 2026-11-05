"use client";
import { createBrowserClient } from "@supabase/ssr";

// Браузерный клиент (сессия из cookie, только publishable/anon ключ) — для прямой загрузки фото в Storage.
// Права на загрузку проверяют политики storage.objects, а не этот код.
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
