import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScheduleForm } from "./schedule-form";

export const metadata = { title: "Schedule your visit — Carriage Health" };

export default async function SchedulePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only a patient with a requisition-ready order should reach this page.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status")
    .eq("status", "requisition_ready")
    .limit(1);

  if (!orders || orders.length === 0) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium tracking-widest uppercase text-muted mb-2">
          Step 3 of 3
        </p>
        <h1 className="font-serif text-3xl text-charcoal leading-snug">
          Choose a time that&apos;s easy for you.
        </h1>
        <p className="mt-2 text-muted leading-relaxed">
          A quick blood draw — usually under ten minutes. Pick whichever feels
          least rushed.
        </p>
      </div>

      <ScheduleForm />
    </div>
  );
}
