import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { requireSession } from "@/lib/session";
import { deleteObject } from "@/app/actions";
import { ObjectFormDialog } from "@/components/object-form-dialog";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { TaskList } from "@/components/task-list";
import { STATUSES, STATUS_LABEL } from "@/lib/workflow";

export default async function ObjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, repo } = await requireSession();
  const isManager = user.role === "manager";
  const [object, tasks] = await Promise.all([repo.getObject(id), repo.listTasks({ objectId: id })]);
  if (!object) notFound(); // RLS: чужой объект для исполнителя не виден
  const [objects, workers] = isManager ? await Promise.all([repo.listObjects(), repo.listWorkers()]) : [[], []];
  const counts = STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length] as const).filter(([, n]) => n);
  return (
    <div className="grid gap-6">
      <Link href="/objects" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Объекты</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-background p-5">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="object-name">{object.name}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" />{object.address}</p>
          {!!counts.length && (
            <p className="mt-2 text-xs text-muted-foreground">{counts.map(([s, n]) => `${STATUS_LABEL[s]}: ${n}`).join(" · ")}</p>
          )}
        </div>
        {isManager && (
          <div className="flex gap-2">
            <ObjectFormDialog object={object} />
            <ConfirmDelete action={deleteObject} fields={{ id: object.id }} title="Удалить объект?"
              description="Объект можно удалить, только если в нём нет задач." />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isManager ? "Задачи" : "Ваши задачи на объекте"}</h2>
        {isManager && (
          <TaskFormDialog defaultObjectId={object.id}
            objects={objects.map((o) => ({ id: o.id, name: o.name }))}
            workers={workers.map((w) => ({ id: w.id, name: w.full_name }))} />
        )}
      </div>
      <TaskList tasks={tasks} showObject={false} showAssignee={isManager}
        emptyHint={isManager ? "Создайте задачу кнопкой «Новая задача»." : undefined} />
    </div>
  );
}
