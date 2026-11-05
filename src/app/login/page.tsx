import { HardHat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HardHat className="size-5" />
          </div>
          <CardTitle className="text-xl">Объекты и задачи</CardTitle>
          <CardDescription>Войдите по email и паролю. Учётные записи выдаёт администратор.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm initialError={error === "profile" ? "Для этой учётной записи не настроен профиль. Обратитесь к администратору." : undefined} />
        </CardContent>
      </Card>
    </main>
  );
}
