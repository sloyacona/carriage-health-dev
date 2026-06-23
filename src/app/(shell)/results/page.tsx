import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResultsDisplay } from "./results-display";
import type { OrderStatus } from "@/types";

export const metadata = { title: "Your results — Carriage Health" };

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;

  // In dev, ?demo=normal or ?demo=concerning bypasses the DB guard so the UI
  // can be reviewed without a fully-simulated order in the database.
  const isDevDemo =
    process.env.NODE_ENV !== "production" &&
    (demo === "normal" || demo === "concerning");

  let orderStatus: OrderStatus = demo === "concerning" ? "results_concerning" : "results_ready";

  if (!isDevDemo) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: orders } = await supabase
      .from("orders")
      .select("id, status")
      .in("status", ["results_ready", "results_concerning"]);

    if (!orders || orders.length === 0) redirect("/dashboard");

    orderStatus = (orders[0].status as OrderStatus);
  }

  const isConcerning = orderStatus === "results_concerning";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium tracking-widest uppercase text-muted mb-2">
          Your results
        </p>
        <h1 className="font-serif text-3xl text-charcoal leading-snug">
          We have your results.
        </h1>
        {isConcerning && (
          <p className="mt-2 text-muted leading-relaxed">
            A few values are worth a closer look. Your physician&apos;s note is below.
          </p>
        )}
      </div>

      <ResultsDisplay orderStatus={orderStatus} demoParam={isDevDemo ? demo : undefined} />
    </div>
  );
}
