export async function getConfetti() {
    const mod = await import("canvas-confetti");
    return mod.default;
  }
  
  export async function confettiCelebrate() {
    const confetti = await getConfetti();
    const base = { ticks: 200, gravity: 0.9, startVelocity: 45, scalar: 1.0 };
    // Center fan
    confetti({ ...base, particleCount: 140, spread: 75, origin: { x: 0.5, y: 0.55 } });
    // Side cannons
    confetti({ ...base, particleCount: 60, angle: 60,  spread: 55, origin: { x: 0.15, y: 0.7 } });
    confetti({ ...base, particleCount: 60, angle: 120, spread: 55, origin: { x: 0.85, y: 0.7 } });
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