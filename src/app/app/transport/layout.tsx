import { SubNav } from "@/components/sub-nav";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";

export default async function TransportLayout({ children }: LayoutProps<"/app/transport">) {
  const ctx = await requirePageContext("transport.view");
  return (
    <>
      {can(ctx.role, "transport.manage") && (
        <SubNav
          items={[
            { href: "/app/transport", label: "Live overview", exact: true },
            { href: "/app/transport/routes", label: "Routes & stops" },
            { href: "/app/transport/fleet", label: "Vehicles & drivers" },
            ...(env().TRANSPORT_SIMULATOR_ENABLED ? [{ href: "/app/transport/simulator", label: "Simulator (dev)" }] : []),
            { href: "/app/transport/reports", label: "Reports" },
          ]}
        />
      )}
      {children}
    </>
  );
}
