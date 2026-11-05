import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskStatus, Role } from "@/lib/workflow";
import { NotFoundOrForbidden, type ObjectRow, type Repo, type TaskRow } from "./types";

// Тот же контракт через PostgREST с JWT пользователя (RLS применяется на стороне Supabase).
const TASK_SELECT =
  "id,title,description,status,created_at,updated_at,object_id,assignee_id,author_id," +
  "object:objects(name),assignee:profiles!tasks_assignee_id_fkey(full_name),author:profiles!tasks_author_id_fkey(full_name)";

type Rel = { name?: string; full_name?: string } | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toTask = (t: any): TaskRow => ({
  id: t.id, title: t.title, description: t.description, status: t.status, created_at: t.created_at, updated_at: t.updated_at,
  object_id: t.object_id, object_name: (t.object as Rel)?.name ?? "—",
  assignee_id: t.assignee_id, assignee_name: (t.assignee as Rel)?.full_name ?? "—",
  author_id: t.author_id, author_name: (t.author as Rel)?.full_name ?? "—",
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toObject = (o: any): ObjectRow => ({
  id: o.id, name: o.name, address: o.address, created_at: o.created_at,
  task_count: o.tasks?.length ?? 0, open_count: (o.tasks ?? []).filter((t: { status: string }) => t.status !== "accepted").length,
});

function check<T extends { error: unknown }>(r: T): T {
  if (r.error) throw r.error;
  return r;
}
function affected(r: { error: unknown; data: unknown[] | null }) {
  check(r);
  if (!r.data?.length) throw new NotFoundOrForbidden();
}

export function supabaseRepo(sb: SupabaseClient): Repo {
  return {
    async getProfile(id) {
      const { data } = check(await sb.from("profiles").select("id,role,full_name").eq("id", id).maybeSingle());
      return data ? { id: data.id, role: data.role as Role, full_name: data.full_name } : null;
    },
    async listWorkers() {
      const { data } = check(await sb.from("profiles").select("id,role,full_name").eq("role", "worker").order("full_name"));
      return (data ?? []).map((p) => ({ ...p, role: p.role as Role }));
    },
    async listObjects() {
      const { data } = check(await sb.from("objects").select("id,name,address,created_at,tasks(status)").order("created_at"));
      return (data ?? []).map(toObject);
    },
    async getObject(id) {
      const { data } = check(await sb.from("objects").select("id,name,address,created_at,tasks(status)").eq("id", id).maybeSingle());
      return data ? toObject(data) : null;
    },
    async createObject(input) {
      const { data } = check(await sb.from("objects").insert(input).select("id").single());
      return data!.id;
    },
    async updateObject(id, input) { affected(await sb.from("objects").update(input).eq("id", id).select("id")); },
    async deleteObject(id) { affected(await sb.from("objects").delete().eq("id", id).select("id")); },
    async listTasks(f) {
      let q = sb.from("tasks").select(TASK_SELECT).order("created_at", { ascending: false });
      if (f.objectId) q = q.eq("object_id", f.objectId);
      if (f.assigneeId) q = q.eq("assignee_id", f.assigneeId);
      if (f.status) q = q.eq("status", f.status);
      const { data } = check(await q);
      return (data ?? []).map(toTask);
    },
    async getTask(id) {
      const { data } = check(await sb.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle());
      return data ? toTask(data) : null;
    },
    async getHistory(taskId) {
      const { data } = check(await sb.from("task_status_history")
        .select("id,from_status,to_status,comment,changed_at,actor:profiles(full_name)").eq("task_id", taskId).order("changed_at"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((h: any) => ({
        id: String(h.id), from_status: h.from_status, to_status: h.to_status, comment: h.comment, changed_at: h.changed_at,
        actor_name: h.actor?.full_name ?? "—",
      }));
    },
    async createTask(input) {
      const { data } = check(await sb.from("tasks").insert(input).select("id").single());
      return data!.id;
    },
    async updateTask(id, input) { affected(await sb.from("tasks").update(input).eq("id", id).select("id")); },
    async deleteTask(id) { affected(await sb.from("tasks").delete().eq("id", id).select("id")); },
    async listAttachments(taskId) {
      const { data } = check(await sb.from("task_attachments")
        .select("id,kind,storage_path,created_at,uploader:profiles(full_name)").eq("task_id", taskId).order("created_at"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((a: any) => ({ id: a.id, kind: a.kind, storage_path: a.storage_path, created_at: a.created_at, uploader_name: a.uploader?.full_name ?? "—" }));
    },
    async addAttachments(taskId, kind, paths) {
      check(await sb.from("task_attachments").insert(paths.map((storage_path) => ({ task_id: taskId, kind, storage_path }))));
    },
    async deleteAttachment(id) {
      const { data } = check(await sb.from("task_attachments").delete().eq("id", id).select("storage_path"));
      if (!data?.length) throw new NotFoundOrForbidden();
      return data[0].storage_path as string;
    },
    async changeStatus(id, to: TaskStatus, comment) {
      check(await sb.rpc("change_task_status", { p_task_id: id, p_new_status: to, p_comment: comment }));
    },
  };
}
