function SkeletonBlock({ className }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#FFF7ED] ${className}`} />;
}

function SkeletonLocationCard() {
  return (
    <div className="rounded-[12px] border border-[rgba(180,83,9,0.14)] bg-[#FFFBF5] px-3 py-2.5 shadow-[0_10px_24px_rgba(120,53,15,0.04)] sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" />
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="mt-2 h-3 w-1/2" />
        </div>
        <SkeletonBlock className="h-4 w-12 shrink-0 sm:hidden" />
      </div>
      <div className="mt-5 hidden items-end justify-between sm:flex">
        <div>
          <SkeletonBlock className="h-7 w-14" />
          <SkeletonBlock className="mt-2 h-3 w-20" />
        </div>
        <SkeletonBlock className="h-4 w-14" />
      </div>
    </div>
  );
}

export default function LocationsLoading() {
  return (
    <main className="bg-[#FFFCF7] text-[#1C1C1A]" data-location-theme>
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        <section className="py-4 sm:py-6 lg:py-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div className="max-w-3xl">
              <SkeletonBlock className="hidden h-10 w-32 sm:block" />
              <SkeletonBlock className="mt-6 h-4 w-40" />
              <SkeletonBlock className="mt-4 h-10 w-full max-w-[620px] sm:h-14" />
              <SkeletonBlock className="mt-3 h-4 w-full max-w-[560px]" />
              <SkeletonBlock className="mt-2 h-4 w-4/5 max-w-[480px]" />
            </div>

            <div className="hidden grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(180,83,9,0.14)] pt-5 sm:grid lg:border-t-0 lg:pl-8 lg:pt-0">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <SkeletonBlock className="h-9 w-20" />
                  <SkeletonBlock className="mt-2 h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <nav className="mt-5 flex gap-2 overflow-hidden px-0.5 py-1" aria-label="Loading location shortcuts">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-10 w-24 shrink-0 rounded-[20px]" />
          ))}
        </nav>

        <section className="mt-6 grid gap-4 border-y border-[rgba(180,83,9,0.14)] py-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3">
              <SkeletonBlock className="mt-0.5 h-9 w-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="mt-2 h-3 w-full" />
                <SkeletonBlock className="mt-2 h-3 w-4/5" />
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 border-b border-[rgba(180,83,9,0.14)] pb-4">
          <div className="hidden gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_220px] lg:grid-cols-[minmax(0,1fr)_240px]">
            <div>
              <SkeletonBlock className="mb-2 h-4 w-32" />
              <SkeletonBlock className="h-12 w-full" />
            </div>
            <div>
              <SkeletonBlock className="mb-2 h-4 w-28" />
              <SkeletonBlock className="h-12 w-full" />
            </div>
          </div>
          <div className="flex items-center justify-between sm:hidden">
            <div>
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="mt-2 h-3 w-36" />
            </div>
            <SkeletonBlock className="h-10 w-24" />
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex items-end justify-between gap-2">
            <div>
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="mt-2 h-7 w-44" />
            </div>
            <SkeletonBlock className="hidden h-4 w-40 sm:block" />
          </div>
          <div className="grid min-w-0 gap-4 max-[640px]:px-1 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <SkeletonLocationCard key={index} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
