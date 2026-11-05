import { requireSession } from "@/lib/session";
import { ObjectFormDialog } from "@/components/object-form-dialog";
import { ObjectsList } from "./objects-list";

export default async function ObjectsPage() {
  const { user, repo } = await requireSession();
  const objects = await repo.listObjects();
  const isManager = user.role === "manager";
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Объекты</h1>
          <p className="text-sm text-muted-foreground">
            {isManager ? "Все стройки компании" : "Стройки, где у вас есть задачи"}
          </p>
        </div>
        {isManager && <ObjectFormDialog />}
      </div>
      <ObjectsList objects={objects} isManager={isManager} />
    </div>
  );
}
