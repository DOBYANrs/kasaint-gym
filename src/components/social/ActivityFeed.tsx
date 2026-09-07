import { useMemo } from 'react';
import { useWorkout } from '../../context/WorkoutContext';
import { calculateVolume } from '../../utils/calculations';
import type { UserId } from '../../types';

const USER_DISPLAY: Record<UserId, { name: string; emoji: string; color: string }> = {
  abel: { name: 'Abel', emoji: '💪', color: '#3B82F6' },
  keneni: { name: 'Keneni', emoji: '🔥', color: '#00E676' },
};

interface FeedItem {
  userId: UserId;
  dateKey: string;
  dayLabel: string;
  totalVolume: number;
  exerciseCount: number;
  prCount: number;
  timeAgo: string;
}

function getTimeAgo(dateKey: string): string {
  const now = new Date();
  const then = new Date(dateKey + 'T12:00:00');
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

export default function ActivityFeed() {
  const { workoutData } = useWorkout();

  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];
    const users: UserId[] = ['abel', 'keneni'];

    for (const userId of users) {
      const userData = workoutData[userId] ?? {};

      // Per-exercise all-time heaviest real kg, used to count genuine PRs.
      const allTimeBest: Record<string, number> = {};
      for (const [, day] of Object.entries(userData)) {
        if (!day?.exercises) continue;
        for (const ex of day.exercises) {
          for (const set of ex.sets) {
            if (set.weightKg > 0 && set.weightKg > (allTimeBest[ex.exerciseName] ?? 0)) {
              allTimeBest[ex.exerciseName] = set.weightKg;
            }
          }
        }
      }

      for (const [dateKey, day] of Object.entries(userData)) {
        if (!day?.completed || !day.exercises?.length) continue;

        let totalVolume = 0;
        let prCount = 0;

        for (const ex of day.exercises) {
          totalVolume += calculateVolume(ex);
          const bestKg = allTimeBest[ex.exerciseName] ?? 0;
          const hitsBest = ex.sets.some((s) => s.weightKg > 0 && s.weightKg >= bestKg);
          if (hitsBest) prCount++;
        }

        items.push({
          userId,
          dateKey,
          dayLabel: day.dayOfWeek.charAt(0).toUpperCase() + day.dayOfWeek.slice(1),
          totalVolume,
          exerciseCount: day.exercises.length,
          prCount,
          timeAgo: getTimeAgo(dateKey),
        });
      }
    }

    return items.sort((a, b) => b.dateKey.localeCompare(a.dateKey)).slice(0, 20);
  }, [workoutData]);

  if (feedItems.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No workouts logged yet</p>
        <p className="text-xs" style={{ color: 'rgba(142, 149, 165, 0.5)' }}>Complete a workout to see it here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {feedItems.map((item, i) => {
        const user = USER_DISPLAY[item.userId];
        return (
          <div
            key={`${item.userId}-${item.dateKey}`}
            className="flex items-start gap-3 py-3 px-3 rounded-xl animate-slideUp"
            style={{
              background: 'var(--bg-surface)',
              border: 'var(--border-subtle)',
              animationDelay: `${i * 40}ms`,
            }}
          >
            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
              style={{
                background: `${user.color}15`,
                border: `1px solid ${user.color}30`,
              }}
            >
              {user.emoji}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold" style={{ color: user.color }}>{user.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>completed</span>
                <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{item.dayLabel}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {item.totalVolume.toLocaleString()} kg volume
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {item.exerciseCount} exercises
                </span>
                {item.prCount > 0 && (
                  <span className="text-[10px] font-semibold" style={{ color: '#FF5E00' }}>
                    🏆 {item.prCount} PR{item.prCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Time */}
            <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(142, 149, 165, 0.4)' }}>
              {item.timeAgo}
            </span>
          </div>
        );
      })}
    </div>
  );
}
