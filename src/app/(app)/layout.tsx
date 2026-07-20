import Sidebar from "@/components/navigation/Sidebar";
import MobileTabs from "@/components/navigation/MobileTabs";
import { ToastProvider } from "@/components/ui/Toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Sidebar />
      <main className="min-h-screen pb-20 md:pb-8 md:pl-[218px]">
        <div className="mx-auto max-w-[1180px] px-4 pt-5 md:px-7 md:pt-7">{children}</div>
      </main>
      <MobileTabs />
    </ToastProvider>
  );
}
