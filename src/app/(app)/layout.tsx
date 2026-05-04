import Sidebar from "@/components/navigation/Sidebar";
import MobileTabs from "@/components/navigation/MobileTabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen">
      <div className="pointer-events-none fixed left-64 top-8 h-72 w-72 rounded-full bg-[var(--accent-blue)]/10 blur-3xl" />
      <div className="pointer-events-none fixed bottom-10 right-10 h-80 w-80 rounded-full bg-[var(--accent-green)]/8 blur-3xl" />
      <Sidebar />

      <main className="main-content relative ml-0 min-h-screen flex-1 px-4 py-6 md:ml-72 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <MobileTabs />
    </div>
  );
}
