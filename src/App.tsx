import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const phases = [
  {
    name: "Inhale",
    duration: 4,
    hint: "Breathe in slowly",
    color: "from-sky-300 via-indigo-400 to-violet-500",
    tone: [392, 523.25, 659.25],
    vibration: [28],
  },
  {
    name: "Hold",
    duration: 7,
    hint: "Keep the breath still",
    color: "from-violet-300 via-fuchsia-400 to-pink-500",
    tone: [659.25, 783.99],
    vibration: [18, 60, 18],
  },
  {
    name: "Exhale",
    duration: 8,
    hint: "Release gently",
    color: "from-emerald-300 via-teal-400 to-cyan-500",
    tone: [523.25, 392, 261.63],
    vibration: [48],
  },
] as const;

type PhaseName = (typeof phases)[number]["name"];
type AudioContextConstructor = typeof AudioContext;

const scaleMap: Record<PhaseName, number> = {
  Inhale: 1.38,
  Hold: 1.38,
  Exhale: 0.72,
};

const blobShapeMap: Record<PhaseName, string> = {
  Inhale: "58% 42% 62% 38% / 46% 62% 38% 54%",
  Hold: "48% 52% 44% 56% / 55% 45% 55% 45%",
  Exhale: "42% 58% 38% 62% / 58% 39% 61% 42%",
};

function BreathingApp() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(phases[0].duration);
  const [isRunning, setIsRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    }
  }, []);

  const getAudioContext = useCallback(() => {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: AudioContextConstructor })
        .webkitAudioContext;

    if (!AudioContextClass) return null;

    const ctx = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = ctx;
    return ctx;
  }, []);

  const vibrate = useCallback(
    (pattern: readonly number[]) => {
      if (!hapticsEnabled || !("vibrate" in navigator)) return;
      navigator.vibrate([...pattern]);
    },
    [hapticsEnabled],
  );

  const playPhaseCue = useCallback(
    (phase: (typeof phases)[number]) => {
      if (!soundEnabled) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      const now = ctx.currentTime;

      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      compressor.threshold.value = -26;
      compressor.knee.value = 18;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;

      master.connect(compressor);
      compressor.connect(ctx.destination);

      phase.tone.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + index * 0.09;

        osc.type = index === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(
          freq * 1.015,
          startTime + 0.5,
        );

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(
          0.18 / (index + 1),
          startTime + 0.03,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.92);

        osc.connect(gain);
        gain.connect(master);
        osc.start(startTime);
        osc.stop(startTime + 1);
      });
    },
    [getAudioContext, soundEnabled],
  );

  useEffect(() => {
    if (!isRunning) return;

    const phase = phases[phaseIndex];
    playPhaseCue(phase);
    vibrate(phase.vibration);
  }, [isRunning, phaseIndex, playPhaseCue, vibrate]);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev > 1) return prev - 1;

        const nextIndex = (phaseIndex + 1) % phases.length;

        if (nextIndex === 0) {
          setCycleCount((count) => count + 1);
        }

        setPhaseIndex(nextIndex);
        return phases[nextIndex].duration;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, phaseIndex]);

  const start = async () => {
    const ctx = getAudioContext();

    if (ctx?.state === "suspended") {
      await ctx.resume();
    }

    setIsRunning(true);
  };

  const stop = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if ("vibrate" in navigator) navigator.vibrate(0);
  };

  const reset = () => {
    stop();
    setPhaseIndex(0);
    setTimeLeft(phases[0].duration);
    setCycleCount(0);
  };

  const currentPhase = phases[phaseIndex];
  const phaseProgress = 1 - timeLeft / currentPhase.duration;
  const totalSeconds =
    cycleCount * 19 +
    phases
      .slice(0, phaseIndex)
      .reduce((sum, phase) => sum + phase.duration, 0) +
    (currentPhase.duration - timeLeft);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050506] text-white">
      <div className="flex min-h-screen items-center justify-center  px-6 py-6">
        <section className="w-full max-w-[340px]">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
                Sleep mode
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal">
                4-7-8
              </h1>
            </div>
          </div>

          <div className="mb-7 grid grid-cols-3 rounded-full bg-white/[0.07] p-1">
            {phases.map((phase, index) => (
              <div
                className={`rounded-full px-2 py-2 text-center text-xs transition ${
                  index === phaseIndex
                    ? "bg-white text-black shadow-sm"
                    : "text-white/45"
                }`}
                key={phase.name}
              >
                <span className="font-medium">{phase.name}</span>
                <span className="ml-1 font-mono opacity-60">
                  {phase.duration}
                </span>
              </div>
            ))}
          </div>

          <div className="relative mb-3 flex min-h-52 items-center justify-center">
            <motion.div
              animate={{ rotate: isRunning ? 360 : 0 }}
              className="absolute flex h-44 w-44 items-center justify-center"
              transition={{
                duration: 18,
                ease: "linear",
                repeat: isRunning ? Infinity : 0,
              }}
            >
              <motion.div
                animate={{
                  borderRadius: blobShapeMap[currentPhase.name],
                  scale: scaleMap[currentPhase.name] + 0.08,
                  x: isRunning ? [0, -5, 4, 0] : 0,
                  y: isRunning ? [0, 4, -5, 0] : 0,
                }}
                className={`absolute h-32 w-32 bg-gradient-to-br ${currentPhase.color} opacity-30 blur-2xl`}
                style={{ borderRadius: blobShapeMap[currentPhase.name] }}
                transition={{
                  duration: currentPhase.duration,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                animate={{
                  borderRadius: blobShapeMap[currentPhase.name],
                  scale: scaleMap[currentPhase.name],
                  x: isRunning ? [0, 3, -3, 0] : 0,
                  y: isRunning ? [0, -4, 3, 0] : 0,
                }}
                className={`absolute h-32 w-32 bg-gradient-to-br ${currentPhase.color} shadow-[0_0_42px_rgba(129,140,248,0.4)]`}
                style={{ borderRadius: blobShapeMap[currentPhase.name] }}
                transition={{
                  duration: currentPhase.duration,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                animate={{
                  borderRadius: blobShapeMap[currentPhase.name],
                  scale: scaleMap[currentPhase.name] * 0.82,
                }}
                className="absolute h-28 w-28 bg-white/10 mix-blend-soft-light"
                style={{ borderRadius: blobShapeMap[currentPhase.name] }}
                transition={{
                  duration: currentPhase.duration,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            <div className="absolute text-center">
              <div className="text-lg font-semibold">{currentPhase.name}</div>
              <div className="mt-1 font-mono text-5xl leading-none">
                {timeLeft}
              </div>
            </div>
          </div>

          <p className="mb-4 text-center text-xs text-white/50">
            {currentPhase.hint}
          </p>

          <div className="mb-4">
            <div className="mb-2 flex justify-between text-xs text-white/40">
              <span>Next: {phases[(phaseIndex + 1) % phases.length].name}</span>
              <span>{Math.round(phaseProgress * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                key={phaseIndex}
                animate={{ width: isRunning ? "0%" : "100%" }}
                className={`h-full bg-gradient-to-r ${currentPhase.color}`}
                initial={{ width: "100%" }}
                transition={{
                  duration: isRunning ? currentPhase.duration : 0,
                  ease: "linear",
                }}
              />
            </div>
          </div>

          <div className="mb-5 flex items-center justify-between border-y border-white/10 py-3 text-sm">
            <div>
              <div className="text-white/40">Session</div>
              <div className="mt-1 font-mono">
                {Math.floor(totalSeconds / 60)}:
                {String(totalSeconds % 60).padStart(2, "0")}
              </div>
            </div>
            <div className="flex rounded-full bg-white/[0.07] p-1">
              <button
                aria-pressed={soundEnabled}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  soundEnabled ? "bg-white text-black" : "text-white/45"
                }`}
                onClick={() => setSoundEnabled((enabled) => !enabled)}
                type="button"
              >
                Sound
              </button>
              <button
                aria-pressed={hapticsEnabled}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  hapticsEnabled ? "bg-white text-black" : "text-white/45"
                }`}
                onClick={() => setHapticsEnabled((enabled) => !enabled)}
                type="button"
              >
                Haptics
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            {!isRunning ? (
              <button
                className="min-h-12 rounded-2xl bg-white px-6 font-semibold text-black transition active:scale-[0.98]"
                onClick={start}
                type="button"
              >
                Start
              </button>
            ) : (
              <button
                className="min-h-12 rounded-2xl bg-yellow-300 px-6 font-semibold text-black transition active:scale-[0.98]"
                onClick={stop}
                type="button"
              >
                Pause
              </button>
            )}

            <button
              className="min-h-12 rounded-2xl bg-white/10 px-4 font-semibold text-white transition active:scale-[0.98]"
              onClick={reset}
              type="button"
            >
              Reset
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default BreathingApp;
