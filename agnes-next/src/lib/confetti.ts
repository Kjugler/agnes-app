export async function getConfetti() {
    const mod = await import("canvas-confetti");
    return mod.default;
  }
  
  type CelebrateOptions = {
    center?: { x: number; y: number };
  };

  const clamp = (v: number, min = 0, max = 1) => Math.min(Math.max(v, min), max);
  
  export async function confettiCelebrate(options?: CelebrateOptions) {
    const confetti = await getConfetti();
    const centerX = clamp(options?.center?.x ?? 0.5, 0.05, 0.95);
    const centerY = clamp(options?.center?.y ?? 0.55, 0.05, 0.95);
    const base = { ticks: 200, gravity: 0.9, startVelocity: 45, scalar: 1.0 };
    // Center fan
    confetti({ ...base, particleCount: 140, spread: 75, origin: { x: centerX, y: centerY } });
    // Side cannons offset from center
    const leftX = clamp(centerX - 0.25, 0.05, 0.95);
    const rightX = clamp(centerX + 0.25, 0.05, 0.95);
    const sideY = clamp(centerY + 0.15, 0.05, 0.95);
    confetti({ ...base, particleCount: 60, angle: 60, spread: 55, origin: { x: leftX, y: sideY } });
    confetti({ ...base, particleCount: 60, angle: 120, spread: 55, origin: { x: rightX, y: sideY } });
  }
  
  export async function confettiSprinkle() {
    const confetti = await getConfetti();
    confetti({
      particleCount: 40,
      spread: 50,
      startVelocity: 25,
      gravity: 1.1,
      ticks: 120,
      origin: { x: 0.5, y: 0.6 },
      scalar: 0.9,
    });
  }