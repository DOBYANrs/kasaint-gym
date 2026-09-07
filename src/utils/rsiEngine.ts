import type { ExerciseLog, UserId } from '../types';
import type { MuscleGroup, TierInfo } from './ranking';
import type { AthleteProfile } from './tierEngine';
import { SCIENTIFIC_TIERS } from './tierEngine';

// ============================================================
// ALLOMETRIC + BMI/AGE-ADJUSTED STRENGTH RANKING ENGINE
// ------------------------------------------------------------
// Uses bodyweight, height (BMI), age and exercise type together:
//   1. e1RM   = Epley best set  -> 1RM = W × (1 + Reps/30)
//   2. rel1RM = e1RM / bodyweight  (bodyweight multiple)
//   3. adjusted = rel1RM × BMI_leverage × age_coefficient
//   4. score  = percentile of adjusted ratio within per-exercise
//               population distribution (Beginner p10 … Elite p95)
//   5. muscle = effectiveness-weighted blend of EVERY exercise
//               that targets that muscle (no exercise left out)
// ============================================================

// ─── Tier boundaries by population percentile (7 tiers) ───
// percentile = LOWER bound required to reach that tier.
export const TIER_PERCENTILES: { name: string; percentile: number; level: number }[] = [
  { name: 'Untrained', percentile: 0, level: 0 },
  { name: 'Beginner', percentile: 10, level: 1 },
  { name: 'Intermediate', percentile: 25, level: 2 },
  { name: 'Upper-Intermediate', percentile: 50, level: 3 },
  { name: 'Advanced', percentile: 70, level: 4 },
  { name: 'Highly Advanced', percentile: 85, level: 5 },
  { name: 'Legendary / Elite', percentile: 95, level: 6 },
];

// Standard normal CDF (A&S 7.1.26) for z -> percentile.
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (z > 0) p = 1 - p;
  return p;
}

export function percentileFromZ(z: number): number {
  return normCdf(z) * 100;
}

export function tierFromPercentile(pct: number): { name: string; level: number } {
  for (let i = TIER_PERCENTILES.length - 1; i >= 0; i--) {
    if (pct >= TIER_PERCENTILES[i].percentile) {
      return { name: TIER_PERCENTILES[i].name, level: TIER_PERCENTILES[i].level };
    }
  }
  return { name: TIER_PERCENTILES[0].name, level: 0 };
}

// ─── Per-exercise population standards ─────────────────────
// Real bodyweight-ratio thresholds (e1RM ÷ bodyweight) for the five
// tier anchors. Ratios are taken from Strength Level's MALE standards tables
// (150M+ logged lifts) pulled in 2026, interpolated for a ~62-75 kg lifter:
//   Beginner = 5th pct, Novice = 20th, Intermediate = 50th,
//   Advanced = 80th, Elite = 95th.
// A lifter's ratio is interpolated between these fixed boundaries, so no
// ordinary gym lift extrapolates to an extreme percentile.
// rat = [beginner, novice, intermediate, advanced, elite]
// upper = upper-body/compression move (BMI leverage applies).
// Load is what the user logs (machine stack / plates as displayed). Two
// exceptions log TOTAL load including bodyweight: Standing Calf Raise and
// Pull Up — their thresholds are expressed against that total.
export interface ExerciseStandard {
  rat: [number, number, number, number, number];
  upper: boolean; // upper-body compression move (BMI leverage applies)
  // Muscle(s) targeted with relative effectiveness weight (sums across
  // exercises for a muscle are normalised at composite time).
  targets: { muscle: MuscleGroup; effectiveness: number }[];
  isCore?: boolean; // bodyweight/core move scored by reps, not load
  name: string;
  // Composite blend weight by exercise class (per scoring doc):
  //   compound lift 1.0, machine isolation 0.7, endurance hold 0.8.
  // Machine/higher-rep isolation work counts less toward a muscle's
  // composite than a pure compound lift so machine rows don't inflate Back
  // as much as free-weight pulls etc. Defaults to 1.0.
  scoreWeight?: number;
}

export const EXERCISE_STANDARDS: Record<string, ExerciseStandard> = {
  // ── CHEST ──
  // Incline Chest Press uses REAL INCLINE-bench population norms (Gravitus /
  // Strength Level logs of incline pressers), NOT flat-bench tables.
  // Incline is harder than flat bench — incline 1RM is typically only
  // 75-85% of a lifter's flat 1RM — so the same kg pressed on an incline
  // bench represents MORE strength than that same kg on a flat bench.
  // Scoring incline work against flat-bench standards would therefore
  // under-rank it; scoring it against its own (weaker) incline population
  // ladder gives an incline press exactly the extra credit it deserves.
  // Ratios are e1RM ÷ bodyweight at the 5/20/50/80/95th percentiles for men.
  'Incline Chest Press': {
    name: 'Incline Chest Press', rat: [0.58, 0.85, 1.06, 1.28, 1.50], upper: true,
    targets: [{ muscle: 'Chest', effectiveness: 0.45 }],
  },
  // Plate-loaded machine press. Easier to stabilize than a barbell incline,
  // so it keeps the previous ×0.85 relationship to the incline ladder above
  // (machine loads are judged on the same relative scale, slightly relaxed).
  'Yellow Machine Chest Press': {
    name: 'Yellow Machine Chest Press', rat: [0.49, 0.72, 0.90, 1.09, 1.28], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Chest', effectiveness: 0.20 }],
  },
  'Cable Fly': {
    name: 'Cable Fly', rat: [0.06, 0.20, 0.45, 0.75, 1.15], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Chest', effectiveness: 0.15 }],
  },
  'Cable Fly 55 Degree': {
    name: 'Cable Fly 55 Degree', rat: [0.06, 0.20, 0.45, 0.75, 1.15], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Chest', effectiveness: 0.15 }],
  },
  'Lower Chest Cable Pulldown': {
    name: 'Lower Chest Cable Pulldown', rat: [0.05, 0.18, 0.40, 0.68, 1.05], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Chest', effectiveness: 0.25 }],
  },
  // NOTE: none of the press/fly family above targets the coarse 'Shoulders'
  // group. Pressing is Chest-dominant: an incline press load is a CHEST
  // strength signal — the front-deltoid/triceps involvement is real but
  // secondary, so those muscles are only ever scored by their own direct
  // work (Overhead Press, Face Pulls, Reverse Fly, rows for rear delts, etc.).
  // ── BACK (vertical pull) ──
  // Lat Pulldown: 1RM/BW ratio from Strength Level.
  'Lat Pulldown': {
    name: 'Lat Pulldown', rat: [0.60, 0.85, 1.15, 1.45, 1.85], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Back', effectiveness: 0.35 }],
  },
  'Pull Down': {
    name: 'Pull Down', rat: [0.60, 0.85, 1.15, 1.45, 1.85], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Back', effectiveness: 0.35 }],
  },
  '1-Hand Lat Pulldown': {
    name: '1-Hand Lat Pulldown', rat: [0.30, 0.45, 0.60, 0.80, 1.00], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Back', effectiveness: 0.30 }],
  },
  'Pull Up': {
    name: 'Pull Up', rat: [0.75, 1.00, 1.25, 1.55, 1.85], upper: true, scoreWeight: 1.0,
    targets: [{ muscle: 'Back', effectiveness: 0.35 }],
  },
  // ── BACK (horizontal / upper-mid row) ──
  'Row Machine 2 Var 2': {
    name: 'Row Machine 2 Var 2', rat: [0.55, 0.80, 1.10, 1.45, 1.85], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Back', effectiveness: 0.40 }],
  },
  'Row Machine 1 Var 2': {
    name: 'Row Machine 1 Var 2', rat: [0.55, 0.80, 1.10, 1.45, 1.85], upper: true, scoreWeight: 0.7,
    targets: [
      { muscle: 'Back', effectiveness: 0.40 },
      { muscle: 'Shoulders', effectiveness: 0.15 },
    ],
  },
  'Archer Pull': {
    name: 'Archer Pull', rat: [0.50, 0.72, 1.00, 1.32, 1.70], upper: true, scoreWeight: 0.7,
    targets: [
      { muscle: 'Back', effectiveness: 0.20 },
      { muscle: 'Shoulders', effectiveness: 0.30 },
    ],
  },
  'Bent-Over Dumbbell Reverse Fly': {
    name: 'Bent-Over Dumbbell Reverse Fly', rat: [0.15, 0.25, 0.40, 0.60, 0.85], upper: true, scoreWeight: 0.7,
    targets: [
      { muscle: 'Shoulders', effectiveness: 0.30 },
      { muscle: 'Back', effectiveness: 0.20 },
    ],
  },
  // ── SHOULDERS ──
  // Overhead Press (barbell/dumbbell/machine): 1RM/BW ratio from Strength Level.
  'Overhead Press': {
    name: 'Overhead Press', rat: [0.35, 0.55, 0.78, 1.05, 1.32], upper: true,
    targets: [{ muscle: 'Shoulders', effectiveness: 0.50 }],
  },
  'Face Pulls': {
    name: 'Face Pulls', rat: [0.18, 0.30, 0.48, 0.70, 0.95], upper: true, scoreWeight: 0.7,
    targets: [
      { muscle: 'Shoulders', effectiveness: 0.20 },
      { muscle: 'Back', effectiveness: 0.10 },
    ],
  },
  'Lateral Raise': {
    name: 'Lateral Raise', rat: [0.05, 0.11, 0.21, 0.34, 0.48], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Shoulders', effectiveness: 0.30 }],
  },
  // ── LEGS (quad/glute) ──
  // 45° sled leg press (plates as displayed): SL 'Sled Leg Press' male table.
  // At 62 kg: Inter 179 kg / Adv 249 kg / Elite 327 kg 1RM (2.9× / 4.0× /
  // 5.3× bodyweight). 140kg×15 (~3.4×) is ~65th percentile here; the old
  // anchors (Elite 3.0×) made an ordinary leg-press set rank as Legendary.
  'Low-Foot Placement Leg Press': {
    name: 'Low-Foot Placement Leg Press', rat: [1.20, 1.95, 2.90, 4.00, 5.20], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Legs', effectiveness: 0.40 }],
  },
  'Low-Foot Leg Press': {
    name: 'Low-Foot Leg Press', rat: [1.20, 1.95, 2.90, 4.00, 5.20], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Legs', effectiveness: 0.40 }],
  },
  'Leg Press': {
    name: 'Leg Press', rat: [1.20, 1.95, 2.90, 4.00, 5.20], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Legs', effectiveness: 0.40 }],
  },
  'Leg Extension': {
    name: 'Leg Extension', rat: [0.60, 0.95, 1.40, 1.95, 2.55], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Legs', effectiveness: 0.30 }],
  },
  // ── HAMSTRINGS ──
  // Leg Curl (prone/seated): 1RM/BW ratio from Strength Level.
  'Hamstring Curl': {
    name: 'Hamstring Curl', rat: [0.42, 0.66, 1.00, 1.40, 1.82], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Hamstrings', effectiveness: 0.50 }],
  },
  'Leg Curl': {
    name: 'Leg Curl', rat: [0.42, 0.66, 1.00, 1.40, 1.82], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Hamstrings', effectiveness: 0.50 }],
  },
  // ── ADDUCTORS (inner thigh) ──
  // Hip Adduction Machine: relaxed thresholds — machine shows total weight
  // (both pads combined) so the logged ratio is higher than per-leg standards
  // assume. Calibrated: 40kg x 15 (rel ≈0.95) → Intermediate (~38th pct).
  'Adduction Machine': {
    name: 'Adduction Machine', rat: [0.55, 0.75, 1.10, 1.40, 1.75], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Adductors', effectiveness: 1.0 }],
  },
  // Legacy name for the same machine — still scored as inner-thigh adductors.
  'Abduction Machine': {
    name: 'Abduction Machine', rat: [0.55, 0.75, 1.10, 1.40, 1.75], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Adductors', effectiveness: 1.0 }],
  },
  // ── BICEPS ──
  // Spider curl and EZ/cable curl: SL barbell-curl male table (Inter 37 kg
  // 1RM at 62 kg BW). 20kg×12 → rel ~0.45 → Intermediate.
  'Spider Curl': {
    name: 'Spider Curl', rat: [0.30, 0.44, 0.60, 0.80, 1.03], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Biceps', effectiveness: 0.40 }],
  },
  'Biceps Curl / Cable Curl': {
    name: 'Biceps Curl / Cable Curl', rat: [0.26, 0.40, 0.60, 0.84, 1.10], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Biceps', effectiveness: 0.30 }],
  },
  // ── TRICEPS ──
  'Triceps Push Down': {
    name: 'Triceps Push Down', rat: [0.25, 0.40, 0.60, 0.85, 1.15], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Triceps', effectiveness: 0.40 }],
  },
  'Triceps Overhead Extension': {
    name: 'Triceps Overhead Extension', rat: [0.20, 0.32, 0.50, 0.72, 1.00], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Triceps', effectiveness: 0.30 }],
  },
  // ── CALVES ──
  'Calf Raise': {
    name: 'Calf Raise', rat: [0.34, 0.69, 1.21, 1.85, 2.60], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Calves', effectiveness: 0.50 }],
  },
  'Standing Calf Raise': {
    // The logged load already includes the lifter's bodyweight (they add it),
    // so the ratio is total-load ÷ bodyweight and bodyweight is factored in
    // automatically. Calibrated: 102kg (62.8 bw + ~40 barbell) x 20 (rel ≈2.5
    // with the 15-rep cap) → Intermediate.
    name: 'Standing Calf Raise', rat: [1.50, 2.10, 3.10, 4.00, 5.00], upper: false, scoreWeight: 0.7,
    targets: [{ muscle: 'Calves', effectiveness: 0.50 }],
  },
  // ── CORE / ABS (bodyweight -> scored by reps) ──
  'Cable Crunches': {
    name: 'Cable Crunches', rat: [0, 0, 0, 0, 0], upper: false, isCore: true, scoreWeight: 0.8, targets: [{ muscle: 'Abs', effectiveness: 0.25 }],
  },
  'Oblique Side Switches': {
    name: 'Oblique Side Switches', rat: [0, 0, 0, 0, 0], upper: false, isCore: true, scoreWeight: 0.8, targets: [{ muscle: 'Abs', effectiveness: 0.15 }],
  },
  'Floor Crunches / Hanging Knee Raises': {
    name: 'Floor Crunches / Hanging Knee Raises', rat: [0, 0, 0, 0, 0], upper: false, isCore: true, scoreWeight: 0.8, targets: [{ muscle: 'Abs', effectiveness: 0.25 }],
  },
  'Front Lever Progression': {
    name: 'Front Lever Progression', rat: [0, 0, 0, 0, 0], upper: false, isCore: true, scoreWeight: 0.8, targets: [{ muscle: 'Abs', effectiveness: 0.20 }],
  },
  'Dead Hang': {
    name: 'Dead Hang', rat: [0, 0, 0, 0, 0], upper: false, isCore: true, scoreWeight: 0.8, targets: [{ muscle: 'Forearms', effectiveness: 0.25 }],
  },
  // ── FOREARMS ──
  'Wrist Flexion & Extension Superset': {
    name: 'Wrist Flexion & Extension Superset', rat: [0.15, 0.30, 0.50, 0.85, 1.40], upper: true, scoreWeight: 0.7,
    targets: [{ muscle: 'Forearms', effectiveness: 1.0 }],
  },
};

// Core-move rep targets (performing this many reps/hold = ~50th percentile).
export const CORE_TARGETS: Record<string, number> = {
  'Cable Crunches': 25,
  'Oblique Side Switches': 30,
  'Floor Crunches / Hanging Knee Raises': 25,
  'Front Lever Progression': 5,
  'Dead Hang': 30,
};

// Time-based bodyweight-hold exercises, scored by held seconds (the logged
// "reps" value for these is really seconds). Percentile anchors:
//   <10s Untrained · 30s Intermediate · 60s Upper-Intermediate ·
//   90s Advanced · 120s Highly Advanced · 180s+ Legendary/Elite.
export const TIME_ANCHORS: Record<string, [number, number][]> = {
  'Dead Hang': [
    [10, 10],   // ~Beginner
    [30, 20],   // Novice
    [60, 40],   // Intermediate-ish
    [90, 60],   // Upper-Intermediate
    [120, 75],  // Advanced
    [180, 92],  // Highly Advanced → Legendary
  ],
};

// ─── Profile math (weight / height / age) ──────────────────
export function bodyMassIndex(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  if (h <= 0) return 22;
  return weightKg / (h * h);
}

// Age coefficient (powerlifting-derived). Under 40 = 1.0.
export function ageCoefficient(age: number): number {
  if (age < 40) return 1.0;
  if (age < 50) return 0.93;
  if (age < 60) return 0.82;
  if (age < 70) return 0.72;
  return 0.62;
}

// BMI leverage factor: taller/lower-BMI lifters have longer limbs, so a
// given ×bodyweight load is relatively harder on upper-body compression
// moves (presses/rows/curls). Higher BMI (more mass per height) → wider.
export function bmiLeverage(bmi: number, upper: boolean): number {
  const strength = upper ? 0.006 : 0.003;
  return 1 + strength * (bmi - 23);
}

export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  // Cap the rep bonus at 15 reps: beyond that a set is muscular endurance,
  // not max strength, and naive Epley extrapolation (e.g. 40-rep sets) would
  // inflate an estimated 1RM far past what the lifter could actually do.
  const eff = Math.min(reps, 15);
  return weightKg * (1 + eff / 30);
}

export interface BestLog {
  weightKg: number;
  reps: number;
  holdSeconds: number;
  e1RM: number;
  dateKey: string;
}

export function bestLogForExercise(
  workoutData: Record<string, Record<string, { exercises: ExerciseLog[] } | undefined>>,
  userId: UserId,
  exerciseName: string,
  _now: Date = new Date(),
): BestLog | null {
  // Lifetime lookup: consider the user's ALL-time training history (not just the
  // last 30 days) so muscles trained weeks/months ago still score and show on the
  // muscle heatmap. The `now` argument is kept for API compatibility but ignored.
  void _now; // eslint-disable-line no-unused-vars
  const userData = workoutData[userId] ?? {};
  let best: BestLog | null = null;

  for (const [dateKey, day] of Object.entries(userData)) {
    if (!day?.exercises) continue;

    for (const exercise of day.exercises) {
      if (exercise.exerciseName !== exerciseName) continue;
      for (const set of exercise.sets) {
        if (set.weightKg <= 0 && set.reps <= 0) continue;
        const std = EXERCISE_STANDARDS[exerciseName];
        const e1rm = std?.isCore ? set.reps : epley1RM(set.weightKg, set.reps);
        const candidate: BestLog = {
          weightKg: set.weightKg || 0,
          reps: set.reps || 0,
          holdSeconds: 0,
          e1RM: e1rm,
          dateKey,
        };
        if (!best || candidate.e1RM > best.e1RM) best = candidate;
      }
    }
  }
  return best;
}

// ─── Per-exercise percentile (0-100) ───────────────────────
// For loaded moves the lifter's bodyweight-ratio (e1RM ÷ bodyweight) is
// interpolated between the five real tier ratios (Beginner 5th / Novice
// 20th / Intermediate 50th / Advanced 80th / Elite 95th percentile).
// For bodyweight/core moves it is scaled by reps against a rep target.
export function exercisePercentile(
  exerciseName: string,
  best: BestLog | null,
  profile: AthleteProfile,
): number {
  const std = EXERCISE_STANDARDS[exerciseName];
  if (!std || !best) return 0;

  if (std.isCore) {
    // Bodyweight-hold exercises are scored by held TIME (seconds), not reps.
    const timeAnchors = TIME_ANCHORS[exerciseName];
    if (timeAnchors) {
      return Math.max(0, Math.min(100, interpolate(best.reps, timeAnchors)));
    }
    const target = CORE_TARGETS[exerciseName] ?? 1;
    const pct = (best.reps / target) * 50; // ~ target reps = 50th percentile
    return Math.max(0, Math.min(100, pct));
  }

  const e1rm = best.e1RM;
  if (e1rm <= 0 || profile.bodyWeightKg <= 0) return 0;
  const rel = e1rm / profile.bodyWeightKg;
  const bmi = bodyMassIndex(profile.bodyWeightKg, profile.heightCm);
  const leverage = bmiLeverage(bmi, std.upper);
  const age = ageCoefficient(profile.age);
  const adjusted = rel * leverage * age;

  // Anchor ratios -> percentile. Tier anchors map to the percentiles that
  // Strength Level uses for each label.
  const anchors: [number, number][] = [
    [std.rat[0], 5],   // Beginner
    [std.rat[1], 20],  // Novice
    [std.rat[2], 50],  // Intermediate
    [std.rat[3], 80],  // Advanced
    [std.rat[4], 95],  // Elite
  ];
  return Math.max(0, Math.min(100, interpolate(adjusted, anchors)));
}

// Piecewise-linear interpolation between (ratio -> percentile) anchor points.
export function interpolate(x: number, anchors: [number, number][]): number {
  if (x <= anchors[0][0]) {
    const [x0, y0] = anchors[0];
    const [x1, y1] = anchors[1];
    // Extrapolate below the first anchor using the first segment slope.
    if (x1 - x0 === 0) return y0;
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  for (let i = 1; i < anchors.length; i++) {
    const [xa, ya] = anchors[i - 1];
    const [xb, yb] = anchors[i];
    if (x <= xb) {
      if (xb - xa === 0) return ya;
      return ya + ((x - xa) / (xb - xa)) * (yb - ya);
    }
  }
  // Above the last anchor, extrapolate using the final segment slope.
  const [xN1, yN1] = anchors[anchors.length - 2];
  const [xN, yN] = anchors[anchors.length - 1];
  if (xN - xN1 === 0) return yN;
  return yN + ((x - xN) / (xN - xN1)) * (yN - yN1);
}

// Resolve a percentile to a TierInfo (unified 7-tier palette).
export function tierFromPercentileInfo(pct: number): TierInfo {
  const t = tierFromPercentile(pct);
  return SCIENTIFIC_TIERS[Math.max(0, Math.min(t.level, SCIENTIFIC_TIERS.length - 1))];
}

// ─── Inverse interpolation (percentile -> anchor value) ───
// Mirror of interpolate(): given a percentile, recover the ratio/reps/seconds
// that sits at that percentile on the same anchor curve.
export function invertInterpolate(y: number, anchors: [number, number][]): number {
  // Sort anchors by their y (percentile) so segments are contiguous.
  const sorted = [...anchors].sort((a, b) => a[1] - b[1]);
  const yMin = sorted[0][1];
  const yMax = sorted[sorted.length - 1][1];
  if (y <= yMin) {
    const [x0, y0] = sorted[0];
    const [x1, y1] = sorted[1] ?? sorted[0];
    if (y1 - y0 === 0) return x0;
    return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
  }
  if (y >= yMax) {
    const [x0, y0] = sorted[sorted.length - 2] ?? sorted[0];
    const [x1, y1] = sorted[sorted.length - 1];
    if (y1 - y0 === 0) return x1;
    return x1 + ((y - y1) / (y1 - y0)) * (x1 - x0);
  }
  for (let i = 1; i < sorted.length; i++) {
    const [xa, ya] = sorted[i - 1];
    const [xb, yb] = sorted[i];
    if (y <= yb) {
      if (yb - ya === 0) return xb;
      return xa + ((y - ya) / (yb - ya)) * (xb - xa);
    }
  }
  return sorted[sorted.length - 1][0];
}

// ============================================================
// FINE-GRAINED MUSCLE STRENGTH ENGINE
// ------------------------------------------------------------
// Each fine muscle is the specific muscle (or head) a lift actually
// trains. Every exercise carries an EMG-informed activation table:
//   primary = the movement is the muscle's own strength test
//             (e.g. Spider Curl → Biceps, Reverse Fly → Rear Delts)
//   assist  = the muscle is a real but secondary mover in a compound
//             (e.g. Overhead Press → Side Delts, Rows → Lats)
// A fine muscle's strength percentile = activation-weighted average of
// the *population percentiles* of every logged lift that hits it (same
// difficulty & bodyweight normalization as the coarse composites).
// Muscles reached only as an assist (no dedicated lift) score off the
// compound but are flagged `indirect` so they read honestly.
// ============================================================

export type FineMuscle =
  | 'Chest' | 'Front Delts' | 'Side Delts' | 'Rear Delts'
  | 'Lats' | 'Mid-Back' | 'Traps'
  | 'Abs' | 'Obliques'
  | 'Quads' | 'Glutes' | 'Hamstrings' | 'Calves' | 'Adductors'
  | 'Biceps' | 'Triceps' | 'Forearms';

export interface FineTarget {
  muscle: FineMuscle;
  // Fraction of the exercise's effect attributable to this muscle (sums to 1).
  share: number;
  role: 'primary' | 'assist';
}

// Display/region grouping for UI legends.
export const FINE_REGION: Record<FineMuscle, string> = {
  'Chest': 'Push', 'Front Delts': 'Push', 'Side Delts': 'Push', 'Rear Delts': 'Pull',
  'Lats': 'Pull', 'Mid-Back': 'Pull', 'Traps': 'Pull',
  'Abs': 'Core', 'Obliques': 'Core',
  'Quads': 'Legs', 'Glutes': 'Legs', 'Hamstrings': 'Legs', 'Calves': 'Legs', 'Adductors': 'Legs',
  'Biceps': 'Pull', 'Triceps': 'Push', 'Forearms': 'Pull',
};

export const ALL_FINE_MUSCLES: FineMuscle[] = [
  'Chest', 'Front Delts', 'Side Delts', 'Rear Delts', 'Lats', 'Mid-Back', 'Traps',
  'Abs', 'Obliques', 'Quads', 'Glutes', 'Hamstrings', 'Calves', 'Adductors',
  'Biceps', 'Triceps', 'Forearms',
];

// EMG-informed activation table per exercise. Shares sum to ≈1 per exercise.
// `primary` marks the muscle the movement most specifically tests.
export const FINE_TARGETS: Record<string, FineTarget[]> = {
  // ── CHEST ──
  // Pressing is upper-chest dominant. The incline angle shifts almost all of
  // the pec work to the upper (clavicular) chest; the front delts assist but
  // are NOT trained "by the same weight" as the chest, and triceps only finish
  // the lockout. So incline/machine press sets credit Chest with the large
  // majority share and only a small shoulder/triceps assist — a 40 kg incline
  // press must never look like 40 kg of shoulder training.
  'Incline Chest Press': [
    { muscle: 'Chest', share: 0.65, role: 'primary' },
    { muscle: 'Front Delts', share: 0.15, role: 'assist' },
    { muscle: 'Triceps', share: 0.20, role: 'assist' },
  ],
  'Yellow Machine Chest Press': [
    { muscle: 'Chest', share: 0.60, role: 'primary' },
    { muscle: 'Front Delts', share: 0.10, role: 'assist' },
    { muscle: 'Triceps', share: 0.30, role: 'assist' },
  ],
  'Cable Fly': [
    { muscle: 'Chest', share: 0.88, role: 'primary' },
    { muscle: 'Front Delts', share: 0.12, role: 'assist' },
  ],
  'Cable Fly 55 Degree': [
    { muscle: 'Chest', share: 0.82, role: 'primary' },
    { muscle: 'Front Delts', share: 0.18, role: 'assist' },
  ],
  'Lower Chest Cable Pulldown': [
    { muscle: 'Chest', share: 0.85, role: 'primary' },
    { muscle: 'Front Delts', share: 0.10, role: 'assist' },
    { muscle: 'Triceps', share: 0.05, role: 'assist' },
  ],
  // ── SHOULDERS ──
  'Overhead Press': [
    { muscle: 'Front Delts', share: 0.50, role: 'primary' },
    { muscle: 'Triceps', share: 0.35, role: 'assist' },
    { muscle: 'Side Delts', share: 0.15, role: 'assist' },
  ],
  'Lateral Raise': [
    { muscle: 'Side Delts', share: 0.85, role: 'primary' },
    { muscle: 'Traps', share: 0.15, role: 'assist' },
  ],
  'Bent-Over Dumbbell Reverse Fly': [
    { muscle: 'Rear Delts', share: 0.60, role: 'primary' },
    { muscle: 'Traps', share: 0.25, role: 'assist' },
    { muscle: 'Mid-Back', share: 0.15, role: 'assist' },
  ],
  'Face Pulls': [
    { muscle: 'Rear Delts', share: 0.50, role: 'primary' },
    { muscle: 'Traps', share: 0.30, role: 'assist' },
    { muscle: 'Mid-Back', share: 0.20, role: 'assist' },
  ],
  'Archer Pull': [
    { muscle: 'Mid-Back', share: 0.40, role: 'primary' },
    { muscle: 'Rear Delts', share: 0.30, role: 'assist' },
    { muscle: 'Lats', share: 0.20, role: 'assist' },
    { muscle: 'Biceps', share: 0.10, role: 'assist' },
  ],
  // ── BACK ──
  'Lat Pulldown': [
    { muscle: 'Lats', share: 0.70, role: 'primary' },
    { muscle: 'Biceps', share: 0.20, role: 'assist' },
    { muscle: 'Mid-Back', share: 0.10, role: 'assist' },
  ],
  'Pull Down': [
    { muscle: 'Lats', share: 0.70, role: 'primary' },
    { muscle: 'Biceps', share: 0.20, role: 'assist' },
    { muscle: 'Mid-Back', share: 0.10, role: 'assist' },
  ],
  '1-Hand Lat Pulldown': [
    { muscle: 'Lats', share: 0.65, role: 'primary' },
    { muscle: 'Biceps', share: 0.20, role: 'assist' },
    { muscle: 'Mid-Back', share: 0.15, role: 'assist' },
  ],
  'Pull Up': [
    { muscle: 'Lats', share: 0.70, role: 'primary' },
    { muscle: 'Biceps', share: 0.25, role: 'assist' },
    { muscle: 'Mid-Back', share: 0.05, role: 'assist' },
  ],
  'Row Machine 2 Var 2': [
    { muscle: 'Mid-Back', share: 0.40, role: 'primary' },
    { muscle: 'Lats', share: 0.30, role: 'assist' },
    { muscle: 'Rear Delts', share: 0.15, role: 'assist' },
    { muscle: 'Biceps', share: 0.15, role: 'assist' },
  ],
  'Row Machine 1 Var 2': [
    { muscle: 'Mid-Back', share: 0.45, role: 'primary' },
    { muscle: 'Lats', share: 0.25, role: 'assist' },
    { muscle: 'Rear Delts', share: 0.20, role: 'assist' },
    { muscle: 'Biceps', share: 0.10, role: 'assist' },
  ],
  'Dead Hang': [
    { muscle: 'Forearms', share: 0.70, role: 'primary' },
    { muscle: 'Lats', share: 0.20, role: 'assist' },
    { muscle: 'Traps', share: 0.10, role: 'assist' },
  ],
  // ── LEGS ──
  'Low-Foot Placement Leg Press': [
    { muscle: 'Quads', share: 0.60, role: 'primary' },
    { muscle: 'Glutes', share: 0.25, role: 'assist' },
    { muscle: 'Hamstrings', share: 0.15, role: 'assist' },
  ],
  'Low-Foot Leg Press': [
    { muscle: 'Quads', share: 0.60, role: 'primary' },
    { muscle: 'Glutes', share: 0.25, role: 'assist' },
    { muscle: 'Hamstrings', share: 0.15, role: 'assist' },
  ],
  'Leg Press': [
    { muscle: 'Quads', share: 0.60, role: 'primary' },
    { muscle: 'Glutes', share: 0.25, role: 'assist' },
    { muscle: 'Hamstrings', share: 0.15, role: 'assist' },
  ],
  'Leg Extension': [
    { muscle: 'Quads', share: 0.95, role: 'primary' },
    { muscle: 'Glutes', share: 0.05, role: 'assist' },
  ],
  'Hamstring Curl': [
    { muscle: 'Hamstrings', share: 0.90, role: 'primary' },
    { muscle: 'Calves', share: 0.10, role: 'assist' },
  ],
  'Leg Curl': [
    { muscle: 'Hamstrings', share: 0.90, role: 'primary' },
    { muscle: 'Calves', share: 0.10, role: 'assist' },
  ],
  'Adduction Machine': [
    { muscle: 'Adductors', share: 0.95, role: 'primary' },
    { muscle: 'Quads', share: 0.05, role: 'assist' },
  ],
  // Legacy name for the same machine.
  'Abduction Machine': [
    { muscle: 'Adductors', share: 0.95, role: 'primary' },
    { muscle: 'Quads', share: 0.05, role: 'assist' },
  ],
  'Calf Raise': [{ muscle: 'Calves', share: 1.0, role: 'primary' }],
  'Standing Calf Raise': [{ muscle: 'Calves', share: 1.0, role: 'primary' }],
  // ── ARMS ──
  'Spider Curl': [
    { muscle: 'Biceps', share: 0.80, role: 'primary' },
    { muscle: 'Forearms', share: 0.20, role: 'assist' },
  ],
  'Biceps Curl / Cable Curl': [
    { muscle: 'Biceps', share: 0.75, role: 'primary' },
    { muscle: 'Forearms', share: 0.25, role: 'assist' },
  ],
  'Triceps Push Down': [
    { muscle: 'Triceps', share: 0.90, role: 'primary' },
    { muscle: 'Forearms', share: 0.10, role: 'assist' },
  ],
  'Triceps Overhead Extension': [
    { muscle: 'Triceps', share: 0.90, role: 'primary' },
    { muscle: 'Forearms', share: 0.10, role: 'assist' },
  ],
  'Wrist Flexion & Extension Superset': [{ muscle: 'Forearms', share: 1.0, role: 'primary' }],
  // ── CORE ──
  'Cable Crunches': [
    { muscle: 'Abs', share: 0.80, role: 'primary' },
    { muscle: 'Obliques', share: 0.20, role: 'assist' },
  ],
  'Floor Crunches / Hanging Knee Raises': [
    { muscle: 'Abs', share: 0.85, role: 'primary' },
    { muscle: 'Obliques', share: 0.15, role: 'assist' },
  ],
  'Oblique Side Switches': [
    { muscle: 'Obliques', share: 0.70, role: 'primary' },
    { muscle: 'Abs', share: 0.30, role: 'assist' },
  ],
  'Front Lever Progression': [
    { muscle: 'Abs', share: 0.55, role: 'primary' },
    { muscle: 'Lats', share: 0.30, role: 'assist' },
    { muscle: 'Forearms', share: 0.15, role: 'assist' },
  ],
};

// Tier boundaries by percentile (same ladder as TIER_PERCENTILES).
export const FINE_TIER_BOUNDARIES: { level: number; name: string; percentile: number }[] =
  TIER_PERCENTILES.map((t) => ({ level: t.level, name: t.name, percentile: t.percentile }));

// Next stage info + a concrete "how to get there" suggestion per fine muscle.
export interface NextStageInfo {
  nextTierName: string;      // e.g. 'Intermediate'
  boundaryPercentile: number; // percentile needed to reach that tier
  gap: number;                // percentile points still needed (0-100 scale)
  suggestion: string;         // human-readable "add ~X kg / +Y reps / hold Zs on <lift>"
}

export interface FineMuscleScore {
  muscle: FineMuscle;
  region: string;
  score: number;          // 0-100 population percentile
  tier: TierInfo;
  indirect: boolean;      // only reached as an assist (no dedicated lift logged)
  hasData: boolean;
  // Top contribution for this muscle (lift + best set) — the "how to improve" anchor.
  topExercise?: string;
  topLoad?: number;
  topReps?: number;
  next?: NextStageInfo;   // absent at Elite tier
}

// Weighted percentile of every lift that hits a fine muscle.
export function computeFineMuscleScores(
  workoutData: Record<string, Record<string, { exercises: ExerciseLog[] } | undefined>>,
  userId: UserId,
  profile: AthleteProfile,
  now: Date = new Date(),
): FineMuscleScore[] {
  // 1. Collect per-exercise best logs + percentiles once.
  const pctByExercise = new Map<string, { pct: number; best: BestLog }>();
  for (const exerciseName of Object.keys(EXERCISE_STANDARDS)) {
    const best = bestLogForExercise(workoutData, userId, exerciseName, now);
    if (!best) continue;
    const pct = exercisePercentile(exerciseName, best, profile);
    if (pct > 0) pctByExercise.set(exerciseName, { pct, best });
  }

  // 2. Accumulate activation-weighted percentiles per fine muscle.
  const acc = new Map<FineMuscle, { total: number; weight: number; primaryWeight: number; top: { ex: string; credit: number } | null }>();
  const ensure = (m: FineMuscle) => {
    if (!acc.has(m)) acc.set(m, { total: 0, weight: 0, primaryWeight: 0, top: null });
    return acc.get(m)!;
  };

  for (const [exerciseName, entry] of pctByExercise.entries()) {
    const fine = FINE_TARGETS[exerciseName];
    if (!fine) continue;
    const std = EXERCISE_STANDARDS[exerciseName];
    const blend = std?.scoreWeight ?? 1.0;
    for (const t of fine) {
      const e = ensure(t.muscle);
      const credit = t.share * blend;
      e.total += entry.pct * credit;
      e.weight += credit;
      if (t.role === 'primary') e.primaryWeight += credit;
      if (!e.top || credit > e.top.credit) e.top = { ex: exerciseName, credit };
    }
  }

  // 3. Build per-muscle results in display order.
  const results: FineMuscleScore[] = ALL_FINE_MUSCLES.map((muscle) => {
    const e = acc.get(muscle);
    const hasData = !!e && e.weight > 0;
    const score = hasData ? e!.total / e!.weight : 0;
    const indirect = hasData ? e!.primaryWeight === 0 : true;
    const tier = tierFromPercentileInfo(score);

    let next: NextStageInfo | undefined;
    let topExercise: string | undefined;
    let topLoad: number | undefined;
    let topReps: number | undefined;
    if (hasData && score < 95) {
      // Next tier = first boundary strictly above the current score.
      const nxt = FINE_TIER_BOUNDARIES.find((b) => b.percentile > score);
      if (nxt) {
        const gap = Math.max(0, nxt.percentile - score);
        next = {
          nextTierName: nxt.name,
          boundaryPercentile: nxt.percentile,
          gap,
          suggestion: '',
        };
      }
      // Concrete suggestion from the muscle's top lift (best set already known).
      const top = e!.top;
      if (top) {
        const entry = pctByExercise.get(top.ex);
        const std = EXERCISE_STANDARDS[top.ex];
        if (entry && std) {
          topExercise = top.ex;
          topLoad = entry.best.weightKg;
          topReps = entry.best.reps;
          next!.suggestion = buildNextSuggestion(top.ex, entry.pct, entry.best, profile, nxt!.percentile);
        }
      }
    }

    return {
      muscle,
      region: FINE_REGION[muscle],
      score: Math.round(score * 10) / 10,
      tier,
      indirect,
      hasData,
      topExercise,
      topLoad,
      topReps,
      next,
    };
  });

  return results;
}

// Build the human suggestion: what load/reps/hold-time on the top lift would
// put *that lift* at the next tier's percentile (approximation — assumes the
// rest of the muscle's lifts stay put).
function buildNextSuggestion(
  exerciseName: string,
  _currentPct: number,
  best: BestLog,
  profile: AthleteProfile,
  targetPercentile: number,
): string {
  const std = EXERCISE_STANDARDS[exerciseName];
  if (!std) return '';
  const round = (n: number, step = 2.5) => Math.round(n / step) * step;

  // Time-based holds (Dead Hang): suggest a hold duration.
  const timeAnchors = TIME_ANCHORS[exerciseName];
  if (timeAnchors) {
    const targetSec = Math.max(0, Math.round(invertInterpolate(targetPercentile, timeAnchors.map((a) => [a[0], a[1]] as [number, number]))));
    const cur = best.reps || 0;
    if (targetSec <= cur) return `keep pushing your Dead Hang past ${cur}s (target ~${Math.max(cur + 5, targetSec)}s)`;
    return `hold ~${targetSec}s on ${exerciseName} (now ${cur}s)`;
  }

  // Rep-target core moves (crunches / obliques / front lever).
  if (std.isCore) {
    const targetReps = CORE_TARGETS[exerciseName] ?? 1;
    const needed = Math.max(0, Math.round((targetPercentile / 50) * targetReps));
    const cur = best.reps || 0;
    if (needed <= cur) return `keep pushing ${exerciseName} past ${cur} reps`;
    return `hit ~${needed} reps on ${exerciseName} (now ${cur})`;
  }

  // Loaded lift: recover the ratio that maps to the target percentile.
  if (best.e1RM <= 0 || profile.bodyWeightKg <= 0) return '';
  const anchors: [number, number][] = [
    [std.rat[0], 5],   // Beginner
    [std.rat[1], 20],  // Novice
    [std.rat[2], 50],  // Intermediate
    [std.rat[3], 80],  // Advanced
    [std.rat[4], 95],  // Elite
  ];
  const targetAdjusted = invertInterpolate(targetPercentile, anchors);
  const bmi = bodyMassIndex(profile.bodyWeightKg, profile.heightCm);
  const leverage = bmiLeverage(bmi, std.upper);
  const age = ageCoefficient(profile.age);
  const rel = targetAdjusted / (leverage * age);
  const targetE1RM = rel * profile.bodyWeightKg;
  const reps = Math.max(1, best.reps || 8);
  const targetLoad = targetE1RM / (1 + reps / 30);
  const cur = best.weightKg || 0;
  if (targetLoad <= cur) return `keep pushing ${exerciseName} past ${cur}kg × ${reps}`;
  const bump = Math.max(2.5, round(targetLoad - cur));
  const roundedTarget = round(targetLoad);
  return `add ~${bump}kg → ${Math.max(0, roundedTarget)}kg × ${reps} on ${exerciseName} (now ${cur}kg × ${reps})`;
}

// ─── Composite muscle score (weighted, includes every exercise) ──
export interface MuscleScoreResult {
  muscle: MuscleGroup;
  score: number; // 0-100
  tier: TierInfo;
  contributions: {
    exercise: string;
    pct: number;
    effectiveness: number;
    bestLoad: number;
    bestReps: number;
    e1RM: number;
  }[];
}

export function computeMuscleScores(
  workoutData: Record<string, Record<string, { exercises: ExerciseLog[] } | undefined>>,
  userId: UserId,
  profile: AthleteProfile,
  now: Date = new Date(),
): MuscleScoreResult[] {
  const acc = new Map<MuscleGroup, { total: number; weight: number; contributions: MuscleScoreResult['contributions'] }>();
  const addTo = (muscle: MuscleGroup, pct: number, effectiveness: number, blendWeight: number, item: Omit<MuscleScoreResult['contributions'][number], 'pct' | 'effectiveness'>) => {
    const eff = effectiveness * blendWeight;
    const e = acc.get(muscle) ?? { total: 0, weight: 0, contributions: [] };
    e.total += pct * eff;
    e.weight += eff;
    e.contributions.push({ ...item, pct, effectiveness });
    acc.set(muscle, e);
  };

  for (const [exerciseName, std] of Object.entries(EXERCISE_STANDARDS)) {
    const best = bestLogForExercise(workoutData, userId, exerciseName, now);
    if (!best) continue; // only performed exercises factor in (no dilution)
    const pct = exercisePercentile(exerciseName, best, profile);
    // Blend weight: compound 1.0, machine isolation 0.7, endurance 0.8.
    const blend = std.scoreWeight ?? 1.0;
    for (const t of std.targets) {
      addTo(t.muscle, pct, t.effectiveness, blend, {
        exercise: exerciseName,
        bestLoad: best.weightKg,
        bestReps: best.reps,
        e1RM: best.e1RM,
      });
    }
  }

  const order: MuscleGroup[] = [
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Hamstrings',
    'Calves', 'Abs', 'Core', 'Forearms', 'Abductors', 'Adductors',
  ];

  return order.map((muscle) => {
    const e = acc.get(muscle);
    const score = e && e.weight > 0 ? e.total / e.weight : 0;
    return {
      muscle,
      score: Math.round(score * 10) / 10,
      tier: tierFromPercentileInfo(score),
      contributions: e?.contributions ?? [],
    };
  });
}
