// Progress bars for the long-running admin jobs under /data — re-indexing the glossary,
// sweeping stray search records, scanning the index.
//
// Two shapes, because the jobs come in two kinds. A job the page drives a step at a time knows
// how many steps are left and gets a filling bar; a job that is one server call with an
// unknown amount of work behind it gets a sliding bar and an elapsed clock, which says "still
// running, and here is how long for" without inventing a percentage.
import { useEffect, useState } from 'react';

export function ProgressBar({ value, max }: { value: number; max: number }) {
  // A stale total — the counts on the page are a snapshot — must not overflow the track.
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      aria-valuemin={0}
      role="progressbar"
      aria-valuemax={max}
      aria-valuenow={value}
      className="bg-muted h-2 w-full overflow-hidden rounded-full"
    >
      <div style={{ width: `${percent}%` }} className="bg-primary h-full transition-all duration-300" />
    </div>
  );
}

export function IndeterminateBar() {
  return (
    <div role="progressbar" aria-valuetext="working" className="bg-muted h-2 w-full overflow-hidden rounded-full">
      <div className="bg-primary animate-indeterminate h-full w-1/5 rounded-full" />
    </div>
  );
}

// Seconds since `active` last became true, for jobs with no total to count against. Stops
// ticking — and resets — when the job ends, so the last value stays on screen only as long as
// the bar it belongs to.
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);

  return seconds;
}

// "1:04" rather than "64s" once a job runs past a minute, which these routinely do.
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
