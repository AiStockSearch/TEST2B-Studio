import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

export default async function Home() {
  const { user } = await requireSession();
  redirect(user.role === "worker" ? "/my-tasks" : "/objects");
}
