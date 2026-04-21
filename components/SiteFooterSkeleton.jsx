function SkeletonBlock({ className }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#EDE9FF] ${className || ""}`} data-site-footer-skeleton-block />;
}

export default function SiteFooterSkeleton() {
  return (
    <footer className="border-t border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] text-[#1C1C1A]" data-site-footer data-site-footer-skeleton>
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,2.45fr)] lg:items-start">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-11 w-11" />
              <SkeletonBlock className="h-7 w-40" />
            </div>
            <SkeletonBlock className="mt-5 h-4 w-full max-w-md" />
            <SkeletonBlock className="mt-2 h-4 w-3/4 max-w-sm" />
            <div className="mt-5">
              <SkeletonBlock className="h-11 w-full max-w-sm" />
            </div>
          </div>

          <nav
            className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.28fr_1fr_0.95fr]"
            aria-label="Footer navigation loading"
          >
            {Array.from({ length: 4 }).map((_, groupIndex) => (
              <div key={groupIndex}>
                <SkeletonBlock className="mb-4 h-3 w-24" />
                <div className="grid gap-3">
                  {Array.from({ length: groupIndex === 2 ? 5 : groupIndex === 3 ? 3 : 4 }).map((__, linkIndex) => (
                    <SkeletonBlock
                      key={linkIndex}
                      className={`h-4 ${linkIndex % 2 === 0 ? "w-32" : "w-24"}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-9 grid gap-4 border-t border-[rgba(0,0,0,0.08)] pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <SkeletonBlock className="h-4 w-56" />
          <SkeletonBlock className="h-4 w-72 sm:justify-self-end" />
        </div>
      </div>
    </footer>
  );
}
