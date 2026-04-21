function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#F3EEE9] ${className}`} />;
}

function SkeletonLinkList() {
  return (
    <section>
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="mt-3 h-7 w-40" />
      <SkeletonBlock className="mt-3 h-4 w-full max-w-[260px]" />
      <div className="mt-4 border-t border-[rgba(180,83,9,0.16)]">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid gap-2 border-b border-[rgba(180,83,9,0.14)] py-4 sm:grid-cols-[minmax(0,1fr)_64px] sm:items-center">
            <div>
              <SkeletonBlock className="h-5 w-3/4" />
              <SkeletonBlock className="mt-2 h-4 w-1/2" />
            </div>
            <SkeletonBlock className="h-4 w-16 sm:justify-self-end" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RoleSlugLoading() {
  return (
    <main className="bg-[#FFFCF7] text-[#1C1C1A]" data-role-theme data-role-slug-theme>
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="py-6 sm:py-8 lg:py-10">
          <SkeletonBlock className="mb-7 h-4 w-48" />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
            <div className="max-w-3xl">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="mt-4 h-12 w-full max-w-[620px]" />
              <SkeletonBlock className="mt-3 h-12 w-2/5 max-w-[320px]" />
              <SkeletonBlock className="mt-5 h-5 w-full max-w-[620px]" />
              <SkeletonBlock className="mt-3 h-5 w-4/5 max-w-[520px]" />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(180,83,9,0.16)] pt-5 lg:border-t-0 lg:pl-8 lg:pt-0">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <SkeletonBlock className="h-8 w-20" />
                  <SkeletonBlock className="mt-2 h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[rgba(180,83,9,0.16)] py-6">
          <div className="grid gap-5 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}>
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-3 h-6 w-32" />
              </div>
            ))}
          </div>
        </section>

        <section className="py-7">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="mt-3 h-8 w-52" />
            </div>
            <SkeletonBlock className="h-4 w-72" />
          </div>
          <div className="rounded-[8px] border border-[rgba(28,28,26,0.08)] bg-[#FFFFFF] p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="mb-3 h-16 w-full last:mb-0" />
            ))}
          </div>
        </section>

        <section className="grid gap-9 border-t border-[rgba(180,83,9,0.16)] py-8 lg:grid-cols-3">
          <SkeletonLinkList />
          <SkeletonLinkList />
          <SkeletonLinkList />
        </section>
      </div>
    </main>
  );
}
