"use client";
import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPT, MAX_FILES, validateFiles } from "@/lib/attachments/rules";

/** Выбор фото до отправки: превью, проверка типа/размера/количества на клиенте (сервер и БД проверяют ещё раз). */
export function PhotoPicker({ id, files, onChange, existing = 0, onError, disabled }: {
  id: string; files: File[]; onChange: (f: File[]) => void; existing?: number; onError: (msg: string | null) => void; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const left = MAX_FILES - existing - files.length;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2" data-testid={`${id}-previews`}>
        {previews.map((u, i) => (
          <div key={u} className="relative size-20 overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={files[i].name} className="size-full object-cover" />
            <button type="button" aria-label="Убрать фото" disabled={disabled}
              className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5 shadow"
              onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
          </div>
        ))}
        {left > 0 && (
          <Button type="button" variant="outline" className="size-20 flex-col gap-1 text-xs" disabled={disabled}
            onClick={() => input.current?.click()}>
            <ImagePlus className="size-5" /> Фото
          </Button>
        )}
      </div>
      <input ref={input} id={id} data-testid={id} type="file" accept={ACCEPT} multiple hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          const err = validateFiles([...files, ...picked], existing);
          onError(err);
          if (!err) onChange([...files, ...picked]);
        }} />
      <p className="text-xs text-muted-foreground">JPG, PNG или WebP, до 5 МБ, не больше {MAX_FILES} фото{existing ? ` (уже прикреплено: ${existing})` : ""}.</p>
    </div>
  );
}
