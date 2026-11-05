"use client";
import { useActionState, useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveObject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";

export function ObjectFormDialog({ object }: { object?: { id: string; name: string; address: string } }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveObject, undefined);
  useEffect(() => {
    if (state?.ok) { setOpen(false); toast.success("Объект сохранён"); }
  }, [state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={object ? "outline" : "default"} size="sm" />}>
        {object ? <><Pencil /> Изменить</> : <><Plus /> Новый объект</>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{object ? "Редактирование объекта" : "Новый объект"}</DialogTitle></DialogHeader>
        <form action={action} className="grid gap-4">
          {object && <input type="hidden" name="id" value={object.id} />}
          <div className="grid gap-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" name="name" defaultValue={object?.name} required maxLength={200} placeholder="ЖК «Северный»" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Адрес</Label>
            <Input id="address" name="address" defaultValue={object?.address} required maxLength={500} placeholder="Город, улица, дом" />
          </div>
          <FormError message={state?.error} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
