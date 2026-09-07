import { useEffect, useRef, useState } from 'react';
import createBodyHighlighter, { type IExerciseData, type Muscle } from 'body-highlighter';
import { RANK_TIERS, type MuscleRankResult, type MuscleGroup } from '../../utils/ranking';

interface RankBodyMapProps {
  muscleRanks: MuscleRankResult[];
  activeToday?: MuscleGroup[];
}

type ViewMuscleDef = { key: Muscle; activity: MuscleGroup };

const FRONT_MUSCLES: ViewMuscleDef[] = [
  { key: 'chest', activity: 'Chest' },
  { key: 'front-deltoids', activity: 'Shoulders' },
  { key: 'biceps', activity: 'Biceps' },
  { key: 'triceps', activity: 'Triceps' },
  { key: 'forearm', activity: 'Forearms' },
  { key: 'abs', activity: 'Abs' },
  { key: 'obliques', activity: 'Abs' },
  { key: 'quadriceps', activity: 'Legs' },
  { key: 'abductors', activity: 'Abductors' },
  { key: 'calves', activity: 'Calves' },
];

const BACK_MUSCLES: ViewMuscleDef[] = [
  { key: 'trapezius', activity: 'Back' },
  { key: 'upper-back', activity: 'Back' },
  { key: 'back-deltoids', activity: 'Shoulders' },
  { key: 'triceps', activity: 'Triceps' },
  { key: 'lower-back', activity: 'Core' },
  { key: 'forearm', activity: 'Forearms' },
  { key: 'adductor', activity: 'Adductors' },
  { key: 'hamstring', activity: 'Hamstrings' },
  { key: 'calves', activity: 'Calves' },
  { key: 'left-soleus', activity: 'Calves' },
  { key: 'right-soleus', activity: 'Calves' },
];

// Display labels: map internal muscle-group names to user-facing anatomy labels.
const MUSCLE_LABELS: Record<string, string> = {
  Core: 'Lower Back',
};
const ACTIVITY_BY_MUSCLE = new Map<Muscle, MuscleGroup>(
  [...FRONT_MUSCLES, ...BACK_MUSCLES].map(({ key, activity }) => [key, activity]),
);

// body-highlighter renders polygons in model-data order. We tag each polygon
// with its canonical muscle key by walking the ordered polygon counts per view.
const ANTERIOR_ORDER: Muscle[] = [
  'chest', 'obliques', 'abs', 'biceps', 'triceps', 'neck', 'front-deltoids',
  'head', 'abductors', 'quadriceps', 'knees', 'calves', 'forearm',
];
const POSTERIOR_ORDER: Muscle[] = [
  'head', 'trapezius', 'back-deltoids', 'upper-back', 'triceps', 'lower-back',
  'forearm', 'gluteal', 'adductor', 'hamstring', 'knees', 'calves',
  'left-soleus', 'right-soleus',
];

const POLYGON_COUNTS: Record<string, { anterior: number; posterior: number }> = {
  chest: { anterior: 2, posterior: 0 },
  obliques: { anterior: 2, posterior: 0 },
  abs: { anterior: 2, posterior: 0 },
  biceps: { anterior: 2, posterior: 0 },
  triceps: { anterior: 2, posterior: 4 },
  neck: { anterior: 2, posterior: 0 },
  'front-deltoids': { anterior: 2, posterior: 0 },
  head: { anterior: 1, posterior: 1 },
  abductors: { anterior: 2, posterior: 0 },
  quadriceps: { anterior: 6, posterior: 0 },
  knees: { anterior: 2, posterior: 2 },
  calves: { anterior: 4, posterior: 4 },
  forearm: { anterior: 4, posterior: 4 },
  trapezius: { anterior: 0, posterior: 2 },
  'back-deltoids': { anterior: 0, posterior: 2 },
  'upper-back': { anterior: 0, posterior: 2 },
  'lower-back': { anterior: 0, posterior: 2 },
  gluteal: { anterior: 0, posterior: 2 },
  hamstring: { anterior: 0, posterior: 4 },
  'left-soleus': { anterior: 0, posterior: 1 },
  'right-soleus': { anterior: 0, posterior: 1 },
};

function tagPolygons(container: HTMLElement, view: 'anterior' | 'posterior') {
  const order = view === 'anterior' ? ANTERIOR_ORDER : POSTERIOR_ORDER;
  const polygons = Array.from(container.querySelectorAll<SVGPolygonElement>('polygon'));
  let idx = 0;
  for (const muscle of order) {
    const count = POLYGON_COUNTS[muscle]?.[view] ?? 0;
    for (let i = 0; i < count && idx < polygons.length; i++) {
      polygons[idx++].setAttribute('data-muscle', muscle);
    }
  }
}

export default function RankBodyMap({ muscleRanks, activeToday = [] }: RankBodyMapProps) {
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<{ label: string; color: string; detail: string } | null>(null);

  useEffect(() => {
    const rankMap = new Map<string, MuscleRankResult>();
    for (const mr of muscleRanks) rankMap.set(mr.muscle, mr);

    const activeSet = new Set<string>(activeToday);

    const buildData = (defs: ViewMuscleDef[]): IExerciseData[] => {
      const out: IExerciseData[] = [];
      for (const { key, activity } of defs) {
        const rank = rankMap.get(activity);
        if (!rank || (rank.score ?? 0) <= 0) continue;
        out.push({ name: activity, muscles: [key], frequency: rank.tier.level + 1 });
      }
      return out;
    };

    const handleClick = ({ muscle }: { muscle: Muscle }) => {
      const activity = ACTIVITY_BY_MUSCLE.get(muscle);
      const rank = activity ? rankMap.get(activity) : undefined;
      setTooltip({
        label: MUSCLE_LABELS[rank?.muscle ?? ''] ?? rank?.muscle ?? String(muscle),
        color: rank?.tier.color ?? 'var(--text-muted)',
        detail: rank && (rank.score ?? 0) > 0
          ? `${rank.tier.name} · Composite ${(rank.score ?? 0).toFixed(0)} / 100${rank.peakScore > 0 ? ` (Peak ${rank.peakWeight}kg × ${rank.peakReps})` : ''}`
          : 'No data yet',
      });
    };

    const colors = RANK_TIERS.map((t) => t.color);

    const activeMuscleKeys = new Set<string>();
    for (const activity of activeSet) {
      for (const def of [...FRONT_MUSCLES, ...BACK_MUSCLES]) {
        if (def.activity === activity) activeMuscleKeys.add(def.key);
      }
    }

    const applyPulse = (container: HTMLElement, view: 'anterior' | 'posterior') => {
      tagPolygons(container, view);
      container.querySelectorAll<SVGPolygonElement>('polygon[data-muscle]').forEach((el) => {
        if (activeMuscleKeys.has(el.dataset.muscle ?? '')) {
          el.classList.add('daily-active-pulse');
        }
      });
    };

    let front: ReturnType<typeof createBodyHighlighter> | null = null;
    let back: ReturnType<typeof createBodyHighlighter> | null = null;

    if (frontRef.current) {
      front = createBodyHighlighter({
        type: 'anterior',
        data: buildData(FRONT_MUSCLES),
        container: frontRef.current,
        bodyColor: 'rgba(255,255,255,0.06)',
        highlightedColors: colors,
        onClick: handleClick,
      });
    }
    if (backRef.current) {
      back = createBodyHighlighter({
        type: 'posterior',
        data: buildData(BACK_MUSCLES),
        container: backRef.current,
        bodyColor: 'rgba(255,255,255,0.06)',
        highlightedColors: colors,
        onClick: handleClick,
      });
    }

    if (frontRef.current) {
      applyPulse(frontRef.current, 'anterior');
    }
    if (backRef.current) {
      applyPulse(backRef.current, 'posterior');
    }

    return () => {
      front?.destroy();
      back?.destroy();
    };
  }, [muscleRanks, activeToday]);

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes activeMuscleGlow {
          0%   { filter: drop-shadow(0 0 2px #38bdf8); opacity: 1; }
          50%  { filter: drop-shadow(0 0 8px #38bdf8); opacity: 0.7; }
          100% { filter: drop-shadow(0 0 2px #38bdf8); opacity: 1; }
        }
        .daily-active-pulse {
          animation: activeMuscleGlow 2s infinite ease-in-out;
          stroke: #ffffff !important;
          stroke-width: 0.6px !important;
        }
      `}</style>
      <div className="flex gap-4 justify-center items-start">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Front
          </p>
          <div ref={frontRef} style={{ width: 150, height: 300 }} className="mx-auto" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Back
          </p>
          <div ref={backRef} style={{ width: 150, height: 300 }} className="mx-auto" />
        </div>
      </div>

      {/* Tier legend */}
      <div className="flex justify-center gap-2.5 flex-wrap">
        {RANK_TIERS.map((tier) => (
          <div key={tier.name} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: tier.color, boxShadow: tier.cssGlow !== 'none' ? tier.cssGlow : undefined }} />
            <span className="text-[9px] font-semibold" style={{ color: tier.color }}>{tier.name}</span>
          </div>
        ))}
      </div>

      {activeToday.length > 0 && (
        <p className="text-center text-[10px]" style={{ color: '#38bdf8' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: '#38bdf8', marginRight: 5, boxShadow: '0 0 8px #38bdf8' }} />
          Pulsing muscles trained today
        </p>
      )}

      {tooltip && (
        <div
          className="mx-auto mt-1 px-3 py-2 rounded-lg text-center"
          style={{ background: 'var(--bg-surface-elevated)', border: `1px solid ${tooltip.color}40`, maxWidth: 260 }}
        >
          <p className="text-xs font-bold" style={{ color: tooltip.color }}>{tooltip.label}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tooltip.detail}</p>
        </div>
      )}
    </div>
  );
}
