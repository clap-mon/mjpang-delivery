export type BattleSound =
  | "correct"
  | "wrong"
  | "lucky"
  | "bomb"
  | "physical"
  | "magic"
  | "guard"
  | "dodge"
  | "enemy"
  | "stance"
  | "confusion";

export function playBattleSound(kind: BattleSound) {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();

  // 1. 럭키팡 전용 화려한 4음 상승 아르페지오 사운드 (C5 ➔ E5 ➔ G5 ➔ C6)
  if (kind === "lucky") {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const startTime = context.currentTime + idx * 0.06;
      const noteDuration = 0.22;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.09, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);

      osc.connect(gain).connect(context.destination);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
      if (idx === notes.length - 1) {
        osc.addEventListener("ended", () => context.close());
      }
    });
    return;
  }

  // 2. 폭탄 오답 전용 묵직한 저음 폭발 충격음
  if (kind === "bomb") {
    const osc = context.createOscillator();
    const gain = context.createGain();
    const duration = 0.32;

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, context.currentTime + duration);

    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);

    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + duration);
    osc.addEventListener("ended", () => context.close());
    return;
  }

  // 3. 기본 전투 효과음
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const settings: Record<Exclude<BattleSound, "lucky" | "bomb">, [OscillatorType, number, number, number]> = {
    correct: ["triangle", 620, 880, 0.16], wrong: ["square", 180, 100, 0.22],
    physical: ["sawtooth", 180, 90, 0.12], magic: ["sine", 420, 720, 0.18],
    guard: ["triangle", 220, 360, 0.15], dodge: ["sine", 680, 980, 0.14],
    enemy: ["sawtooth", 130, 70, 0.18], stance: ["square", 300, 440, 0.16], confusion: ["square", 480, 190, 0.24],
  };
  const [type, start, end, duration] = settings[kind];
  oscillator.type = type; oscillator.frequency.setValueAtTime(start, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(end, context.currentTime + duration);
  gain.gain.setValueAtTime(0.06, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  oscillator.addEventListener("ended", () => context.close());
}

export function playNoteRhythm(beats: number) {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  // 1박 기준 약 0.5초 길이 (박자에 비례하여 소리가 지속됨)
  const duration = Math.min(Math.max((beats || 1) * 0.45, 0.12), 2.2);
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(523.25, context.currentTime); // C5 (맑은 가온도)

  gain.gain.setValueAtTime(0.15, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.addEventListener("ended", () => context.close());
}
