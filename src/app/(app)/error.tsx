"use client";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-background p-6 text-center">
      <p className="font-medium">Не удалось загрузить данные</p>
      <p className="mt-1 text-sm text-muted-foreground">Проверьте соединение и попробуйте ещё раз.</p>
      <Button className="mt-4" onClick={reset}>Повторить</Button>
    </div>
  );
}
