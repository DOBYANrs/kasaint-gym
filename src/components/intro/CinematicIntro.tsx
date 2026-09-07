import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { getDaySchedule } from '../../data/schedule';
import type { MuscleRankResult, MuscleGroup } from '../../utils/ranking';
import {
  applyRankColors,
  pulseMuscles,
  EXPOSURE,
} from '../../utils/muscleModel';

interface CinematicIntroProps {
  muscleRanks: MuscleRankResult[];
  onComplete: () => void;
  height?: number;
}

// Get today's workout type for choreography
function getDayType(): string {
  const now = new Date();
  const schedule = getDaySchedule(now);
  if (schedule.isRestDay) return 'rest';
  return schedule.dayOfWeek;
}

// The physically largest muscle trained on each day (headline of the plan).
// side: which side of the model to present before diving in.
const DAY_PRIMARY: Record<string, { mesh: string; label: string; side: 'front' | 'back' }> = {
  monday: { mesh: 'chest', label: 'Chest', side: 'front' },
  tuesday: { mesh: 'quads', label: 'Quads', side: 'front' },
  thursday: { mesh: 'lats', label: 'Back', side: 'back' },
  friday: { mesh: 'quads', label: 'Quads', side: 'front' },
  saturday: { mesh: 'chest', label: 'Chest', side: 'front' },
};

export default function CinematicIntro({
  muscleRanks,
  onComplete,
  height = 400,
}: CinematicIntroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<string>('loading');
  const [loadPercent, setLoadPercent] = useState(0);
  const [dayLabel, setDayLabel] = useState<string>('TRAINING');
  const cleanupRef = useRef<(() => void) | null>(null);

  const rankMapRef = useRef(new Map<MuscleGroup, MuscleRankResult>());
  useEffect(() => {
    const map = new Map<MuscleGroup, MuscleRankResult>();
    for (const r of muscleRanks) {
      map.set(r.muscle, r);
    }
    rankMapRef.current = map;
  }, [muscleRanks]);


  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const dayType = getDayType();

  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const w = container.clientWidth;
    const h = height;

    // ===== SCENE SETUP =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 0.3, 5);
    camera.lookAt(0, 0.3, 0);
    const focal = new THREE.Vector3(0, 0.3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050508, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    container.appendChild(renderer.domElement);

    // ===== LIGHTING =====
    const ambientLight = new THREE.AmbientLight(0xbfc8ff, 1.5);
    scene.add(ambientLight);

    const keyLight = new THREE.SpotLight(0xffe2b3, 6.0);
    keyLight.position.set(2, 5, 4);
    keyLight.angle = Math.PI / 5;
    keyLight.penumbra = 0.3;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88ccff, 1.3);
    fillLight.position.set(-3, 2, 2);
    scene.add(fillLight);

    const rimWarm = new THREE.DirectionalLight(0xff5e00, 1.4);
    rimWarm.position.set(-2, 2.5, -4);
    scene.add(rimWarm);

    const rimCool = new THREE.DirectionalLight(0x22d3ee, 1.1);
    rimCool.position.set(3, 1.5, -3);
    scene.add(rimCool);

    scene.fog = new THREE.FogExp2(0x050508, 0.06);

    // ===== PARTICLE FIELD =====
    const particleCount = 300;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 10;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      particleVelocities[i * 3] = (Math.random() - 0.5) * 0.003;
      particleVelocities[i * 3 + 1] = Math.random() * 0.005 + 0.001;
      particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xff5e00,
      size: 0.03,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(particleGeo, particleMat));

    // ===== LOAD MODEL =====
    const loader = new GLTFLoader();
    loader.load(
      '/kasaint-gym/muscle_anatomy.glb',
      (gltf) => {
        const model = gltf.scene;

        // The GLB's own node transforms already orient it upright (head = +Y)
        // with the front facing +Z, so no geometry reorientation is needed.

        // Center and scale
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.2 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y += 0.2;

        scene.add(model);

        // ===== COLOR EACH MUSCLE BY ITS RANK TIER (shared with 360 page) =====
        const muscleMats = applyRankColors(model, rankMapRef.current);

        setPhase('spin');

        // Determine today's biggest-muscle dive target
        const primary = DAY_PRIMARY[dayType];

        // Helper: world-space target (center + radius) for a named mesh
        const meshTarget = (name: string) => {
          const mesh = model.getObjectByName(name) as THREE.Mesh | undefined;
          if (!mesh) {
            const full = new THREE.Box3().setFromObject(model);
            return {
              center: full.getCenter(new THREE.Vector3()),
              radius: (0.5 * full.getSize(new THREE.Vector3()).length()) * 0.6,
            };
          }
          const b = new THREE.Box3().setFromObject(mesh);
          const c = b.getCenter(new THREE.Vector3());
          const r = 0.5 * b.getSize(new THREE.Vector3()).length() * 0.6;
          return { center: c, radius: Math.max(r, 0.12) };
        };

        const tl = gsap.timeline({
          onComplete: () => {
            setPhase('done');
            onCompleteRef.current();
          },
        });

        // === Phase 1: 360° spin showing every muscle group colored by rank ===
        tl.call(() => setDayLabel('YOUR PHYSIQUE'), [], 0);
        tl.to(ambientLight, { intensity: 2.2, duration: 2.5, ease: 'power2.inOut' }, 0);
        tl.to(keyLight, { intensity: 8.5, duration: 2.5, ease: 'power2.inOut' }, 0);
        tl.to(model.rotation, { y: Math.PI * 2, duration: 2.5, ease: 'power2.inOut' }, 0);
        tl.fromTo(camera.position, { z: 5, y: 0.3 }, { z: 3.6, y: 0.15, duration: 2.5, ease: 'power2.inOut' }, 0);

        if (primary) {
          // === Phase 2: rotate to present the working side (2.5s → 3.5s) ===
          const targetEnd = primary.side === 'back' ? Math.PI * 3 : Math.PI * 2;
          setDayLabel(primary.label.toUpperCase());
          tl.to(model.rotation, { y: targetEnd, duration: 1.0, ease: 'power2.inOut' }, 2.5);

          // Measure the dive target with the model at its final presentation
          // rotation, so back-side muscles are measured in the back-facing frame.
          model.rotation.y = targetEnd;
          model.updateMatrixWorld();
          const { center, radius } = meshTarget(primary.mesh);
          model.rotation.y = 0;
          model.updateMatrixWorld();

          // === Phase 3: dive into the biggest muscle of the day (3.5s → 5.5s) ===
          const dist = radius * 3.4 + 0.25;
          tl.call(() => setPhase('zoom'), [], 3.5);
          tl.to(
            focal,
            { x: center.x, y: center.y, z: center.z, duration: 1.6, ease: 'power3.in' },
            3.5,
          );
          tl.to(
            camera.position,
            { x: center.x, y: center.y, z: center.z + dist, duration: 1.6, ease: 'power3.in' },
            3.5,
          );
          tl.to(keyLight, { angle: Math.PI / 12, intensity: 11.0, duration: 1.6, ease: 'power3.in' }, 3.5);
          tl.call(() => setDayLabel(primary.label.toUpperCase()), [], 3.5);
        } else {
          // === REST DAY fallback: pull in to the head/center ===
          setDayLabel('REST DAY — RECHARGE');
          tl.call(() => setPhase('zoom'), [], 3.5);
          tl.to(focal, { x: 0, y: 1.0, z: 0, duration: 1.6, ease: 'power3.in' }, 3.5);
          tl.to(camera.position, { x: 0, y: 0.9, z: 1.2, duration: 1.6, ease: 'power3.in' }, 3.5);
          tl.to(keyLight, { angle: Math.PI / 12, intensity: 10.0, duration: 1.6, ease: 'power3.in' }, 3.5);
          tl.to(rimWarm, { intensity: 2.4, duration: 1.2, ease: 'power2.out' }, 3.5);
          tl.to(ambientLight.color, { r: 0.75, g: 0.72, b: 1.0, duration: 1.0, ease: 'power2.out' }, 3.5);
        }

        // === Phase 4: Screen wipe (5.5s → 6.2s) ===
        tl.call(() => {
          if (overlayRef.current) {
            gsap.to(overlayRef.current, { opacity: 1, duration: 0.6, ease: 'power2.in' });
          }
        }, [], 5.5);

        tl.call(() => {
          setPhase('done');
          onCompleteRef.current();
        }, [], 6.2);

        // ===== ANIMATION LOOP =====
        let animId: number;
        let time = 0;
        const animate = () => {
          animId = requestAnimationFrame(animate);
          time += 0.016;

          const pPos = particleGeo.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < particleCount; i++) {
            pPos.array[i * 3] += particleVelocities[i * 3];
            pPos.array[i * 3 + 1] += particleVelocities[i * 3 + 1];
            pPos.array[i * 3 + 2] += particleVelocities[i * 3 + 2];
            if (pPos.array[i * 3 + 1] > 4) pPos.array[i * 3 + 1] = -4;
          }
          pPos.needsUpdate = true;
          particleMat.opacity = 0.3 + Math.sin(time * 2) * 0.2;

          pulseMuscles(muscleMats, time, 0.45, 0.25);

          camera.lookAt(focal);

          renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
          const newW = container.clientWidth;
          camera.aspect = newW / h;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, h);
        };
        window.addEventListener('resize', onResize);

        cleanupRef.current = () => {
          cancelAnimationFrame(animId);
          window.removeEventListener('resize', onResize);
          tl.kill();
          renderer.dispose();
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        };
      },
      (progress) => {
        if (progress.total > 0) setLoadPercent(Math.round((progress.loaded / progress.total) * 100));
      },
      (error) => {
        console.error('CinematicIntro: Failed to load model:', error);
        onCompleteRef.current();
      },
    );

    return () => { cleanupRef.current?.(); };
  }, [dayType, height]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={mountRef} className="w-full h-full rounded-xl overflow-hidden" />

      {/* Loading */}
      {phase === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: '#050508' }}>
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-[#FF5E00] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>
              Loading... {loadPercent > 0 && `${loadPercent}%`}
            </p>
          </div>
        </div>
      )}

      {/* Spin phase */}
      {phase === 'spin' && (
        <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase" style={{ color: 'rgba(255,94,0,0.7)' }}>
            Analyzing physique...
          </p>
        </div>
      )}

      {/* Highlight / zoom phase label */}
      {(phase === 'highlight' || phase === 'zoom') && (
        <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
          <p className="text-[11px] font-black tracking-[0.3em] uppercase" style={{ color: '#FF5E00', textShadow: '0 0 20px rgba(255,94,0,0.5)' }}>
            {dayLabel}
          </p>
        </div>
      )}

      {/* Black overlay for final wipe */}
      <div
        ref={overlayRef}
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{ background: '#0B0C10', opacity: 0 }}
      />
    </div>
  );
}
