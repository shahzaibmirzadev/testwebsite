function SkeletonBlock({ className }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#EDE9FF] ${className || ""}`} />;
}

function SkeletonPill({ className }) {
  return <SkeletonBlock className={`h-8 ${className || "w-24"}`} />;
}

export default function JobDetailLoading() {
  return (
    <main className="bg-[#FFFFFF] text-[#1C1C1A]">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        <header className="border-b border-[rgba(0,0,0,0.08)] pb-6 sm:pb-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <SkeletonBlock className="h-10 w-28" />
            <SkeletonBlock className="hidden h-10 w-28 sm:block" />
          </div>

          <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <div className="flex items-center gap-3 sm:block">
              <SkeletonBlock className="h-14 w-14 rounded-[12px] sm:h-16 sm:w-16" />
            </div>

            <div className="min-w-0">
              <SkeletonBlock className="h-4 w-36" />
              <SkeletonBlock className="mt-4 h-9 w-full max-w-3xl sm:h-12" />
              <SkeletonBlock className="mt-3 h-9 w-3/4 max-w-2xl sm:h-12" />
              <div className="mt-4 flex flex-wrap gap-3">
                <SkeletonBlock className="h-5 w-32" />
                <SkeletonBlock className="h-5 w-52" />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <SkeletonPill />
                <SkeletonPill className="w-28" />
                <SkeletonPill className="w-24" />
                <SkeletonPill className="w-32" />
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1120px] gap-8 py-6 lg:grid-cols-[minmax(0,720px)_320px] lg:items-start lg:justify-between lg:gap-10 lg:py-8 xl:gap-12">
          <article className="min-w-0">
            <SkeletonBlock className="mb-6 h-12 w-full sm:hidden" />

            <section className="max-w-[820px]">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="mt-3 h-8 w-56" />
              <div className="mt-6 grid gap-4">
                {Array.from({ length: 7 }).map((_, index) => (
                  <SkeletonBlock
                    key={index}
                    className={`h-4 ${index % 3 === 0 ? "w-full" : index % 3 === 1 ? "w-11/12" : "w-4/5"}`}
                  />
                ))}
              </div>
              <SkeletonBlock className="mt-8 h-7 w-44" />
              <div className="mt-4 grid gap-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <SkeletonBlock
                    key={index}
                    className={`h-4 ${index % 2 === 0 ? "w-full" : "w-5/6"}`}
                  />
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-[8px] border border-[rgba(91,79,232,0.18)] bg-[#F8FAFC] p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <SkeletonBlock className="h-4 w-44" />
                  <SkeletonBlock className="mt-3 h-7 w-64 max-w-full" />
                </div>
                <SkeletonBlock className="h-12 w-full sm:w-36" />
              </div>
            </section>

            <section className="mt-8 border-t border-[rgba(0,0,0,0.08)] pt-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <SkeletonBlock className="h-4 w-24" />
                  <SkeletonBlock className="mt-2 h-7 w-36" />
                </div>
                <SkeletonBlock className="h-4 w-48" />
              </div>
              <SkeletonBlock className="h-[280px] w-full sm:h-[330px]" />
            </section>

            <section className="mt-8 border-t border-[rgba(0,0,0,0.08)] pt-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <SkeletonBlock className="h-4 w-32" />
                  <SkeletonBlock className="mt-2 h-8 w-52" />
                </div>
                <SkeletonBlock className="h-4 w-24" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] p-4">
                    <SkeletonBlock className="h-3 w-28" />
                    <SkeletonBlock className="mt-3 h-5 w-full" />
                    <SkeletonBlock className="mt-2 h-5 w-4/5" />
                    <SkeletonBlock className="mt-4 h-4 w-36" />
                  </div>
                ))}
              </div>
            </section>
          </article>

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="grid gap-4">
              <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#F8FAFC] p-4">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-3 h-7 w-40" />
                <SkeletonBlock className="mt-3 h-4 w-full" />
                <SkeletonBlock className="mt-2 h-4 w-4/5" />
                <SkeletonBlock className="mt-4 h-11 w-full" />
              </div>

              <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] p-4">
                <SkeletonBlock className="h-4 w-52" />
                <SkeletonBlock className="mt-3 h-7 w-36" />
                <SkeletonBlock className="mt-3 h-4 w-full" />
                <SkeletonBlock className="mt-2 h-4 w-5/6" />
                <div className="mt-4 grid gap-2">
                  <SkeletonBlock className="h-11 w-full" />
                  <SkeletonBlock className="h-11 w-full" />
                  <SkeletonBlock className="h-11 w-full" />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
