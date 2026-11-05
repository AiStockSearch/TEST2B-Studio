"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { registerAttachments, setTaskStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import { PhotoPicker } from "@/components/photo-picker";
import { uploadPhotos } from "@/lib/attachments/upload";
import { STATUS_LABEL, type TaskStatus } from "@/lib/workflow";

interface Action { to: TaskStatus; label: string; commentRequired: boolean }

const CONFIRM: Partial<Record<TaskStatus, string>> = {
  in_progress: "Задача перейдёт в статус «В работе». Постановщик увидит, что вы начали.",
  review: "Работа уйдёт постановщику на проверку. Можно приложить фото результата и комментарий (необязательно).",
  accepted: "Задача будет принята и закрыта. После этого её нельзя изменить.",
  rework: "Задача вернётся исполнителю. Напишите, что нужно доработать — комментарий обязателен.",
};

export function StatusActions({ taskId, status, actions, emptyText, resultCount }: {
  taskId: string; status: TaskStatus; actions: Action[]; emptyText: string; resultCount: number;
}) {
  const router = useRouter();
  const [active, setActive] = useState<Action | null>(null);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!actions.length)
    return <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="no-actions"><Info className="mt-0.5 size-4 shrink-0" />{emptyText}</p>;

  const openDialog = (a: Action) => { setActive(a); setComment(""); setFiles([]); setError(null); };
  const submit = () => start(async () => {
    if (!active) return;
    if (active.commentRequired && !comment.trim()) { setError("Укажите, что нужно доработать"); return; }
    setError(null);
    try {
      if (active.to === "review" && files.length) {
        setStep(`Загружаем фото (${files.length})…`);
        const paths = await uploadPhotos(taskId, "result", files);
        const r = await registerAttachments(taskId, "result", paths);
        if (r?.error) { setError(r.error); return; }
      }
      setStep("Меняем статус…");
      const r = await setTaskStatus(taskId, active.to, comment || null);
      if (r?.error) { setError(r.error); return; }
      toast.success(`Статус: ${STATUS_LABEL[active.to]}`);
      setActive(null);
      router.refresh(); // история и кнопки обновятся без перезагрузки страницы
    } catch (e) {
      setError((e as Error).message);
    } finally { setStep(null); }
  });

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">Сейчас: «{STATUS_LABEL[status]}». Доступно:</p>
      <div className="flex flex-wrap gap-2" data-testid="actions">
        {actions.map((a) => (
          <Button key={a.to} variant={a.commentRequired ? "outline" : "default"} onClick={() => openDialog(a)}>{a.label}</Button>
        ))}
      </div>
      <Dialog open={!!active} onOpenChange={(o) => { if (!o && !pending) setActive(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active?.label}?</DialogTitle>
            <DialogDescription>{active && CONFIRM[active.to]}</DialogDescription>
          </DialogHeader>
          {active?.to === "review" && (
            <div className="grid gap-2">
              <Label htmlFor="result-photos">Фото результата <span className="text-muted-foreground">(необязательно)</span></Label>
              <PhotoPicker id="result-photos" files={files} onChange={setFiles} existing={resultCount} onError={setError} disabled={pending} />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="comment">Комментарий {active?.commentRequired
              ? <span className="text-destructive">(обязательно)</span> : <span className="text-muted-foreground">(необязательно)</span>}</Label>
            <Textarea id="comment" value={comment} maxLength={2000} rows={3} disabled={pending}
              placeholder={active?.commentRequired ? "Что нужно исправить" : ""}
              onChange={(e) => { setComment(e.target.value); setError(null); }} aria-invalid={!!error && !!active?.commentRequired} />
          </div>
          <FormError message={error ?? undefined} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>Отмена</DialogClose>
            <Button onClick={submit} disabled={pending} data-testid="confirm-action">
              {pending && <Loader2 className="animate-spin" />} {pending && step ? step : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
