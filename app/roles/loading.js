function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#F1F1F3] ${className}`} />;
}

function SkeletonRoleRow() {
  return (
    <div className="grid gap-4 border-b border-[rgba(28,28,26,0.08)] px-0 py-5 sm:grid-cols-[56px_minmax(0,1fr)_170px_112px] sm:items-center sm:px-3">
      <SkeletonBlock className="h-3 w-8 bg-[#E4E4EA]" />
      <div className="min-w-0">
        <SkeletonBlock className="h-6 w-2/3" />
        <SkeletonBlock className="mt-3 h-4 w-3/4 bg-[#F7F7F8]" />
      </div>
      <div>
        <SkeletonBlock className="h-7 w-16" />
        <SkeletonBlock className="mt-3 h-3 w-20" />
      </div>
      <SkeletonBlock className="h-4 w-24 bg-[#E4E4EA] sm:justify-self-end" />
    </div>
  );
}

export default function RolesLoading() {
  return (
    <main className="bg-[#FFFFFF] text-[#1C1C1A]" data-role-theme>
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="py-6 sm:py-8 lg:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
            <div className="max-w-3xl">
              <SkeletonBlock className="h-3 w-32 bg-[#F1F1F3]" />
              <SkeletonBlock className="mt-4 h-12 w-full max-w-[620px]" />
              <SkeletonBlock className="mt-3 h-12 w-3/5 max-w-[420px]" />
              <SkeletonBlock className="mt-5 h-5 w-full max-w-[620px]" />
              <SkeletonBlock className="mt-3 h-5 w-3/4 max-w-[520px]" />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(91,79,232,0.12)] pt-5 lg:border-t-0 lg:pl-8 lg:pt-0">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <SkeletonBlock className="h-8 w-20" />
                  <SkeletonBlock className="mt-2 h-4 w-28" />
                </div>
              ))}
            </div>
          </div>

          <nav className="mt-7 flex gap-2 overflow-hidden pb-1" aria-label="Loading role shortcuts">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-10 w-28 shrink-0 rounded-full bg-[#FFFFFF]" />
            ))}
          </nav>
        </section>

        <section className="border-y border-[rgba(91,79,232,0.12)] py-5">
          <div className="hidden gap-3 sm:flex">
            <SkeletonBlock className="h-11 flex-1 bg-[#FFFFFF]" />
            <SkeletonBlock className="h-11 w-[190px] bg-[#FFFFFF]" />
          </div>
          <div className="flex items-center justify-between gap-3 sm:hidden">
            <div>
              <SkeletonBlock className="h-3 w-24 bg-[#F1F1F3]" />
              <SkeletonBlock className="mt-2 h-4 w-28" />
            </div>
            <SkeletonBlock className="h-11 w-24 bg-[#1A1160]" />
          </div>
        </section>

        <section className="py-7">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <SkeletonBlock className="h-3 w-20 bg-[#F1F1F3]" />
              <SkeletonBlock className="mt-3 h-8 w-44" />
            </div>
            <SkeletonBlock className="h-4 w-72" />
          </div>
          <div className="border-t border-[rgba(28,28,26,0.1)]">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonRoleRow key={index} />
            ))}
          </div>
        </section>

        <section className="border-t border-[rgba(91,79,232,0.12)] py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SkeletonBlock className="h-4 w-32 bg-[#F1F1F3]" />
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-4 w-36 bg-[#F1F1F3]" />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
