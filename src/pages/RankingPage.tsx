import { useMemo } from 'react';
import { useUser } from '../context/UserContext';
import { useWorkout } from '../context/WorkoutContext';
import { useBody } from '../context/BodyContext';
import { calculateOverallUserRank, getTodayActivatedMuscles } from '../utils/ranking';
import { computeMuscleScores } from '../utils/rsiEngine';
import RankBodyMap from '../components/progress/RankBodyMap';

export default function RankingPage() {
  const { activeUser } = useUser();
  const { workoutData } = useWorkout();
  const { getLatestProfile } = useBody();
  const profile = getLatestProfile(activeUser);

  const rankResult = useMemo(
    () => calculateOverallUserRank(workoutData, activeUser, profile),
    [workoutData, activeUser, profile],
  );

  const activeToday = useMemo(
    () => getTodayActivatedMuscles(workoutData, activeUser),
    [workoutData, activeUser],
  );

  const { overallRank, overallTier, averageLevel, muscleRanks } = rankResult;

  const muscleScores = useMemo(
    () => computeMuscleScores(workoutData, activeUser, profile),
    [workoutData, activeUser, profile],
  );
  const trainedMuscles = muscleScores.filter((m) => m.score > 0);
  const avgScore = trainedMuscles.length > 0
    ? trainedMuscles.reduce((s, m) => s + m.score, 0) / trainedMuscles.length
    : 0;

  return (
    <div className="space-y-4 page-enter">
      {/* Header with overall rank */}
      <div
        className="rounded-2xl p-6 text-center overflow-hidden relative"
        style={{
          background: `linear-gradient(160deg, ${overallTier.color}15, ${overallTier.color}05)`,
          border: `1px solid ${overallTier.color}30`,
          boxShadow: overallTier.cssGlow !== 'none' ? overallTier.cssGlow : undefined,
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--text-muted)' }}>
          Overall Strength Rank
        </p>
        <p className="text-5xl font-black mb-1" style={{ color: overallTier.color }}>
          {overallRank}
        </p>
        <p className="text-sm font-bold" style={{ color: overallTier.color }}>
          Overall: {avgScore.toFixed(1)} / 100 · Tier Avg: {averageLevel.toFixed(1)} / 6.0
        </p>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Ranking uses your <span className="font-semibold">weight, height &amp; age</span> — each lift is normalized by bodyweight,
          adjusted for BMI leverage and age, then rated against real population strength norms
          (Strength Level, 150M+ lifts; Beginner 5th → Elite 95th percentile).
          Every exercise counts toward its muscle.
        </p>
      </div>

      {/* 2D Body Heatmap */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'var(--bg-surface)', border: 'var(--border-subtle)' }}
      >
        <p className="text-xs font-semibold mb-3 text-center" style={{ color: 'var(--text-muted)' }}>
          Muscle Strength Map — Click a Muscle for Details
        </p>
        <RankBodyMap muscleRanks={muscleRanks} activeToday={activeToday} />
      </div>

      {/* Composite Muscle Score Report */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'var(--bg-surface)', border: 'var(--border-subtle)' }}
      >
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Composite Muscle Scores</p>
        <p className="text-[9px] mb-3" style={{ color: 'var(--text-muted)' }}>
          Each muscle blends every exercise that targets it, weighted by effectiveness. Score = population percentile (0–100). Core uses rep targets.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="text-left font-semibold pb-1">Muscle</th>
                <th className="font-semibold pb-1">Score</th>
                <th className="text-left font-semibold pb-1">Top Lift</th>
                <th className="font-semibold pb-1">Best</th>
                <th className="font-semibold pb-1">Tier</th>
              </tr>
            </thead>
            <tbody>
              {muscleScores.map((m) => {
                const top = m.contributions
                  .filter((c) => c.pct > 0)
                  .sort((a, b) => b.pct - a.pct)[0];
                return (
                  <tr key={m.muscle} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', opacity: m.score > 0 ? 1 : 0.45 }}>
                    <td className="py-1 pr-2 font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{m.muscle}</td>
                    <td className="py-1 text-center font-bold" style={{ color: m.tier.color }}>{m.score.toFixed(0)}</td>
                    <td className="py-1 pr-2" style={{ color: 'var(--text-muted)' }}>{top?.exercise ?? '—'}</td>
                    <td className="py-1 text-center" style={{ color: 'var(--text-muted)' }}>
                      {top ? `${top.bestLoad}kg×${top.bestReps}` : '—'}
                    </td>
                    <td className="py-1 text-center">
                      <span className="px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${m.tier.color}20`, color: m.tier.color }}>
                        {m.tier.name}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Dimmed rows have no logged sets at all across your whole history. Pressing only colors Chest — incline-press weight never ranks your Shoulders.
          Lower Back and outer-thigh Abductors have no dedicated exercise in the plan, so they stay dimmed until you add one; inner-thigh Adductors are covered by the Adduction Machine.
        </p>
      </div>

      {/* Muscle Group Rankings */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'var(--bg-surface)', border: 'var(--border-subtle)' }}
      >
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Muscle Rankings (Composite Score)</p>
        <p className="text-[9px] mb-3" style={{ color: 'var(--text-muted)' }}>
          Composite muscle score (0–100 population percentile) from every mapped exercise. Core (Abs) uses target-rep completion.
        </p>
        <div className="space-y-2">
          {muscleRanks.map((mr) => {
            const hasData = (mr.score ?? 0) > 0;
            const barWidth = Math.min(100, (mr.score ?? 0));

            return (
              <div key={mr.muscle} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: hasData ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)' }}>
                      {mr.muscle}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: `${mr.tier.color}20`, color: mr.tier.color }}
                      >
                        {mr.tier.name}
                      </span>
                      {hasData && mr.peakScore > 0 && (
                        <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
                          Peak {mr.peakWeight}kg × {mr.peakReps}
                        </span>
                      )}
                      <span className="text-xs font-bold" style={{ color: hasData ? mr.tier.color : 'rgba(255,255,255,0.2)' }}>
                        {(mr.score ?? 0).toFixed(0)} / 100
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${barWidth}%`,
                        background: hasData ? mr.tier.color : 'rgba(255,255,255,0.06)',
                        boxShadow: hasData && mr.tier.cssGlow !== 'none' ? `0 0 8px ${mr.tier.color}40` : undefined,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
