"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { humanizeDbError } from "@/lib/errors";
import { checkTransition, STATUSES, type TaskStatus } from "@/lib/workflow";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = s(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Введите email и пароль" };
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: "Неверный email или пароль" };
  redirect("/");
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}

const objectSchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(200, "Название до 200 символов"),
  address: z.string().trim().min(1, "Укажите адрес").max(500, "Адрес до 500 символов"),
});

async function managerOnly() {
  const session = await requireSession();
  if (session.user.role !== "manager") return { session, error: "Это действие доступно только постановщику" };
  return { session, error: undefined };
}

export async function saveObject(_: ActionState, fd: FormData): Promise<ActionState> {
  const { session, error } = await managerOnly();
  if (error) return { error };
  const parsed = objectSchema.safeParse({ name: s(fd, "name"), address: s(fd, "address") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = s(fd, "id");
  let newId = id;
  try {
    if (id) await session.repo.updateObject(id, parsed.data);
    else newId = await session.repo.createObject(parsed.data);
  } catch (e) {
    return { error: humanizeDbError(e) };
  }
  revalidatePath("/objects");
  if (!id) redirect(`/objects/${newId}`);
  revalidatePath(`/objects/${id}`);
  return { ok: true };
}

export async function deleteObject(_: ActionState, fd: FormData): Promise<ActionState> {
  const { session, error } = await managerOnly();
  if (error) return { error };
  try {
    await session.repo.deleteObject(s(fd, "id"));
  } catch (e) {
    return { error: humanizeDbError(e) };
  }
  revalidatePath("/objects");
  redirect("/objects");
}

const taskSchema = z.object({
  title: z.string().trim().min(1, "Укажите название").max(200, "Название до 200 символов"),
  description: z.string().max(5000, "Описание до 5000 символов"),
  object_id: z.uuid("Выберите объект"),
  assignee_id: z.uuid("Выберите исполнителя"),
});

export async function saveTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const { session, error } = await managerOnly();
  if (error) return { error };
  const parsed = taskSchema.safeParse({
    title: s(fd, "title"), description: s(fd, "description"), object_id: s(fd, "object_id"), assignee_id: s(fd, "assignee_id"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = s(fd, "id");
  let newId = id;
  try {
    if (id) await session.repo.updateTask(id, parsed.data);
    else newId = await session.repo.createTask(parsed.data);
  } catch (e) {
    return { error: humanizeDbError(e) };
  }
  revalidatePath(`/objects/${parsed.data.object_id}`);
  if (!id) redirect(`/tasks/${newId}`);
  revalidatePath(`/tasks/${id}`);
  return { ok: true };
}

export async function deleteTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const { session, error } = await managerOnly();
  if (error) return { error };
  const objectId = s(fd, "object_id");
  try {
    await session.repo.deleteTask(s(fd, "id"));
  } catch (e) {
    return { error: humanizeDbError(e) };
  }
  revalidatePath(`/objects/${objectId}`);
  redirect(`/objects/${objectId}`);
}

export async function changeStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession();
  const id = s(fd, "id");
  const to = s(fd, "to") as TaskStatus;
  const comment = s(fd, "comment") || null;
  if (!STATUSES.includes(to)) return { error: "Неизвестный статус" };
  try {
    const task = await session.repo.getTask(id);
    if (!task) return { error: "Задача не найдена или недоступна" };
    // Быстрая серверная предпроверка; окончательно решает триггер в БД
    const err = checkTransition(session.user, task, to, comment);
    if (err) return { error: err };
    await session.repo.changeStatus(id, to, comment);
  } catch (e) {
    return { error: humanizeDbError(e) };
  }
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/my-tasks");
  return { ok: true };
}
