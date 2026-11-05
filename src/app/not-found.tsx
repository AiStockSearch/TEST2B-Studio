import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto mt-24 max-w-md rounded-xl border bg-background p-6 text-center">
      <p className="font-medium">Не найдено</p>
      <p className="mt-1 text-sm text-muted-foreground">Страница не существует или у вас нет к ней доступа.</p>
      <Link href="/" className="mt-4 inline-block text-sm underline">На главную</Link>
    </main>
  );
}
