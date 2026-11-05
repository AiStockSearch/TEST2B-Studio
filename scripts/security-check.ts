/**
 * Проверка «в обход интерфейса»: прямые запросы к Supabase REST от имени исполнителя.
 * Ничего не меняет в данных (только попытки запрещённых действий + чтение).
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *      CHECK_MANAGER_EMAIL/PASSWORD, CHECK_WORKER_EMAIL/PASSWORD.
 * Опционально DATABASE_URL + флаг --prisma: те же проверки через Prisma-обёртку (SET LOCAL ROLE authenticated).
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let failed = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};

async function login(email: string, password: string) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { sb, id: data.user.id };
}

async function main() {
  const anon = createClient(URL, KEY, { auth: { persistSession: false } });
  // Настройки Auth публичны: проверяем флаг, не создавая пользователей
  const settings = await (await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } })).json();
  ok(settings.disable_signup === true, `открытая регистрация отключена (disable_signup=${settings.disable_signup})`);
  const anonTasks = await anon.from("tasks").select("id");
  ok(!!anonTasks.error || !anonTasks.data?.length, "anon не видит задачи");

  const m = await login(process.env.CHECK_MANAGER_EMAIL!, process.env.CHECK_MANAGER_PASSWORD!);
  const w = await login(process.env.CHECK_WORKER_EMAIL!, process.env.CHECK_WORKER_PASSWORD!);
  const all = (await m.sb.from("tasks").select("id,status,assignee_id,object_id")).data ?? [];
  const foreign = all.filter((t) => t.assignee_id !== w.id);
  const own = all.filter((t) => t.assignee_id === w.id);
  ok(foreign.length > 0 && own.length > 0, `есть свои (${own.length}) и чужие (${foreign.length}) задачи для проверки`);
  await checks(w.sb, w.id, own, foreign, all);
  await attachmentChecks(m.sb, w.sb, w.id, all);
  if (failed) { console.error(`\n${failed} проверок не прошло`); process.exit(1); }
  console.log("\nВсе проверки пройдены");
}

type T = { id: string; status: string; assignee_id: string; object_id: string };
async function checks(sb: SupabaseClient, uid: string, own: T[], foreign: T[], all: T[]) {
  const seen = (await sb.from("tasks").select("id,assignee_id")).data ?? [];
  ok(seen.length === own.length && seen.every((t) => t.assignee_id === uid), "исполнитель видит только свои задачи");
  const f = foreign[0];
  ok(!(await sb.from("tasks").select("id").eq("id", f.id)).data?.length, "чужая задача по id не читается");
  ok(!(await sb.from("task_status_history").select("id").eq("task_id", f.id)).data?.length, "история чужой задачи не читается");
  const upd = await sb.from("tasks").update({ title: "hack" }).eq("id", f.id).select("id");
  ok(!upd.data?.length, "чужую задачу нельзя изменить (UPDATE)");
  const updOwn = await sb.from("tasks").update({ title: "hack" }).eq("id", own[0].id).select("id");
  ok(!updOwn.data?.length, "исполнитель не меняет поля даже своей задачи");
  const del = await sb.from("tasks").delete().eq("id", f.id).select("id");
  ok(!del.data?.length, "чужую задачу нельзя удалить");
  const st = await sb.from("tasks").update({ status: "accepted" }).eq("id", own[0].id).select("id");
  ok(!!st.error, "прямой UPDATE status запрещён");
  const rpcForeign = await sb.rpc("change_task_status", { p_task_id: f.id, p_new_status: "in_progress" });
  ok(!!rpcForeign.error, `смена статуса чужой задачи через RPC отклонена (${rpcForeign.error?.message})`);
  const ownReview = own.find((t) => t.status === "review") ?? own[0];
  const bad = await sb.rpc("change_task_status", { p_task_id: ownReview.id, p_new_status: "accepted" });
  ok(!!bad.error, `исполнитель не может «Принять» (${bad.error?.message})`);
  const hist = await sb.from("task_status_history").insert({ task_id: own[0].id, to_status: "accepted", changed_by: uid });
  ok(!!hist.error, "подделать запись истории нельзя");
  const histDel = await sb.from("task_status_history").delete().eq("task_id", own[0].id).select("id");
  ok(!histDel.data?.length, "удалить историю нельзя");
  const role = await sb.from("profiles").update({ role: "manager" }).eq("id", uid).select("id");
  ok(!role.data?.length, "исполнитель не может сделать себя постановщиком");
  const objs = (await sb.from("objects").select("id")).data ?? [];
  const ownObjects = new Set(own.map((t) => t.object_id));
  ok(objs.length === ownObjects.size && objs.every((o) => ownObjects.has(o.id)), "видны только объекты со своими задачами");
  const ins = await sb.from("tasks").insert({ title: "x", object_id: all[0].object_id, assignee_id: uid }).select("id");
  ok(!!ins.error, "исполнитель не создаёт задачи");
}

// 1x1 PNG
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const png = () => new Blob([PNG], { type: "image/png" });

/** Вложения: временные задачи + фото от постановщика, проверки от имени исполнителя, затем уборка. */
async function attachmentChecks(m: SupabaseClient, w: SupabaseClient, wid: string, all: T[]) {
  const workers = (await m.from("profiles").select("id").eq("role", "worker")).data ?? [];
  const other = workers.find((p) => p.id !== wid)!.id;
  const obj = all[0].object_id;
  const mk = async (assignee: string) =>
    (await m.from("tasks").insert({ title: "SEC проверка вложений", object_id: obj, assignee_id: assignee }).select("id").single()).data!.id as string;
  const own = await mk(wid), foreign = await mk(other);
  const paths: string[] = [];
  try {
    for (const t of [own, foreign]) {
      const p = `${t}/brief/${crypto.randomUUID()}.png`;
      const up = await m.storage.from("task-photos").upload(p, png(), { contentType: "image/png" });
      ok(!up.error, `постановщик загружает фото-ТЗ (${up.error?.message ?? "ok"})`);
      ok(!(await m.from("task_attachments").insert({ task_id: t, kind: "brief", storage_path: p })).error, "постановщик регистрирует вложение");
      paths.push(p);
    }
    const seen = (await w.from("task_attachments").select("task_id")).data ?? [];
    ok(seen.every((a) => a.task_id !== foreign) && seen.some((a) => a.task_id === own), "исполнитель видит вложения только своих задач");
    const signed = await w.storage.from("task-photos").createSignedUrl(paths[1], 60);
    ok(!signed.data?.signedUrl, "исполнитель не получает ссылку на чужое фото");
    const signedOwn = await w.storage.from("task-photos").createSignedUrl(paths[0], 60);
    ok(!!signedOwn.data?.signedUrl, "исполнитель получает ссылку на фото своей задачи");
    const upForeign = await w.storage.from("task-photos").upload(`${foreign}/result/${crypto.randomUUID()}.png`, png(), { contentType: "image/png" });
    ok(!!upForeign.error, "исполнитель не загружает фото в чужую задачу");
    const upNew = await w.storage.from("task-photos").upload(`${own}/result/${crypto.randomUUID()}.png`, png(), { contentType: "image/png" });
    ok(!!upNew.error, "исполнитель не загружает результат, пока задача «Новая»");
    const rowForeign = await w.from("task_attachments").insert({ task_id: foreign, kind: "result", storage_path: `${foreign}/result/${crypto.randomUUID()}.png` });
    ok(!!rowForeign.error, "исполнитель не добавляет запись к чужой задаче");
    const brief = await w.from("task_attachments").insert({ task_id: own, kind: "brief", storage_path: `${own}/brief/${crypto.randomUUID()}.png` });
    ok(!!brief.error, "исполнитель не добавляет фото-ТЗ (brief)");
    const del = await w.from("task_attachments").delete().eq("task_id", own).select("id");
    ok(!del.data?.length, "исполнитель не удаляет вложения");
    const rm = await w.storage.from("task-photos").remove([paths[0]]);
    ok(!rm.data?.length, "исполнитель не удаляет файлы из Storage");
    const gif = await m.storage.from("task-photos").upload(`${own}/brief/${crypto.randomUUID()}.png`, new Blob([PNG], { type: "image/gif" }), { contentType: "image/gif" });
    ok(!!gif.error, "bucket не принимает не-картинки (mime)");
    const anonUp = await createClient(URL, KEY, { auth: { persistSession: false } }).storage.from("task-photos").createSignedUrl(paths[0], 60);
    ok(!anonUp.data?.signedUrl, "anon не получает ссылки на фото");
  } finally {
    await m.storage.from("task-photos").remove(paths);
    await m.from("tasks").delete().in("id", [own, foreign]);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
