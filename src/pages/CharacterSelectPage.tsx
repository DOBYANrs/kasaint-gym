import { useState, useCallback, useMemo } from 'react';
import type { UserId } from '../types';
import { useUser } from '../context/UserContext';
import { useWorkout } from '../context/WorkoutContext';
import { useBody } from '../context/BodyContext';
import { storeUser } from '../components/UserSelector';
import CinematicIntro from '../components/intro/CinematicIntro';
import { calculateOverallUserRank, type MuscleRankResult } from '../utils/ranking';

type Phase = 'select' | 'intro' | 'done';

interface CharacterSelectPageProps {
  onSelect: (user: UserId) => void;
}

export default function CharacterSelectPage({ onSelect }: CharacterSelectPageProps) {
  const { setActiveUser } = useUser();
  const { workoutData } = useWorkout();
  const { getLatestProfile } = useBody();
  const [phase, setPhase] = useState<Phase>('select');
  const [selectedUser, setSelectedUser] = useState<UserId | null>(null);

  // Per-muscle rank tiers used to color the 3D anatomy
  const muscleRanks = useMemo<MuscleRankResult[]>(() => {
    if (!selectedUser) return [];
    return calculateOverallUserRank(workoutData, selectedUser, getLatestProfile(selectedUser)).muscleRanks;
  }, [workoutData, selectedUser, getLatestProfile]);

  const handleUserClick = useCallback((user: UserId) => {
    setSelectedUser(user);
    storeUser(user);
    setPhase('intro');
  }, []);

  const handleIntroComplete = useCallback(() => {
    if (selectedUser) {
      setActiveUser(selectedUser);
      onSelect(selectedUser);
    }
  }, [selectedUser, setActiveUser, onSelect]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: 'linear-gradient(180deg, #050508 0%, #0B0C10 40%, #14161D 100%)',
      }}
    >
      {/* Radial glow background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: phase === 'intro'
            ? 'radial-gradient(circle at 50% 50%, rgba(255,94,0,0.12), transparent 50%)'
            : 'radial-gradient(circle at 50% 35%, rgba(255,94,0,0.06), transparent 50%)',
          transition: 'background 1s ease',
        }}
      />

      {/* Phase: SELECT — Profile buttons */}
      {phase === 'select' && (
        <div className="relative z-10 w-full max-w-sm text-center">
          {/* Logo */}
          <div className="mb-10">
            <h1
              className="text-5xl font-black tracking-widest"
              style={{
                color: '#FF5E00',
                textShadow: '0 0 40px rgba(255,94,0,0.4), 0 0 80px rgba(255,94,0,0.15)',
              }}
            >
              KASAINT
            </h1>
            <div className="w-20 h-0.5 mx-auto mt-3 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #FF5E00, transparent)' }} />
            <p className="text-sm mt-3 tracking-[0.3em] uppercase" style={{ color: 'rgba(148,163,184,0.4)' }}>
              Gym Tracker
            </p>
          </div>

          <p className="text-base font-semibold mb-8 tracking-wide" style={{ color: 'rgba(226,232,240,0.8)' }}>
            Select your character
          </p>

          <div className="space-y-4">
            {/* Abel — Blue theme */}
            <button
              onClick={() => handleUserClick('abel')}
              className="w-full p-5 rounded-2xl text-left transition-all duration-500 group relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02))',
                border: '1px solid rgba(59,130,246,0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(59,130,246,0.2), inset 0 0 30px rgba(59,130,246,0.05)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.15)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl relative"
                  style={{ background: 'rgba(59,130,246,0.12)' }}
                >
                  🏋️
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ background: '#3B82F6', boxShadow: '0 0 8px #3B82F6' }} />
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold" style={{ color: '#f1f5f9' }}>Abel</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>
                    Begin training session
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:translate-x-1"
                  style={{ background: 'rgba(59,130,246,0.1)' }}
                >
                  <span style={{ color: '#60A5FA' }}>→</span>
                </div>
              </div>
            </button>

            {/* Keneni — Green theme */}
            <button
              onClick={() => handleUserClick('keneni')}
              className="w-full p-5 rounded-2xl text-left transition-all duration-500 group relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02))',
                border: '1px solid rgba(74,222,128,0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(74,222,128,0.5)';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(74,222,128,0.2), inset 0 0 30px rgba(74,222,128,0.05)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(74,222,128,0.15)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl relative"
                  style={{ background: 'rgba(74,222,128,0.12)' }}
                >
                  🏋️
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full" style={{ background: '#4ADE80', boxShadow: '0 0 8px #4ADE80' }} />
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold" style={{ color: '#f1f5f9' }}>Keneni</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>
                    Begin training session
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:translate-x-1"
                  style={{ background: 'rgba(74,222,128,0.1)' }}
                >
                  <span style={{ color: '#4ADE80' }}>→</span>
                </div>
              </div>
            </button>
          </div>

          <p className="text-xs mt-10" style={{ color: 'rgba(148,163,184,0.2)' }}>
            Switch characters anytime in the app
          </p>
        </div>
      )}

      {/* Phase: INTRO — 3D cinematic animation */}
      {phase === 'intro' && (
        <div className="relative z-10 w-full max-w-lg">
          {/* User name displayed during intro */}
          <div className="text-center mb-4">
            <h2
              className="text-2xl font-black tracking-widest uppercase"
              style={{
                color: selectedUser === 'abel' ? '#3B82F6' : '#4ADE80',
                textShadow: `0 0 30px ${selectedUser === 'abel' ? 'rgba(59,130,246,0.4)' : 'rgba(74,222,128,0.4)'}`,
              }}
            >
              {selectedUser === 'abel' ? 'ABEL' : 'KENENI'}
            </h2>
          </div>

          <CinematicIntro
            muscleRanks={muscleRanks}
            onComplete={handleIntroComplete}
            height={450}
          />
        </div>
      )}
    </div>
  );
}
