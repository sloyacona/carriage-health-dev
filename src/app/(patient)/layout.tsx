import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Wizard/flow layout: covers checkout, intake, panel, schedule.
// No persistent navigation — these are linear step pages.
// Auth guard is belt-and-suspenders alongside middleware.
export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-linen">
      <main className="mx-auto max-w-2xl px-6 py-12">{children}</main>
    </div>
  );
}
