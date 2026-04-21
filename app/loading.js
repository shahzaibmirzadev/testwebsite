function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#EDE9FF] ${className}`} />;
}

function SkeletonJobCard() {
  return (
    <div className="rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-4 shadow-[0_10px_24px_rgba(28,28,26,0.04)]">
      <div className="grid gap-3 sm:grid-cols-[56px_minmax(0,1fr)_90px] sm:items-start">
        <SkeletonBlock className="h-14 w-14" />
        <div className="min-w-0">
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="mt-3 h-4 w-2/3 bg-[#F4F1FF]" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-7 w-20 rounded-full bg-[#F7F7F8]" />
            ))}
          </div>
        </div>
        <div className="flex gap-2 sm:flex-col sm:items-end">
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-9 w-20 bg-[#F4F1FF]" />
        </div>
      </div>
    </div>
  );
}

export default function HomeLoading() {
  return (
    <main className="min-h-screen bg-[#FFFCF7] text-[#1C1C1A]" data-home-page>
      <section className="relative overflow-hidden border-b border-[rgba(91,79,232,0.08)] bg-[#FFFCF7]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(circle at top, rgba(91,79,232,0.14), rgba(255,252,247,0) 44%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,252,247,0.98))",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-[1180px] px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-20 lg:pt-24">
          <div className="mx-auto max-w-[920px] text-center">
            <SkeletonBlock className="mx-auto h-16 w-full max-w-[720px] sm:h-20" />
            <SkeletonBlock className="mx-auto mt-3 h-16 w-4/5 max-w-[600px] sm:h-20" />
            <SkeletonBlock className="mx-auto mt-6 h-5 w-full max-w-[680px]" />
            <SkeletonBlock className="mx-auto mt-3 h-5 w-3/4 max-w-[520px]" />
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <SkeletonBlock className="h-12 w-36 bg-[#5B4FE8]" />
              <SkeletonBlock className="h-12 w-32 bg-[#FFFFFF]" />
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-[1120px] rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-4 shadow-[0_24px_54px_rgba(28,28,26,0.1)] sm:p-5">
            <div className="mb-3 grid gap-3 border-b border-[rgba(91,79,232,0.1)] pb-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="mt-3 h-4 w-full max-w-[520px] bg-[#F4F1FF]" />
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-9 w-24 rounded-full bg-[#F7F7F8]" />
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_160px_144px]">
              <SkeletonBlock className="h-[54px] bg-[#FFFCF7]" />
              <SkeletonBlock className="h-[54px] bg-[#FFFCF7]" />
              <SkeletonBlock className="h-[54px] bg-[#FFFCF7]" />
              <SkeletonBlock className="h-[54px] bg-[#5B4FE8]" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-11 bg-[#FFFFFF]" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-5 py-5 shadow-[0_16px_34px_rgba(28,28,26,0.05)] sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="mt-3 h-9 w-64" />
              <SkeletonBlock className="mt-3 h-4 w-full max-w-[520px] bg-[#F4F1FF]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SkeletonBlock className="h-10 w-full sm:w-44" />
              <SkeletonBlock className="h-10 w-full sm:w-44" />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonJobCard key={index} />
            ))}
          </div>
          <div className="hidden rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-5 shadow-[0_18px_36px_rgba(28,28,26,0.05)] lg:block">
            <div className="flex items-start gap-4">
              <SkeletonBlock className="h-14 w-14" />
              <div className="flex-1">
                <SkeletonBlock className="h-5 w-3/4" />
                <SkeletonBlock className="mt-3 h-4 w-1/2 bg-[#F4F1FF]" />
              </div>
            </div>
            <SkeletonBlock className="mt-8 h-4 w-32" />
            <div className="mt-4 grid gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-4 w-full bg-[#F4F1FF]" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
