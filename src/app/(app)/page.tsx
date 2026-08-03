import { redirect } from "next/navigation";
import { listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const projects = listProjects();
  if (projects[0]) {
    redirect(`/projects/${projects[0].id}`);
  }
  redirect("/inbox");
}
