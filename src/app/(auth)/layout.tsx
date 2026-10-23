import Link from "next/link";
import { Logo } from "@/components/logo";
import { brand } from "@/lib/brand";

// Authenticated, per-user pages are always rendered at request time.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-accent/60 to-background">
      <header className="px-4 py-5 sm:px-8">
        <Link href="/" aria-label={`${brand.appName} home`}>
          <Logo name={brand.appName} />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-12">{children}</main>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">{brand.tagline}</footer>
    </div>
  );
}
