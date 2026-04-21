function SkeletonBlock({ className }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#EDE9FF] ${className || ""}`} />;
}

function SkeletonCompanyCard() {
  return (
    <div className="rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-3 py-2.5 sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-[10px] sm:h-12 sm:w-12 sm:rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="mt-2 h-3 w-1/2" />
        </div>
        <div className="shrink-0 sm:hidden">
          <SkeletonBlock className="h-4 w-12" />
        </div>
      </div>
      <div className="mt-5 hidden items-end justify-between sm:flex">
        <div>
          <SkeletonBlock className="h-7 w-14" />
          <SkeletonBlock className="mt-2 h-3 w-20" />
        </div>
        <SkeletonBlock className="h-4 w-12" />
      </div>
    </div>
  );
}

export default function CompaniesLoading() {
  return (
    <main className="bg-[#FFFFFF] text-[#1C1C1A]">
      <div className="mx-auto w-full max-w-[1180px] overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        <section className="py-4 sm:py-6 lg:py-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div className="max-w-3xl">
              <SkeletonBlock className="hidden h-10 w-36 sm:block" />
              <SkeletonBlock className="mt-6 h-4 w-40" />
              <SkeletonBlock className="mt-4 h-9 w-full max-w-[560px] sm:h-12" />
              <SkeletonBlock className="mt-3 h-4 w-full max-w-[640px]" />
              <SkeletonBlock className="mt-2 h-4 w-2/3 max-w-[420px]" />
            </div>

            <div className="hidden grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(0,0,0,0.08)] pt-5 sm:grid lg:border-t-0 lg:pl-8 lg:pt-0">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <SkeletonBlock className="h-8 w-16" />
                  <SkeletonBlock className="mt-2 h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <nav className="mt-5 flex gap-2 overflow-x-auto px-0.5 py-1" aria-label="Company directory shortcuts loading">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-10 w-24 shrink-0 rounded-[20px]" />
          ))}
        </nav>

        <section className="mt-6 border-y border-[rgba(0,0,0,0.08)] py-5">
          <div className="flex items-center justify-between gap-3 sm:hidden">
            <div>
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="mt-2 h-3 w-36" />
            </div>
            <SkeletonBlock className="h-9 w-24" />
          </div>

          <div className="mt-4 grid gap-4 sm:mt-0 sm:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
            <div>
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="mt-2 h-12 w-full" />
            </div>
            <div>
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="mt-2 h-12 w-full" />
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 sm:mb-4">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-2 h-7 w-48" />
          </div>

          <div className="grid min-w-0 gap-4 max-[640px]:px-1 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <SkeletonCompanyCard key={index} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
