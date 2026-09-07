import type { ExerciseLog, UserId } from '../types';
import type { MuscleGroup, TierInfo } from './ranking';

// ============================================================
// AUTOMATED STRENGTH TIER CALCULATION ENGINE
// Scientific Specification Document ("the paper")
// ------------------------------------------------------------
// Pipeline (per logged set):
//   Effective_Load = Actual_Load × Correction_Factor
//   e1RM           = Reps^0.10 × Effective_Load
//   Scaled         = e1RM / BodyWeight^0.67
//   Z              = (Scaled − μ) / σ          [age/sex-adjusted norms]
//   Tier           = mapZToTier(Z)             [7-tier framework w/ overlap]
// Overall daily tier = median Z across compound lifts.
// ============================================================

// ─── Section 6: Normative Database (males 18–24) ───────────
export interface NormRow {
  mean: number;
  sd: number;
}

export const NORMATIVE_DB: Record<string, NormRow> = {
  'Bench Press': { mean: 5.20, sd: 0.80 },
  'Overhead Press': { mean: 3.80, sd: 0.60 },
  'Squat': { mean: 6.50, sd: 1.00 },
  'Deadlift': { mean: 6.00, sd: 0.90 },
  'Lat Pulldown': { mean: 4.50, sd: 0.70 },
  'Isolation': { mean: 2.80, sd: 0.50 },
};

// ─── Section 4: the compound lifts used for the overall score ──
export const COMPOUND_LIFTS = [
  'Bench Press',
  'Overhead Press',
  'Squat',
  'Deadlift',
  'Lat Pulldown',
] as const;

export type CompoundLift = (typeof COMPOUND_LIFTS)[number];

// ─── Section 2: exercise classification & correction matrix ──
export interface LiftMapping {
  lift: string;          // core lift key in NORMATIVE_DB
  factor: number;        // machine correction factor
  compound: boolean;     // included in overall median Z
  isCore?: boolean;      // raw comparison within same exercise only (false)
}

const M = (lift: string, factor: number, compound: boolean): LiftMapping => ({ lift, factor, compound });

export const EXERCISE_TO_LIFT: Record<string, LiftMapping> = {
  // Bench Press family
  'Incline Chest Press': M('Bench Press', 1.0, true),
  'Yellow Machine Chest Press': M('Bench Press', 0.85, true),
  'Cable Fly': M('Bench Press', 0.7, true),
  'Cable Fly 55 Degree': M('Bench Press', 0.7, true),
  'Lower Chest Cable Pulldown': M('Bench Press', 0.7, true),
  // Overhead Press
  'Overhead Press': M('Overhead Press', 1.0, true),
  // Lat Pulldown / Pull-up family
  'Lat Pulldown': M('Lat Pulldown', 1.0, true),
  'Pull Down': M('Lat Pulldown', 1.0, true),
  '1-Hand Lat Pulldown': M('Lat Pulldown', 0.95, true),
  'Pull Up': M('Lat Pulldown', 1.0, true),
  // Row / Deadlift family
  'Row Machine 2 Var 2': M('Deadlift', 0.9, true),
  'Row Machine 1 Var 2': M('Deadlift', 0.9, true),
  'Archer Pull': M('Deadlift', 1.0, true),
  'Bent-Over Dumbbell Reverse Fly': M('Deadlift', 0.9, true),
  'Face Pulls': M('Deadlift', 1.0, true),
  // Squat family (leg press → squat proxy)
  'Low-Foot Placement Leg Press': M('Squat', 0.6, true),
  'Low-Foot Leg Press': M('Squat', 0.6, true),
  // Isolation (raw, compare within same exercise only; not primary tier)
  'Leg Extension': M('Isolation', 1.0, false),
  'Hamstring Curl': M('Isolation', 1.0, false),
  'Triceps Push Down': M('Isolation', 1.0, false),
  'Triceps Overhead Extension': M('Isolation', 1.0, false),
  'Spider Curl': M('Isolation', 1.0, false),
  'Biceps Curl / Cable Curl': M('Isolation', 1.0, false),
  'Wrist Flexion & Extension Superset': M('Isolation', 1.0, false),
  'Adduction Machine': M('Isolation', 1.0, false),
  'Abduction Machine': M('Isolation', 1.0, false),
  'Calf Raise': M('Isolation', 1.0, false),
  'Standing Calf Raise': M('Isolation', 1.0, false),
  'Cable Crunches': M('Isolation', 1.0, false),
  'Oblique Side Switches': M('Isolation', 1.0, false),
  'Floor Crunches / Hanging Knee Raises': M('Isolation', 1.0, false),
  'Front Lever Progression': M('Isolation', 1.0, false),
  'Dead Hang': M('Isolation', 1.0, false),
};

// ─── Map each supported core lift to the muscle groups it colors ──
// Pressing (bench/incline family) is Chest-dominant: the front delts only
// assist, so bench-press weight never colors Shoulders — shoulders are ranked
// by their own overhead-press / rear-delt work instead.
export const LIFT_TO_MUSCLES: Record<string, MuscleGroup[]> = {
  'Bench Press': ['Chest', 'Triceps'],
  'Overhead Press': ['Shoulders', 'Triceps'],
  'Lat Pulldown': ['Back', 'Biceps'],
  'Deadlift': ['Back', 'Shoulders', 'Forearms'],
  'Squat': ['Legs', 'Hamstrings', 'Calves', 'Abductors', 'Adductors'],
  'Isolation': [],
};

// ─── Section 5: 7-tier framework with overlapping boundaries ──
export const Z_TIERS: {
  name: string;
  level: number;
  // Inclusive overlap boundaries. `minZ` = lowest Z that can map here
  // and higher boundaries win when a value is in the overlap zone.
  minZ: number;
}[] = [
  { name: 'Untrained', level: 0, minZ: -Infinity },
  { name: 'Beginner', level: 1, minZ: -1.5 },
  { name: 'Intermediate', level: 2, minZ: -0.5 },
  { name: 'Upper-Intermediate', level: 3, minZ: 0.5 },
  { name: 'Advanced', level: 4, minZ: 1.3 },
  { name: 'Highly Advanced', level: 5, minZ: 2.1 },
  { name: 'Legendary / Elite', level: 6, minZ: 2.9 },
];

// The overlap rule: assign the HIGHER tier when a Z-score is in the
// grey zone between two overlapping bands. We use ascending boundaries.
export function mapZToTier(z: number): { name: string; level: number } {
  for (let i = Z_TIERS.length - 1; i >= 0; i--) {
    if (z >= Z_TIERS[i].minZ) return { name: Z_TIERS[i].name, level: Z_TIERS[i].level };
  }
  return { name: Z_TIERS[0].name, level: Z_TIERS[0].level };
}

// Resolve a tier level to the unified TierInfo (color, glow, name).
export function tierInfoForLevel(level: number): TierInfo {
  return SCIENTIFIC_TIERS[Math.max(0, Math.min(level, SCIENTIFIC_TIERS.length - 1))];
}

// Resolve a Z-score straight to a TierInfo using the overlap rule.
export function tierFromZ(z: number): TierInfo {
  return tierInfoForLevel(mapZToTier(z).level);
}

// The Unified 7-tier list with colors, used across the whole UI.
// `RANK_TIERS` in ranking.ts is built from here so the tier names, levels
// and colors stay consistent everywhere (legends, 2D/3D maps, coach).
export const SCIENTIFIC_TIERS: TierInfo[] = [
  { name: 'Untrained',        level: 0, threshold: 0,    color: '#4b5563', cssGlow: 'none' },
  { name: 'Beginner',         level: 1, threshold: 1,    color: '#eab308', cssGlow: '0 0 12px rgba(234,179,8,0.3)' },
  { name: 'Intermediate',     level: 2, threshold: 2,    color: '#3b82f6', cssGlow: '0 0 14px rgba(59,130,246,0.35)' },
  { name: 'Upper-Intermediate', level: 3, threshold: 3,    color: '#22c55e', cssGlow: '0 0 14px rgba(34,197,94,0.35)' },
  { name: 'Advanced',         level: 4, threshold: 4,    color: '#7e22ce', cssGlow: '0 0 16px rgba(126,34,206,0.5)' },
  { name: 'Highly Advanced',  level: 5, threshold: 5,    color: '#f97316', cssGlow: '0 0 18px rgba(249,115,22,0.45)' },
  { name: 'Legendary / Elite', level: 6, threshold: 6,   color: '#ef4444', cssGlow: '0 0 22px rgba(239,68,68,0.55)' },
];

// ─── Athlete profile (age / body weight / height) ────────────
export interface AthleteProfile {
  age: number;
  bodyWeightKg: number;
  heightCm: number;
}

// Default profiles (Abel 62/174/19, Keneni 75/175/20).
export const DEFAULT_PROFILES: Record<UserId, AthleteProfile> = {
  abel: { age: 19, bodyWeightKg: 62, heightCm: 174 },
  keneni: { age: 20, bodyWeightKg: 75, heightCm: 175 },
};

// Merge a user's latest saved BodyMetrics over the default profile so the
// ranking engine uses live weight/height when present, else falls back.
export function resolveEffectiveProfile(
  defaults: AthleteProfile,
  metrics?: { weightKg?: number; heightCm?: number },
): AthleteProfile {
  const weight =
    metrics?.weightKg && metrics.weightKg > 0 ? metrics.weightKg : defaults.bodyWeightKg;
  const height =
    metrics?.heightCm && metrics.heightCm > 0 ? metrics.heightCm : defaults.heightCm;
  return { age: defaults.age, bodyWeightKg: weight, heightCm: height };
}

// Age/sex-adjusted norms (Section 3, Step 3).
export function getNormRow(lift: string, profile: AthleteProfile): NormRow {
  const base = NORMATIVE_DB[lift] ?? NORMATIVE_DB['Isolation'];
  let sd = base.sd;
  if (profile.age >= 25 && profile.age <= 44) sd = base.sd * 1.05;
  if (profile.age > 44) {
    const penalty = 1 - 0.005 * (profile.age - 44);
    return { mean: base.mean * penalty, sd: base.sd };
  }
  return { mean: base.mean, sd };
}

// ─── Step 1: 1RM estimate ────────────────────────────
export function estimate1RM(load: number, reps: number): number {
  if (load <= 0 || reps <= 0) return 0;
  return Math.pow(reps, 0.10) * load;
}

// ─── Step 2: allometric scaling (BW^0.67) ─────────────
export function allometricScale(e1rm: number, bodyWeightKg: number): number {
  if (e1rm <= 0 || bodyWeightKg <= 0) return 0;
  return e1rm / Math.pow(bodyWeightKg, 0.67);
}

// ─── Step 4: Z-score ──────────────────────────────────
export function calculateZ(scaled: number, mean: number, sd: number): number {
  if (sd <= 0) return 0;
  return (scaled - mean) / sd;
}

// ─── Per-lift result ──────────────────────────────────
export interface LiftResult {
  lift: string;
  bestLoad: number;
  bestReps: number;
  effectiveLoad: number;
  e1RM: number;
  scaled: number;
  z: number;
  tier: TierInfo;
  hasData: boolean;
}

// Compute the best e1RM for a single exercise across all logged sets.
function bestExerciseE1RM(exercise: ExerciseLog): { load: number; reps: number; e1rm: number } {
  let best = { load: 0, reps: 0, e1rm: 0 };
  for (const set of exercise.sets) {
    if (set.weightKg <= 0 || set.reps <= 0) continue;
    const e1rm = estimate1RM(set.weightKg, set.reps);
    if (e1rm > best.e1rm) best = { load: set.weightKg, reps: set.reps, e1rm };
  }
  return best;
}

// Compute per-lift results for a user over their full workout history.
export function computeLiftResults(
  workoutData: Record<string, Record<string, { exercises: ExerciseLog[] } | undefined>>,
  userId: UserId,
  profile: AthleteProfile,
): LiftResult[] {
  const liftsMap = new Map<string, { load: number; reps: number; e1rm: number }>();

  const userData = workoutData[userId] ?? {};
  for (const [, day] of Object.entries(userData)) {
    if (!day?.exercises) continue;
    for (const exercise of day.exercises) {
      const mapping = EXERCISE_TO_LIFT[exercise.exerciseName];
      if (!mapping) continue;
      const best = bestExerciseE1RM(exercise);
      if (best.e1rm <= 0) continue;
      // Apply the machine correction factor to the e1RM.
      const eff = best.e1rm * mapping.factor;
      const prev = liftsMap.get(mapping.lift);
      if (!prev || eff > prev.e1rm) {
        liftsMap.set(mapping.lift, { load: best.load, reps: best.reps, e1rm: eff });
      }
    }
  }

  const results: LiftResult[] = [];
  for (const [lift, best] of liftsMap.entries()) {
    const norm = getNormRow(lift, profile);
    const scaled = allometricScale(best.e1rm, profile.bodyWeightKg);
    const z = scaled > 0 ? calculateZ(scaled, norm.mean, norm.sd) : 0;
    results.push({
      lift,
      bestLoad: best.load,
      bestReps: best.reps,
      effectiveLoad: best.e1rm,
      e1RM: best.e1rm,
      scaled,
      z,
      tier: tierFromZ(z),
      hasData: best.e1rm > 0,
    });
  }

  results.sort((a, b) => b.z - a.z);
  return results;
}

// Overall tier = median Z across compound lifts only (Section 4).
export function computeOverallTier(
  liftResults: LiftResult[],
): { z: number; tierName: string; tierLevel: number } {
  const compound = liftResults.filter((r) => COMPOUND_LIFTS.includes(r.lift as CompoundLift));
  if (compound.length === 0) {
    return { z: 0, tierName: 'Untrained', tierLevel: 0 };
  }
  const zs = compound.map((r) => r.z).sort((a, b) => a - b);
  const mid = Math.floor(zs.length / 2);
  const median = zs.length % 2 === 1 ? zs[mid] : (zs[mid - 1] + zs[mid]) / 2;
  const tier = mapZToTier(median);
  return { z: median, tierName: tier.name, tierLevel: tier.level };
}

// Map an individual muscle group to the tier of its strongest mapped lift.
// Only compound lifts determine muscle tiers. Core-only muscles (Abs, Core)
// are excluded from the primary tier per the spec ("report separately as
// Core Index"). Isolation-only muscles without a compound match get
// "Untrained" — their data is reported in the session report table instead.
export function muscleTierFromLifts(
  muscle: MuscleGroup,
  liftResults: LiftResult[],
  _hasData: boolean,
): TierInfo {
  const matched = liftResults.filter((r) => (LIFT_TO_MUSCLES[r.lift] ?? []).includes(muscle));
  if (matched.length > 0) {
    matched.sort((a, b) => b.z - a.z);
    return matched[0].tier;
  }
  return SCIENTIFIC_TIERS[0];
}

// Compute the target e1RM needed to reach the next tier for a given lift.
// Returns null if already at max tier or no norm exists.
export function targetForNextTier(
  lift: string,
  currentZ: number,
  profile: AthleteProfile,
): { targetER1M: number; targetLoad: number; targetReps: number; tierName: string } | null {
  const currentTier = mapZToTier(currentZ);
  if (currentTier.level >= Z_TIERS[Z_TIERS.length - 1].level) return null;
  const nextMinZ = Z_TIERS[currentTier.level + 1]?.minZ;
  if (nextMinZ === undefined) return null;
  const norm = getNormRow(lift, profile);
  const targetScaled = norm.mean + nextMinZ * norm.sd;
  const targetER1M = targetScaled * Math.pow(profile.bodyWeightKg, 0.67);
  // Suggest a reasonable rep range (8 reps) for the target load.
  const targetLoad = Math.round(targetER1M / Math.pow(8, 0.10));
  return {
    targetER1M: Math.round(targetER1M * 10) / 10,
    targetLoad,
    targetReps: 8,
    tierName: Z_TIERS[currentTier.level + 1].name,
  };
}
