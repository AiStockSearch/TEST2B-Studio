import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { deleteTask } from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { availableTransitions, STATUS_LABEL } from "@/lib/workflow";
import { StatusActions } from "./status-actions";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, repo } = await requireSession();
  const [task, history] = await Promise.all([repo.getTask(id), repo.getHistory(id)]);
  if (!task) notFound(); // RLS: чужая задача для исполнителя неотличима от несуществующей
  const isManager = user.role === "manager";
  const actions = availableTransitions(user, task).map((t) => ({ to: t.to, label: t.label, commentRequired: t.commentRequired }));
  const [objects, workers] = isManager && task.status !== "accepted"
    ? await Promise.all([repo.listObjects(), repo.listWorkers()]) : [[], []];

  const fields = [
    ["Объект", <Link key="o" href={`/objects/${task.object_id}`} className="underline-offset-4 hover:underline">{task.object_name}</Link>],
    ["Исполнитель", task.assignee_name],
    ["Автор", task.author_name],
    ["Создана", formatDate(task.created_at)],
  ] as const;

  return (
    <div className="grid gap-6">
      <Link href={`/objects/${task.object_id}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {task.object_name}
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle className="text-xl" data-testid="task-title">{task.title}</CardTitle>
                <span data-testid="task-status"><StatusBadge status={task.status} className="text-sm" /></span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5">
              <p className="whitespace-pre-wrap text-sm">{task.description || <span className="text-muted-foreground">Без описания</span>}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {fields.map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
              {isManager && task.status !== "accepted" && (
                <div className="flex gap-2 border-t pt-4">
                  <TaskFormDialog task={task} lockAssignee={task.status === "review"}
                    objects={objects.map((o) => ({ id: o.id, name: o.name }))}
                    workers={workers.map((w) => ({ id: w.id, name: w.full_name }))} />
                  <ConfirmDelete action={deleteTask} fields={{ id: task.id, object_id: task.object_id }}
                    title="Удалить задачу?" description="Задача и её история будут удалены без возможности восстановления." />
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Действия</CardTitle></CardHeader>
            <CardContent>
              <StatusActions taskId={task.id} actions={actions}
                emptyText={task.status === "accepted" ? "Задача принята и закрыта." : `Сейчас ход ${["review"].includes(task.status) ? "постановщика" : "исполнителя"}: для вас действий нет.`} />
            </CardContent>
          </Card>
        </div>
        <Card className="content-start">
          <CardHeader><CardTitle className="text-base">История статусов</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative grid gap-5 border-l pl-5" data-testid="history">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute top-1.5 -left-[26px] size-2.5 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    {h.from_status ? <><StatusBadge status={h.from_status} /><span className="text-muted-foreground">→</span></> : <span className="text-muted-foreground">Создана:</span>}
                    <StatusBadge status={h.to_status} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{h.actor_name} · {formatDate(h.changed_at)}</div>
                  {h.comment && <blockquote className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{h.comment}</blockquote>}
                </li>
              ))}
              {!history.length && <li className="text-sm text-muted-foreground">История пуста</li>}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">Записи создаёт база данных автоматически, изменить или удалить их нельзя. Текущий статус: {STATUS_LABEL[task.status]}.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
