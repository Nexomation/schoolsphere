import { SubNav } from "@/components/sub-nav";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";

export default async function FeesLayout({ children }: LayoutProps<"/app/fees">) {
  const ctx = await requirePageContext("fees.view");
  return (
    <>
      {can(ctx.role, "fees.manage") && (
        <SubNav
          items={[
            { href: "/app/fees", label: "Overview", exact: true },
            { href: "/app/fees/dues", label: "Dues & collection" },
            { href: "/app/fees/payments", label: "Payments" },
            { href: "/app/fees/reports", label: "Reports & reconciliation" },
            { href: "/app/fees/setup", label: "Fee setup" },
          ]}
        />
      )}
      {children}
    </>
  );
}
