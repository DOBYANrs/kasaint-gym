import { useMemo, useState } from 'react';
import { useWorkout } from '../../context/WorkoutContext';
import { calculateExercise1RM } from '../../utils/calculations';
import type { UserId } from '../../types';

const USER_DISPLAY: Record<UserId, { name: string; color: string }> = {
  abel: { name: 'Abel', color: '#3B82F6' },
  keneni: { name: 'Keneni', color: '#00E676' },
};

// Key exercises for leaderboard
const LEADERBOARD_EXERCISES = [
  'Incline Chest Press',
  'Cable Fly',
  'Overhead Press',
  'Biceps Curl / Cable Curl',
  'Pull Up',
  'Leg Extension',
  'Triceps Push Down',
  'Hamstring Curl',
  'Calf Raise',
  'Spider Curl',
];

export default function Leaderboard() {
  const { workoutData } = useWorkout();
  const [selectedExercise, setSelectedExercise] = useState(LEADERBOARD_EXERCISES[0]);

  const rankings = useMemo(() => {
    const results: { userId: UserId; oneRM: number; bestWeight: number; bestReps: number }[] = [];

    for (const userId of ['abel', 'keneni'] as UserId[]) {
      const userData = workoutData[userId] ?? {};
      let best1RM = 0;
      let bestWeight = 0;
      let bestReps = 0;

      for (const [, day] of Object.entries(userData)) {
        if (!day?.exercises) continue;
        for (const ex of day.exercises) {
          if (ex.exerciseName !== selectedExercise) continue;
          for (const set of ex.sets) {
            if (set.weightKg > 0 && set.reps > 0) {
              const rm = calculateExercise1RM({ ...ex, sets: [set] });
              if (rm > best1RM) {
                best1RM = rm;
                bestWeight = set.weightKg;
                bestReps = set.reps;
              }
            }
          }
        }
      }

      results.push({ userId, oneRM: Math.round(best1RM * 10) / 10, bestWeight, bestReps });
    }

    return results.sort((a, b) => b.oneRM - a.oneRM);
  }, [workoutData, selectedExercise]);

  const maxOneRM = Math.max(...rankings.map((r) => r.oneRM), 1);

  return (
    <div className="space-y-3">
      {/* Exercise selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {LEADERBOARD_EXERCISES.map((ex) => (
          <button
            key={ex}
            onClick={() => setSelectedExercise(ex)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all duration-200"
            style={{
              background: selectedExercise === ex ? 'rgba(255, 94, 0, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              color: selectedExercise === ex ? '#FF5E00' : 'var(--text-muted)',
              border: selectedExercise === ex ? '1px solid rgba(255, 94, 0, 0.2)' : '1px solid transparent',
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Rankings */}
      <div className="space-y-2">
        {rankings.map((rank, i) => {
          const user = USER_DISPLAY[rank.userId];
          const barWidth = maxOneRM > 0 ? (rank.oneRM / maxOneRM) * 100 : 0;
          const isWinner = i === 0 && rank.oneRM > 0;

          return (
            <div
              key={rank.userId}
              className="rounded-xl p-3"
              style={{
                background: isWinner
                  ? 'linear-gradient(160deg, rgba(255,94,0,0.08), rgba(255,94,0,0.03))'
                  : 'var(--bg-surface)',
                border: isWinner ? '1px solid rgba(255,94,0,0.15)' : 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: isWinner ? '#FF5E00' : 'var(--text-muted)' }}>
                    #{i + 1}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: user.color }}>{user.name}</span>
                  {isWinner && <span className="text-xs">🏆</span>}
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold" style={{ color: isWinner ? '#FF5E00' : 'rgba(255,255,255,0.9)' }}>
                    {rank.oneRM > 0 ? `${rank.oneRM} kg` : '—'}
                  </span>
                  {rank.bestWeight > 0 && (
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      Best: {rank.bestWeight}kg × {rank.bestReps}
                    </p>
                  )}
                </div>
              </div>

              {/* Bar */}
              <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${barWidth}%`,
                    background: isWinner
                      ? 'linear-gradient(90deg, #FF5E00, #FF7828)'
                      : `${user.color}60`,
                    boxShadow: isWinner ? '0 0 8px rgba(255, 94, 0, 0.3)' : undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
