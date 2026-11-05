import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prismaRepo } from "@/lib/data/prisma-repo";
import { supabaseRepo } from "@/lib/data/supabase-repo";
import type { Profile, Repo } from "@/lib/data/types";

/** prisma — основной путь (DATABASE_URL задан); supabase — PostgREST с JWT пользователя. */
export function dataDriver(): "prisma" | "supabase" {
  const d = process.env.DATA_DRIVER;
  if (d === "prisma" || d === "supabase") return d;
  return process.env.DATABASE_URL ? "prisma" : "supabase";
}

export interface Session { user: Profile; repo: Repo }

/** Пользователь определяется на сервере через auth.getUser(), роль — из profiles. */
export const getSession = cache(async (): Promise<Session | null> => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const repo = dataDriver() === "prisma" ? prismaRepo(user.id) : supabaseRepo(sb);
  const profile = await repo.getProfile(user.id);
  if (!profile) return null;
  return { user: profile, repo };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login?error=profile");
  return s;
}
