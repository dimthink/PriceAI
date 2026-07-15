import { SiteHeader } from "@/components/SiteHeader";

export default function AccountLoading() {
  return (
    <main className="min-h-screen bg-[#f7f9f9]" aria-busy="true" aria-label="正在加载账户内容">
      <SiteHeader />
      <section className="mx-auto max-w-6xl animate-pulse px-4 pb-16 pt-8 sm:px-8">
        <div className="h-44 rounded-lg bg-white ring-1 ring-[#adb3b4]/12" />
        <div className="mt-5 h-64 rounded-lg bg-white ring-1 ring-[#adb3b4]/12" />
        <div className="mt-4 h-52 rounded-lg bg-white ring-1 ring-[#adb3b4]/12" />
      </section>
    </main>
  );
}
