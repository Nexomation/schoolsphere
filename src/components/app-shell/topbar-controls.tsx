"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LogOut, Menu, UserRound, Building2 } from "lucide-react";
import { toast } from "sonner";
import { signOutAction, switchMembershipAction } from "@/app/actions/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import type { NavGroup } from "@/lib/navigation";
import { SidebarNav } from "./sidebar-nav";

export type ShellMembership = { id: string; schoolName: string; role: Role };

export function MobileNav({ groups, appName }: { groups: NavGroup[]; appName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{appName}</SheetTitle>
        </SheetHeader>
        <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function MembershipSwitcher({ memberships, activeId }: { memberships: ShellMembership[]; activeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = memberships.find((m) => m.id === activeId);
  if (!active) return null;
  const single = memberships.length === 1;

  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium">{active.schoolName}</span>
        <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[active.role]}</span>
      </span>
    </span>
  );
  if (single) return <div className="hidden max-w-xs min-w-0 md:block">{label}</div>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto max-w-[16rem] min-w-0 justify-between gap-2 py-1.5" disabled={pending} aria-label="Switch school or role">
          {label}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Switch school or role</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() =>
              start(async () => {
                const res = await switchMembershipAction(m.id);
                if (!res.ok) toast.error(res.error);
                else router.push("/app");
                router.refresh();
              })
            }
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{m.schoolName}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</p>
            </div>
            {m.id === activeId && <Check className="size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ name, email, isPlatformAdmin }: { name: string; email: string; isPlatformAdmin: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials || "U"}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/profile">
            <UserRound aria-hidden /> Profile & security
          </Link>
        </DropdownMenuItem>
        {isPlatformAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/platform">
              <Building2 aria-hidden /> Platform console
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
