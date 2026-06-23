import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IntakeForm } from "./intake-form";

export const metadata = { title: "Your information — Carriage Health" };

export default async function IntakePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only a paid, not-yet-ordered patient should reach this page.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status")
    .eq("status", "intake_pending")
    .limit(1);

  if (!orders || orders.length === 0) {
    // No intake_pending order — either not paid yet or order already placed.
    redirect("/dashboard");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium tracking-widest uppercase text-muted mb-2">
          Step 2 of 3
        </p>
        <h1 className="font-serif text-3xl text-charcoal leading-snug">
          A little about you.
        </h1>
        <p className="mt-2 text-muted leading-relaxed">
          We need a few details to place your lab order and a few gentle
          questions to help us read your results in context.
        </p>
      </div>

      <IntakeForm />
    </div>
  );
}
