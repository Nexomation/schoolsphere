import { SubNav } from "@/components/sub-nav";
import { requirePageContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";

export default async function ActivitiesLayout({ children }: LayoutProps<"/app/activities">) {
  const ctx = await requirePageContext("activities.view");
  return (
    <>
      <SubNav
        items={[
          { href: "/app/activities", label: "Activities", exact: true },
          { href: "/app/activities/achievements", label: can(ctx.role, "achievements.verify") ? "Achievements & verification" : "Achievements" },
        ]}
      />
      {children}
    </>
  );
}
