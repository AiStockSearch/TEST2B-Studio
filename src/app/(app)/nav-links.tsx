"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/workflow";

export function NavLinks({ role }: { role: Role }) {
  const path = usePathname();
  const links = [
    { href: "/objects", label: "Объекты" },
    { href: "/my-tasks", label: role === "manager" ? "Все задачи" : "Мои задачи" },
  ];
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => (
        <Link key={l.href} href={l.href}
          className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            path.startsWith(l.href) && "bg-muted font-medium text-foreground")}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
