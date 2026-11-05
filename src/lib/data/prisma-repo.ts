import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { TaskStatus } from "@/lib/workflow";
import { NotFoundOrForbidden, type AttachmentKind, type HistoryRow, type ObjectRow, type Repo, type TaskRow } from "./types";

// Один клиент на процесс. Соединение идёт под ролью postgres (BYPASSRLS),
// поэтому КАЖДЫЙ запрос обёрнут в withRls(): внутри транзакции роль понижается до authenticated
// и выставляются claims пользователя — ровно как это делает PostgREST.
const g = globalThis as unknown as { __prisma?: PrismaClient };
function client(): PrismaClient {
  if (!g.__prisma) {
    // Supabase pooler: TLS обязателен, цепочка сертификата Supabase не в системном хранилище —
    // шифруем, но не проверяем CA (sslmode из строки убираем, чтобы pg не переопределил ssl).
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.delete("sslmode");
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    const adapter = new PrismaPg({
      connectionString: url.toString(),
      max: 3,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
    g.__prisma = new PrismaClient({ adapter });
  }
  return g.__prisma;
}

type Tx = Prisma.TransactionClient;

export async function withRls<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return client().$transaction(async (tx) => {
    await tx.$executeRawUnsafe("set local role authenticated");
    await tx.$queryRaw`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  });
}

const taskInclude = {
  object: { select: { name: true } },
  assignee: { select: { full_name: true } },
  author: { select: { full_name: true } },
} as const;

type TaskWithRel = Prisma.tasksGetPayload<{ include: typeof taskInclude }>;
const toTask = (t: TaskWithRel): TaskRow => ({
  id: t.id, title: t.title, description: t.description, status: t.status as TaskStatus,
  created_at: t.created_at.toISOString(), updated_at: t.updated_at.toISOString(),
  object_id: t.object_id, object_name: t.object.name, assignee_id: t.assignee_id, assignee_name: t.assignee.full_name,
  author_id: t.author_id, author_name: t.author.full_name,
});

const isNotFound = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
async function mustAffect(p: Promise<{ count: number }>) {
  const r = await p;
  if (r.count === 0) throw new NotFoundOrForbidden();
}

export function prismaRepo(userId: string): Repo {
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withRls(userId, fn);
  return {
    getProfile: (id) => run(async (tx) => {
      const p = await tx.profiles.findUnique({ where: { id }, select: { id: true, role: true, full_name: true } });
      return p ? { ...p, role: p.role } : null;
    }),
    listWorkers: () => run((tx) => tx.profiles.findMany({
      where: { role: "worker" }, select: { id: true, role: true, full_name: true }, orderBy: { full_name: "asc" },
    })),
    listObjects: () => run(async (tx) => {
      const rows = await tx.objects.findMany({ orderBy: { created_at: "asc" }, include: { tasks: { select: { status: true } } } });
      return rows.map(toObject);
    }),
    getObject: (id) => run(async (tx) => {
      const o = await tx.objects.findUnique({ where: { id }, include: { tasks: { select: { status: true } } } });
      return o ? toObject(o) : null;
    }),
    createObject: (input) => run(async (tx) => (await tx.objects.create({ data: { name: input.name, address: input.address } as Prisma.objectsUncheckedCreateInput, select: { id: true } })).id),
    updateObject: (id, input) => run((tx) => mustAffect(tx.objects.updateMany({ where: { id }, data: input }))),
    deleteObject: (id) => run((tx) => mustAffect(tx.objects.deleteMany({ where: { id } }))),
    listTasks: (f) => run(async (tx) => (await tx.tasks.findMany({
      where: { object_id: f.objectId, assignee_id: f.assigneeId, status: f.status },
      include: taskInclude, orderBy: { created_at: "desc" },
    })).map(toTask)),
    getTask: (id) => run(async (tx) => {
      const t = await tx.tasks.findUnique({ where: { id }, include: taskInclude });
      return t ? toTask(t) : null;
    }),
    getHistory: (taskId) => run(async (tx) => (await tx.task_status_history.findMany({
      where: { task_id: taskId }, orderBy: { changed_at: "asc" }, include: { actor: { select: { full_name: true } } },
    })).map((h): HistoryRow => ({
      id: String(h.id), from_status: h.from_status as TaskStatus | null, to_status: h.to_status as TaskStatus,
      comment: h.comment, changed_at: h.changed_at.toISOString(), actor_name: h.actor.full_name,
    }))),
    // Пишем только разрешённые колонки (GRANT INSERT/UPDATE по колонкам); status/author ставит триггер
    // Raw INSERT: Prisma сам подставляет @default(now())/status в INSERT, а у authenticated
    // есть grant insert только на (id, title, description, object_id, assignee_id).
    createTask: (input) => run(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        insert into public.tasks (title, description, object_id, assignee_id)
        values (${input.title}, ${input.description}, ${input.object_id}::uuid, ${input.assignee_id}::uuid)
        returning id`;
      return rows[0].id;
    }),
    updateTask: (id, input) => run((tx) => mustAffect(tx.tasks.updateMany({ where: { id }, data: input }))),
    deleteTask: (id) => run((tx) => mustAffect(tx.tasks.deleteMany({ where: { id } }))),
    listAttachments: (taskId) => run(async (tx) => (await tx.task_attachments.findMany({
      where: { task_id: taskId }, orderBy: { created_at: "asc" }, include: { uploader: { select: { full_name: true } } },
    })).map((a) => ({ id: a.id, kind: a.kind as AttachmentKind, storage_path: a.storage_path, created_at: a.created_at.toISOString(), uploader_name: a.uploader.full_name }))),
    addAttachments: (taskId, kind, paths) => run(async (tx) => {
      for (const p of paths) {
        await tx.$executeRaw`insert into public.task_attachments (task_id, kind, storage_path)
          values (${taskId}::uuid, ${kind}::public.attachment_kind, ${p})`;
      }
    }),
    deleteAttachment: (id) => run(async (tx) => {
      const a = await tx.task_attachments.findUnique({ where: { id }, select: { storage_path: true } });
      if (!a) throw new NotFoundOrForbidden();
      await mustAffect(tx.task_attachments.deleteMany({ where: { id } }));
      return a.storage_path;
    }),
    // Смена статуса — только через SQL-функцию (триггер проверяет переход и пишет историю)
    changeStatus: (id, to, comment) => run(async (tx) => {
      try {
        await tx.$queryRaw`select (public.change_task_status(${id}::uuid, ${to}::public.task_status, ${comment})).id`;
      } catch (e) {
        if (isNotFound(e)) throw new NotFoundOrForbidden();
        throw e;
      }
    }),
  };
}

function toObject(o: { id: string; name: string; address: string; created_at: Date; tasks: { status: string }[] }): ObjectRow {
  return {
    id: o.id, name: o.name, address: o.address, created_at: o.created_at.toISOString(),
    task_count: o.tasks.length, open_count: o.tasks.filter((t) => t.status !== "accepted").length,
  };
}
