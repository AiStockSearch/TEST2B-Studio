"use client";
import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/form-error";

export function ConfirmDelete({ action: serverAction, fields, title, description }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(serverAction, undefined);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}><Trash2 /> Удалить</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <FormError message={state?.error} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Отмена</DialogClose>
            <Button variant="destructive" type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Удалить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
