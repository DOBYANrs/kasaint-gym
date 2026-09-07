import { useMemo } from 'react';
import type { UserId } from '../../types';
import { useWorkout } from '../../context/WorkoutContext';
import { calculateMaxWeight } from '../../utils/calculations';

interface PRInfo {
  exercise: string;
  weightKg: number;
  reps: number;
  dateKey: string;
}

// Bodyweight, timed holds — not a weight PR, never shown as one.
const BODYWEIGHT_TIMED = new Set(['Dead Hang']);

export function usePRData(userId: UserId) {
  const { workoutData } = useWorkout();

  const prData = useMemo(() => {
    const exerciseHistory: Record<string, PRInfo[]> = {};

    // Collect all workout data for this user
    const userData = workoutData[userId] ?? {};
    for (const [dateKey, day] of Object.entries(userData)) {
      if (!day?.exercises) continue;
      for (const exercise of day.exercises) {
        if (BODYWEIGHT_TIMED.has(exercise.exerciseName)) continue;
        const weightKg = calculateMaxWeight(exercise);
        if (weightKg > 0) {
          const reps = Math.max(...exercise.sets.filter((s) => s.weightKg === weightKg).map((s) => s.reps), 0);
          if (!exerciseHistory[exercise.exerciseName]) {
            exerciseHistory[exercise.exerciseName] = [];
          }
          exerciseHistory[exercise.exerciseName].push({ exercise: exercise.exerciseName, weightKg, reps, dateKey });
        }
      }
    }

    // Find PRs — heaviest real kg, most reps on ties, latest date last.
    const prs: PRInfo[] = [];
    for (const [, history] of Object.entries(exerciseHistory)) {
      const sorted = [...history].sort((a, b) =>
        b.weightKg - a.weightKg || b.reps - a.reps || a.dateKey.localeCompare(b.dateKey),
      );
      if (sorted.length > 0 && sorted[0].weightKg > 0) {
        prs.push(sorted[0]);
      }
    }

    // Calculate streaks (consecutive weeks with workouts)
    let streak = 0;
    const today = new Date();
    for (let w = 0; w < 52; w++) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - (w * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const hasWorkout = Object.keys(userData).some((key) => {
        const d = new Date(key + 'T12:00:00');
        return d >= weekStart && d <= weekEnd && userData[key]?.completed;
      });

      if (hasWorkout || w === 0) {
        streak++;
      } else {
        break;
      }
    }

    return { prs, streak, totalWorkouts: Object.values(userData).filter((d) => d?.completed).length };
  }, [userId, workoutData]);

  return prData;
}

export default function PRBadges({ userId }: { userId: UserId }) {
  const { prs, streak, totalWorkouts } = usePRData(userId);

  return (
    <div className="space-y-3">
      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: 'linear-gradient(160deg, rgba(255,94,0,0.08), rgba(255,94,0,0.03))',
            border: '1px solid rgba(255,94,0,0.15)',
          }}
        >
          <p className="text-2xl font-bold" style={{ color: '#FF5E00' }}>{streak}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Week Streak</p>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: 'linear-gradient(160deg, rgba(0,230,118,0.08), rgba(0,230,118,0.03))',
            border: '1px solid rgba(0,230,118,0.15)',
          }}
        >
          <p className="text-2xl font-bold" style={{ color: '#00E676' }}>{totalWorkouts}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Workouts Done</p>
        </div>
      </div>

      {/* PR Badges */}
      {prs.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>🏆 Personal Records</p>
          <div className="space-y-1.5">
            {prs.map((pr) => (
              <div
                key={pr.exercise}
                className="flex items-center justify-between py-2 px-3 rounded-xl"
                style={{
                  background: 'linear-gradient(160deg, rgba(255,94,0,0.06), rgba(255,94,0,0.02))',
                  border: '1px solid rgba(255,94,0,0.1)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏆</span>
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{pr.exercise}</span>
                </div>
                <span className="text-xs font-bold" style={{ color: '#FF5E00' }}>
                  {pr.weightKg} kg × {pr.reps}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
