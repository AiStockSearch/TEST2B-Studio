"use client";
import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changeStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import type { TaskStatus } from "@/lib/workflow";

interface Action { to: TaskStatus; label: string; commentRequired: boolean }

export function StatusActions({ taskId, actions, emptyText }: { taskId: string; actions: Action[]; emptyText: string }) {
  const [state, action, pending] = useActionState(changeStatus, undefined);
  const [comment, setComment] = useState("");
  const [needComment, setNeedComment] = useState<string | null>(null);
  useEffect(() => {
    if (state?.ok) { toast.success("Статус изменён"); setComment(""); setNeedComment(null); }
  }, [state]);
  if (!actions.length) return <p className="text-sm text-muted-foreground" data-testid="no-actions">{emptyText}</p>;
  const hasCommentAction = actions.some((a) => a.commentRequired);
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="comment">Комментарий {hasCommentAction ? <span className="text-muted-foreground">(обязателен для возврата на доработку)</span> : <span className="text-muted-foreground">(необязательно)</span>}</Label>
        <Textarea id="comment" value={comment} maxLength={2000} rows={3}
          onChange={(e) => { setComment(e.target.value); setNeedComment(null); }} aria-invalid={!!needComment} />
      </div>
      <FormError message={needComment ?? state?.error} />
      <div className="flex flex-wrap gap-2" data-testid="actions">
        {/* отдельная форма на каждое действие: целевой статус — скрытое поле формы */}
        {actions.map((a) => (
          <form key={a.to} action={action}
            onSubmit={(e) => {
              if (a.commentRequired && !comment.trim()) { e.preventDefault(); setNeedComment("Укажите, что нужно доработать"); }
            }}>
            <input type="hidden" name="id" value={taskId} />
            <input type="hidden" name="to" value={a.to} />
            <input type="hidden" name="comment" value={comment} />
            <Button type="submit" disabled={pending} variant={a.commentRequired ? "outline" : "default"}>
              {pending && <Loader2 className="animate-spin" />} {a.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
