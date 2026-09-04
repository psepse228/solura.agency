// solura-eco/frontend/src/components/CourseGrid.tsx
type Course = {
  id: string;
  name: string;
  course_code: string | null;
  current_score: number | null;
  color: string | null;
};

const FALLBACK_COLOR = "#3a4152"; // neutral band when no Canvas color is set

export function CourseGrid({ courses }: { courses: Course[] }) {
  if (courses.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Courses</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {courses.map((c) => (
          <div key={c.id} className="overflow-hidden rounded-2xl border border-border bg-bg2">
            <div
              className="flex items-start px-3 py-2"
              style={{ backgroundColor: c.color ?? FALLBACK_COLOR }}
            >
              <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold text-white">
                {c.current_score === null ? "N/A" : `${Math.round(c.current_score)}%`}
              </span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[13.5px] font-semibold text-white">{c.course_code ?? c.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-silver-dim">{c.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
