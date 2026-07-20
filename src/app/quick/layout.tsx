/**
 * Минимальный layout окна виджета (WKWebView 460×660):
 * без сайдбара, мобильных табов и тостов — только тёмный фон в токенах.
 */
export default function QuickLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-bg text-ink">{children}</div>;
}
