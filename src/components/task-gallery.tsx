"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { registerAttachments, removeAttachment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError } from "@/components/form-error";
import { PhotoPicker } from "@/components/photo-picker";
import { uploadPhotos } from "@/lib/attachments/upload";
import { formatDate } from "@/lib/format";
import type { AttachmentView } from "@/lib/attachments/server";
import type { AttachmentKind } from "@/lib/data/types";

const TITLE: Record<AttachmentKind, string> = { brief: "Фото к заданию", result: "Фото результата" };

export function TaskGallery({ taskId, kind, items, canAdd, canDelete, addHint }: {
  taskId: string; kind: AttachmentKind; items: AttachmentView[]; canAdd: boolean; canDelete: boolean; addHint?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<AttachmentView | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!items.length && !canAdd) return null;

  const upload = () => start(async () => {
    setError(null);
    try {
      const paths = await uploadPhotos(taskId, kind, files);
      const r = await registerAttachments(taskId, kind, paths);
      if (r?.error) { setError(r.error); return; }
      setFiles([]); toast.success("Фото прикреплены"); router.refresh();
    } catch (e) { setError((e as Error).message); }
  });
  const remove = (a: AttachmentView) => start(async () => {
    const r = await removeAttachment(a.id, taskId);
    if (r?.error) { toast.error(r.error); return; }
    setOpen(null); toast.success("Фото удалено"); router.refresh();
  });

  return (
    <section className="grid gap-3" data-testid={`gallery-${kind}`}>
      <h3 className="text-sm font-medium">{TITLE[kind]} <span className="text-muted-foreground">({items.length})</span></h3>
      {!!items.length && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpen(a)} className="block aspect-square w-full overflow-hidden rounded-md border bg-muted" aria-label="Открыть фото">
                {a.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.url} alt={TITLE[kind]} className="size-full object-cover" loading="lazy" data-testid="photo" />
                  : <ImageOff className="m-auto size-5 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <div className="grid gap-2">
          <PhotoPicker id={`add-${kind}`} files={files} onChange={setFiles} existing={items.length} onError={setError} disabled={pending} />
          {addHint && <p className="text-xs text-muted-foreground">{addHint}</p>}
          <FormError message={error ?? undefined} />
          {!!files.length && (
            <Button type="button" size="sm" className="w-fit" onClick={upload} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Upload />} Прикрепить {files.length} фото
            </Button>
          )}
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>{TITLE[kind]}</DialogTitle></DialogHeader>
          {open?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={open.url} alt={TITLE[kind]} className="max-h-[70vh] w-full rounded-md object-contain" />
          )}
          <p className="text-xs text-muted-foreground">{open?.uploader_name} · {open && formatDate(open.created_at)}</p>
          {canDelete && open && (
            <DialogFooter>
              <Button variant="destructive" size="sm" disabled={pending}
                onClick={() => { if (confirm("Удалить это фото без возможности восстановления?")) remove(open); }}>
                {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Удалить фото
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
