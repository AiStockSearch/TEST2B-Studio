"use client";
import { useActionState, useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { registerAttachments, saveTask, type ActionState } from "@/app/actions";
import { PhotoPicker } from "@/components/photo-picker";
import { uploadPhotos } from "@/lib/attachments/upload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { FormError } from "@/components/form-error";

interface Opt { id: string; name: string }
export function TaskFormDialog({ task, objects, workers, defaultObjectId, lockAssignee }: {
  task?: { id: string; title: string; description: string; object_id: string; assignee_id: string };
  objects: Opt[];
  workers: Opt[];
  defaultObjectId?: string;
  lockAssignee?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  // Создание: сначала задача (нужен id), затем фото в Storage и запись о них, затем переход в карточку
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    const r = await saveTask(prev, fd);
    if (!r?.ok || task || !r.id) return r;
    if (files.length) {
      try {
        const paths = await uploadPhotos(r.id, "brief", files);
        const reg = await registerAttachments(r.id, "brief", paths);
        if (reg?.error) toast.error(`Задача создана, но фото не прикреплены: ${reg.error}`);
      } catch (e) {
        toast.error(`Задача создана, но фото не прикреплены: ${(e as Error).message}`);
      }
    }
    router.push(`/tasks/${r.id}`);
    return r;
  }, undefined);
  useEffect(() => {
    if (state?.ok) { setOpen(false); setFiles([]); toast.success("Задача сохранена"); }
  }, [state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={task ? "outline" : "default"} size="sm" />}>
        {task ? <><Pencil /> Изменить</> : <><Plus /> Новая задача</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{task ? "Редактирование задачи" : "Новая задача"}</DialogTitle></DialogHeader>
        <form action={action} className="grid gap-4">
          {task && <input type="hidden" name="id" value={task.id} />}
          <div className="grid gap-2">
            <Label htmlFor="title">Название</Label>
            <Input id="title" name="title" defaultValue={task?.title} required maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea id="description" name="description" defaultValue={task?.description} maxLength={5000} rows={4} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="object_id">Объект</Label>
              <NativeSelect id="object_id" name="object_id" defaultValue={task?.object_id ?? defaultObjectId} required>
                {objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assignee_id">Исполнитель</Label>
              {lockAssignee && task && <input type="hidden" name="assignee_id" value={task.assignee_id} />}
              <NativeSelect id="assignee_id" name={lockAssignee ? undefined : "assignee_id"} defaultValue={task?.assignee_id ?? ""} required disabled={lockAssignee}>
                <option value="" disabled>Выберите…</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </NativeSelect>
              {lockAssignee && <p className="text-xs text-muted-foreground">Пока задача на проверке, исполнителя менять нельзя</p>}
            </div>
          </div>
          {!task && (
            <div className="grid gap-2">
              <Label htmlFor="brief-photos">Фото к заданию <span className="text-muted-foreground">(необязательно)</span></Label>
              <PhotoPicker id="brief-photos" files={files} onChange={setFiles} onError={setFileError} disabled={pending} />
            </div>
          )}
          {!task && <p className="text-xs text-muted-foreground">Задача создаётся в статусе «Новая».</p>}
          <FormError message={fileError ?? state?.error} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} {pending && files.length && !task ? "Сохраняем и загружаем фото…" : "Сохранить"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
