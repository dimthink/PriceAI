export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-[#f7f9f9] px-4 py-6 sm:px-8" aria-busy="true" aria-label="正在加载后台工作区">
      <div className="mx-auto max-w-[1600px] animate-pulse">
        <div className="h-20 rounded-xl bg-white ring-1 ring-[#adb3b4]/15" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[264px_minmax(0,1fr)]">
          <div className="h-[70vh] rounded-xl bg-white ring-1 ring-[#adb3b4]/15" />
          <div className="space-y-4">
            <div className="h-36 rounded-xl bg-white ring-1 ring-[#adb3b4]/15" />
            <div className="h-[56vh] rounded-xl bg-white ring-1 ring-[#adb3b4]/15" />
          </div>
        </div>
      </div>
    </main>
  );
}
