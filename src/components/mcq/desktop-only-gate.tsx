import { MonitorX } from "lucide-react";

/**
 * মোবাইল/ট্যাবলেটে পুরো সাইট ব্লক — শুধু ডেস্কটপ/ল্যাপটপে ব্যবহারযোগ্য।
 * CSS-only (JS নেই): overlay `lg:hidden`, স্ক্রল-লক `globals.css`-এ।
 * breakpoint বদলাতে চাইলে দুটোই একসাথে বদলাও (`lg` ↔ `md`)।
 */
export function DesktopOnlyGate() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="desktop-only-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-b from-brand-50 via-background to-background p-6 lg:hidden"
    >
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
          <MonitorX className="h-7 w-7" />
        </div>
        <h2 id="desktop-only-title" className="mt-4 text-lg font-bold tracking-tight">
          ডেস্কটপে ব্যবহার করুন
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          এই টুলটি শুধু ডেস্কটপ বা ল্যাপটপের জন্য। ফাইল আপলোড ও ডাউনলোড ঠিকভাবে কাজ করার জন্য
          অনুগ্রহ করে কম্পিউটার থেকে খুলুন।
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Desktop / laptop only — please open this site on a computer.
        </p>
      </div>
    </div>
  );
}
