import { SubNav } from "@/components/sub-nav";
import { requirePageContext } from "@/lib/auth/context";

export default async function SettingsLayout({ children }: LayoutProps<"/app/settings">) {
  await requirePageContext("settings.manage");
  return (
    <>
      <SubNav
        items={[
          { href: "/app/settings", label: "School profile", exact: true },
          { href: "/app/settings/policies", label: "Policies" },
          { href: "/app/settings/grading", label: "Grading" },
          { href: "/app/settings/users", label: "Users & access" },
          { href: "/app/settings/integrations", label: "Integrations" },
          { href: "/app/settings/audit", label: "Audit log" },
        ]}
      />
      {children}
    </>
  );
}
