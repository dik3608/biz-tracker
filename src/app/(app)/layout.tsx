import Sidebar from "@/components/navigation/Sidebar";
import MobileTabs from "@/components/navigation/MobileTabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="main-content ml-0 min-h-screen flex-1 px-4 py-6 md:ml-60 md:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      <MobileTabs />
    </div>
  );
}
