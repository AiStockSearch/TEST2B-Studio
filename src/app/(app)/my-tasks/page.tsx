import { requireSession } from "@/lib/session";
import { TaskList } from "@/components/task-list";
import { TaskFilters } from "@/components/url-filters";
import { filterTasks, one, parseStatus } from "@/lib/filters";

type SP = Promise<Record<string, string | string[] | undefined>>;

// Исполнитель: свои задачи. Постановщик: все задачи (ему «видно всё», решение в ASSUMPTIONS.md).
export default async function MyTasksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, repo } = await requireSession();
  const isManager = user.role === "manager";
  const [all, objects] = await Promise.all([repo.listTasks(isManager ? {} : { assigneeId: user.id }), repo.listObjects()]);
  const status = parseStatus(sp.status, "active");
  const objectId = one(sp.object);
  const tasks = filterTasks(all, { status, objectId });
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isManager ? "Все задачи" : "Мои задачи"}</h1>
        <p className="text-sm text-muted-foreground">{isManager ? "Задачи по всем объектам" : "Задачи, назначенные на вас"}</p>
      </div>
      <TaskFilters status={status} statusDefault="active" object={objectId} shown={tasks.length} total={all.length}
        objects={objects.map((o) => ({ id: o.id, name: o.name }))} />
      <TaskList tasks={tasks} total={all.length} showAssignee={isManager}
        emptyHint={isManager ? "Задачи создаются в карточке объекта." : "Когда постановщик назначит вам задачу, она появится здесь."} />
    </div>
  );
}
