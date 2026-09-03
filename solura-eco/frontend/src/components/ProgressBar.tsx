"use client";

import { useEffect, useState } from "react";

/**
 * Fills from 0 on every mount instead of rendering pre-filled from SSR --
 * a purely server-rendered bar has no "before" state to transition from
 * (it's born at its final width), so `transition-[width]` on it alone never
 * actually animates on page load. Starting at 0 client-side and flipping to
 * the real value in an effect gives the transition something to animate.
 */
export function ProgressBar({
  progress,
  gradient,
  className = "h-1.5",
}: {
  progress: number;
  gradient: string;
  className?: string;
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(progress));
    return () => cancelAnimationFrame(id);
  }, [progress]);

  return (
    <div className={`${className} flex-1 overflow-hidden rounded-full bg-bg3`}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${width}%`, backgroundImage: gradient }}
      />
    </div>
  );
}
