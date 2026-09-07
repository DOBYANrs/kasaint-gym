import type { ExerciseLog, ProgressData } from '../types';

// Epley formula: 1RM = Weight × (1 + Reps / 30)
export function calculate1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

// Best 1RM from all sets in an exercise
export function calculateExercise1RM(exercise: ExerciseLog): number {
  let best = 0;
  for (const set of exercise.sets) {
    if (set.weightKg > 0 && set.reps > 0) {
      const rm = calculate1RM(set.weightKg, set.reps);
      if (rm > best) best = rm;
    }
  }
  return best;
}

export function calculateVolume(exercise: ExerciseLog): number {
  return exercise.sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0);
}

export function calculateMaxWeight(exercise: ExerciseLog): number {
  if (exercise.sets.length === 0) return 0;
  return Math.max(...exercise.sets.map((s) => s.weightKg));
}

export function calculateTotalReps(exercise: ExerciseLog): number {
  return exercise.sets.reduce((sum, set) => sum + set.reps, 0);
}

export function calculateExerciseProgress(exercise: ExerciseLog): ProgressData {
  return {
    maxWeight: calculateMaxWeight(exercise),
    totalReps: calculateTotalReps(exercise),
    totalVolume: calculateVolume(exercise),
    dateKey: '',
  };
}

export function aggregateMuscleGroupVolume(
  exercises: ExerciseLog[],
  exerciseMuscleMap: Record<string, string[]>
): { muscleGroup: string; volume: number }[] {
  const volumeMap: Record<string, number> = {};

  for (const exercise of exercises) {
    const volume = calculateVolume(exercise);
    const groups = exerciseMuscleMap[exercise.exerciseName] ?? ['Other'];
    for (const group of groups) {
      volumeMap[group] = (volumeMap[group] ?? 0) + volume;
    }
  }

  return Object.entries(volumeMap)
    .map(([muscleGroup, volume]) => ({ muscleGroup, volume }))
    .sort((a, b) => b.volume - a.volume);
}

export const EXERCISE_MUSCLE_MAP: Record<string, string[]> = {
  // Monday: Chest + Back + Shoulders + Triceps + Biceps
  'Incline Chest Press': ['Chest', 'Shoulders'],
  'Cable Fly': ['Chest'],
  'Lat Pulldown': ['Back', 'Biceps'],
  'Overhead Press': ['Shoulders'],
  'Row Machine 2 Var 2': ['Back'],
  'Triceps Push Down': ['Triceps'],
  'Spider Curl': ['Biceps'],
  // Tuesday: Legs + Abs
  'Low-Foot Placement Leg Press': ['Quads', 'Legs', 'Hamstrings'],
  'Hamstring Curl': ['Hamstrings', 'Legs'],
  'Leg Extension': ['Quads', 'Legs'],
  'Calf Raise': ['Calves', 'Legs'],
  'Standing Calf Raise': ['Calves', 'Legs'],
  'Cable Crunches': ['Abs'],
  'Oblique Side Switches': ['Abs', 'Core'],
  // Thursday: Back + Shoulders + Core
  'Pull Down': ['Back', 'Biceps'],
  'Row Machine 1 Var 2': ['Back', 'Biceps'],
  '1-Hand Lat Pulldown': ['Back', 'Biceps'],
  'Archer Pull': ['Back', 'Biceps'],
  'Bent-Over Dumbbell Reverse Fly': ['Shoulders', 'Back'],
  'Face Pulls': ['Shoulders', 'Core'],
  'Front Lever Progression': ['Back', 'Core', 'Abs'],
  'Dead Hang': ['Back', 'Forearms'],
  // Friday: Legs + Abs (Abductors/Adductors focus)
  'Low-Foot Leg Press': ['Quads', 'Legs', 'Hamstrings'],
  'Adduction Machine': ['Adductors', 'Legs'],
  'Abduction Machine': ['Adductors', 'Legs'],
  'Floor Crunches / Hanging Knee Raises': ['Abs', 'Core'],
  // Saturday: Chest + Triceps + Biceps + Forearms
  'Yellow Machine Chest Press': ['Chest'],
  'Lower Chest Cable Pulldown': ['Chest'],
  'Cable Fly 55 Degree': ['Chest'],
  'Triceps Overhead Extension': ['Triceps'],
  'Biceps Curl / Cable Curl': ['Biceps', 'Forearms'],
  'Wrist Flexion & Extension Superset': ['Forearms'],
  // Legacy exercises
  'Bench Press': ['Chest', 'Shoulders'],
  'Incline Dumbbell Press': ['Chest', 'Shoulders'],
  'Incline Bench Press': ['Chest', 'Shoulders'],
  'Dumbbell Flyes': ['Chest'],
  'Push-Ups': ['Chest', 'Shoulders'],
  'Shoulder Press': ['Shoulders'],
  'Lateral Raises': ['Shoulders'],
  'Face Pull': ['Shoulders'],
  'Barbell Row': ['Back'],
  'T-Bar Row': ['Back'],
  'Pull Up': ['Back', 'Biceps'],
  'Pull-Ups': ['Back'],
  'Deadlift': ['Back', 'Legs'],
  'Barbell Curl': ['Biceps'],
  'Hammer Curl': ['Biceps', 'Forearms'],
  'Preacher Curl': ['Biceps'],
  'Tricep Pushdown': ['Triceps'],
  'Skull Crushers': ['Triceps'],
  'Overhead Tricep Extension': ['Triceps'],
  'Wrist Curl': ['Forearms'],
  'Squat': ['Legs'],
  'Romanian Deadlift': ['Legs', 'Back'],
  'Leg Press': ['Legs'],
  'Leg Curl': ['Legs'],
  'Calf Raises': ['Legs'],
};
