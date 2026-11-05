"use client";
import Link from "next/link";
import { Building2, ChevronRight, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/empty";
import { useUi } from "@/stores/ui";
import type { ObjectRow } from "@/lib/data/types";

export function ObjectsList({ objects, isManager }: { objects: ObjectRow[]; isManager: boolean }) {
  const { objectQuery, setObjectQuery } = useUi();
  const q = objectQuery.trim().toLowerCase();
  const list = q ? objects.filter((o) => `${o.name} ${o.address}`.toLowerCase().includes(q)) : objects;
  if (!objects.length)
    return <Empty icon={Building2} title="Объектов пока нет" hint={isManager ? "Создайте первый объект кнопкой «Новый объект»." : "Когда вам назначат задачу, здесь появится её объект."} />;
  return (
    <div className="grid gap-3">
      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={objectQuery} onChange={(e) => setObjectQuery(e.target.value)} placeholder="Поиск по названию или адресу" className="pl-8" />
      </div>
      {!list.length && <p className="text-sm text-muted-foreground">Ничего не найдено</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="objects-list">
        {list.map((o) => (
          <li key={o.id}>
            <Link href={`/objects/${o.id}`} className="group flex h-full flex-col gap-3 rounded-xl border bg-background p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{o.name}</span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <span className="flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" />{o.address}</span>
              <span className="mt-auto text-xs text-muted-foreground">
                {isManager ? "Задач" : "Ваших задач"}: {o.task_count} · не закрыто: {o.open_count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
