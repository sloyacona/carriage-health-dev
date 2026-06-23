import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "./sidebar";

// Shell layout: auth guard + user data → feeds the AppShell Client Component.
// Children (dashboard, results, account) remain Server Components — they are
// passed as props, not imported into the client bundle.
export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const userEmail = user.email ?? "";
  const userInitial = userEmail.charAt(0).toUpperCase();

  return (
    <AppShell userEmail={userEmail} userInitial={userInitial}>
      {children}
    </AppShell>
  );
}
