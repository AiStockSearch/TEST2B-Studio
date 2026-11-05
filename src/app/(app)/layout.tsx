import Link from "next/link";
import { HardHat, LogOut } from "lucide-react";
import { requireSession } from "@/lib/session";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/workflow";
import { NavLinks } from "./nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><HardHat className="size-4" /></span>
            <span className="hidden sm:inline">Объекты и задачи</span>
          </Link>
          <NavLinks role={user.role} />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium" data-testid="user-name">{user.full_name}</div>
              <div className="text-xs text-muted-foreground" data-testid="user-role">{ROLE_LABEL[user.role]}</div>
            </div>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit" aria-label="Выйти"><LogOut /> <span className="hidden sm:inline">Выйти</span></Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
