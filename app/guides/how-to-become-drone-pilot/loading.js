function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#EDE9FF] ${className}`} />;
}

function SkeletonStep() {
  return (
    <div className="relative grid gap-4 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] p-5 shadow-[0_14px_30px_rgba(28,28,26,0.05)] sm:grid-cols-[52px_minmax(0,1fr)]">
      <SkeletonBlock className="h-12 w-12 rounded-full bg-[#5B4FE8]" />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-6 w-20 rounded-full" />
          <SkeletonBlock className="h-3 w-28 bg-[#F4F1FF]" />
        </div>
        <SkeletonBlock className="mt-4 h-7 w-2/3" />
        <SkeletonBlock className="mt-3 h-4 w-full bg-[#F4F1FF]" />
        <SkeletonBlock className="mt-2 h-4 w-4/5 bg-[#F4F1FF]" />
      </div>
    </div>
  );
}

export default function DronePilotGuideLoading() {
  return (
    <main className="overflow-x-hidden bg-[#FFFCF7] text-[#1C1C1A]" data-guide-pilot-page>
      <section className="relative overflow-hidden border-b border-[rgba(91,79,232,0.1)] bg-[#FFFCF7]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 18% 18%, rgba(91,79,232,0.16), transparent 27%), radial-gradient(circle at 88% 4%, rgba(180,83,9,0.08), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(255,252,247,0.98) 58%, #FFFCF7 100%)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-[1220px] gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 lg:px-8 lg:pb-20 lg:pt-24">
          <div className="min-w-0">
            <div className="mb-8 flex flex-wrap items-center gap-2">
              <SkeletonBlock className="h-8 w-20 rounded-full bg-[#FFFFFF]" />
              <SkeletonBlock className="h-8 w-20 rounded-full bg-[#FFFFFF]" />
              <SkeletonBlock className="h-8 w-28 rounded-full bg-[#F4F1FF]" />
            </div>
            <SkeletonBlock className="h-16 w-full max-w-[680px] sm:h-20" />
            <SkeletonBlock className="mt-3 h-16 w-4/5 max-w-[560px] sm:h-20" />
            <SkeletonBlock className="mt-6 h-5 w-full max-w-[620px] bg-[#F4F1FF]" />
            <SkeletonBlock className="mt-3 h-5 w-4/5 max-w-[520px] bg-[#F4F1FF]" />

            <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="grid min-h-[94px] grid-cols-[42px_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[rgba(255,255,255,0.74)] p-4 shadow-[0_12px_24px_rgba(28,28,26,0.04)] sm:block sm:min-h-0">
                  <SkeletonBlock className="h-10 w-10" />
                  <div className="min-w-0">
                    <SkeletonBlock className="h-3 w-20 bg-[#F4F1FF] sm:mt-3" />
                    <SkeletonBlock className="mt-2 h-5 w-28" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <SkeletonBlock className="h-12 w-44 bg-[#5B4FE8]" />
              <SkeletonBlock className="h-12 w-40 bg-[#FFFFFF]" />
            </div>
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="relative overflow-hidden rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-5 shadow-[0_24px_54px_rgba(28,28,26,0.08)]">
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#5B4FE8,#B45309)]" aria-hidden />
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="mt-3 h-7 w-48" />
              <SkeletonBlock className="mt-5 h-4 w-full bg-[#F4F1FF]" />
              <SkeletonBlock className="mt-2 h-4 w-5/6 bg-[#F4F1FF]" />
              <div className="mt-6 grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-[8px] border border-[rgba(91,79,232,0.1)] bg-[#FFFCF7] p-3.5">
                    <SkeletonBlock className="h-8 w-8 rounded-full bg-[#5B4FE8]" />
                    <div>
                      <SkeletonBlock className="h-3 w-24" />
                      <SkeletonBlock className="mt-2 h-4 w-full bg-[#F4F1FF]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1220px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12">
          <div>
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="mt-4 h-10 w-full max-w-[320px]" />
            <SkeletonBlock className="mt-3 h-4 w-full max-w-[340px] bg-[#F4F1FF]" />
            <SkeletonBlock className="mt-2 h-4 w-4/5 max-w-[280px] bg-[#F4F1FF]" />
          </div>
          <div className="grid gap-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonStep key={index} />
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-8 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] p-5 shadow-[0_18px_36px_rgba(28,28,26,0.05)] sm:p-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-4 h-10 w-full max-w-[360px]" />
            <SkeletonBlock className="mt-3 h-4 w-full bg-[#F4F1FF]" />
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-14 w-full bg-[#FFFCF7]" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
