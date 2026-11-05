import { requireSession } from "@/lib/session";
import { TaskList } from "@/components/task-list";

// Исполнитель: свои задачи. Постановщик: все задачи (ему «видно всё», решение в ASSUMPTIONS.md).
export default async function MyTasksPage() {
  const { user, repo } = await requireSession();
  const isManager = user.role === "manager";
  const tasks = await repo.listTasks(isManager ? {} : { assigneeId: user.id });
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isManager ? "Все задачи" : "Мои задачи"}</h1>
        <p className="text-sm text-muted-foreground">{isManager ? "Задачи по всем объектам" : "Задачи, назначенные на вас"}</p>
      </div>
      <TaskList tasks={tasks} withFilter showAssignee={isManager}
        emptyHint={isManager ? "Задачи создаются в карточке объекта." : "Когда постановщик назначит вам задачу, она появится здесь."} />
    </div>
  );
}
