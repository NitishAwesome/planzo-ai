import { Link } from "@tanstack/react-router";
import { Activity, CalendarRange, LayoutGrid, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { resetDemo } from "@/services/demo-store";
import { toast } from "sonner";

const NAV = [
  { to: "/", label: "Operations", icon: LayoutGrid, exact: true },
  { to: "/events", label: "Events", icon: CalendarRange, exact: false },
  { to: "/activity", label: "Activity", icon: Activity, exact: false },
] as const;

export function PlanzoMark({ className = "size-9" }: { className?: string }) {
  return (
    <img
      src="/brand/planzo-icon.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      width={40}
      height={40}
      className={`${className} shrink-0 rounded-xl object-contain`}
    />
  );
}

function ResetDemo({ compact }: { compact?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          aria-label="Reset demo data"
          className={
            compact
              ? "inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-accent"
              : "flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold text-rail-muted hover:bg-rail-active hover:text-rail-foreground"
          }
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
          <AlertDialogDescription>
            This restores the original events, venue bookings and the simulated rain risk, and
            clears decisions you made. Stored only in this browser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              resetDemo();
              toast.success("Demo restored to its initial state");
            }}
          >
            Reset demo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:pl-[84px]">
      {/* Desktop / tablet rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[84px] flex-col items-center bg-rail py-5 md:flex">
        <Link to="/" aria-label="Planzo home" className="rounded-xl">
          <PlanzoMark className="size-10" />
        </Link>
        <nav aria-label="Primary" className="mt-8 flex w-full flex-1 flex-col gap-1 px-2">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-foreground data-[status=active]:bg-rail-active data-[status=active]:text-rail-foreground"
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="w-full px-2">
          <ResetDemo />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:hidden">
        <Link to="/" className="flex items-center gap-2 rounded-lg" aria-label="Planzo home">
          <PlanzoMark className="size-8" />
          <span className="text-base font-extrabold tracking-tight">planzo</span>
        </Link>
        <ResetDemo compact />
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 md:px-10 md:pb-16 md:pt-10">
        {children}
        <p className="mt-14 text-center text-xs text-muted-foreground">
          Alexa+ concept simulation · Independent prototype, not affiliated with Amazon · Weather
          risks are simulated scenarios
        </p>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-rail pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact }}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-rail-muted data-[status=active]:text-rail-foreground"
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
