"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, ChevronRight, LayoutGrid, List, Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { useQueryParam } from "@/components/url-filters";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { ObjectRow } from "@/lib/data/types";

// Фильтры (?q=, ?open=1) — в URL; Zustand хранит только вид списка (плитка/строки).
export function ObjectsList({ objects, isManager }: { objects: ObjectRow[]; isManager: boolean }) {
  const { params, set, pending } = useQueryParam();
  const urlQ = params.get("q") ?? "";
  const onlyOpen = params.get("open") === "1";
  const [q, setQ] = useState(urlQ);
  const { objectsLayout, setObjectsLayout } = useUi();
  useEffect(() => { setQ(urlQ); }, [urlQ]);
  useEffect(() => {
    if (q === urlQ) return;
    const t = setTimeout(() => set("q", q.trim() || null), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = urlQ.trim().toLowerCase();
  const list = objects.filter((o) => (!needle || `${o.name} ${o.address}`.toLowerCase().includes(needle)) && (!onlyOpen || o.open_count > 0));
  if (!objects.length)
    return <Empty icon={Building2} title="Объектов пока нет" hint={isManager ? "Создайте первый объект кнопкой «Новый объект»." : "Когда вам назначат задачу, здесь появится её объект."} />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или адресу" className="pl-8" data-testid="objects-search" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => set("open", e.target.checked ? "1" : null)} data-testid="only-open" className="size-4" />
          Только с незакрытыми задачами
        </label>
        <span className="text-sm text-muted-foreground">{list.length} из {objects.length}</span>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex gap-1">
          <Button variant={objectsLayout === "grid" ? "secondary" : "ghost"} size="icon" aria-label="Плиткой" onClick={() => setObjectsLayout("grid")}><LayoutGrid /></Button>
          <Button variant={objectsLayout === "list" ? "secondary" : "ghost"} size="icon" aria-label="Списком" onClick={() => setObjectsLayout("list")}><List /></Button>
        </div>
      </div>
      {!list.length && <p className="text-sm text-muted-foreground">Ничего не найдено</p>}
      <ul className={cn("grid gap-3", objectsLayout === "grid" && "sm:grid-cols-2 lg:grid-cols-3")} data-testid="objects-list">
        {list.map((o) => (
          <li key={o.id} className="flex h-full flex-col rounded-xl border bg-background transition-shadow hover:shadow-md">
            <Link href={`/objects/${o.id}`} className="group flex flex-1 flex-col gap-3 p-4 pb-2" data-testid="object-card">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{o.name}</span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <span className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" />{o.address}</span>
            </Link>
            <div className="flex gap-3 px-4 pb-3 text-xs text-muted-foreground">
              <Link href={`/objects/${o.id}`} className="hover:text-foreground hover:underline">{isManager ? "Задач" : "Ваших задач"}: {o.task_count}</Link>
              <Link href={`/objects/${o.id}?status=active`} className="hover:text-foreground hover:underline" data-testid="open-link">не закрыто: {o.open_count}</Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
