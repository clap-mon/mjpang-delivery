export type AdventureDifficulty = "easy" | "normal" | "hard";

export const difficulties = [
  { id: "easy", badge: "쉬움", name: "쉬움", description: "집중력 +8 · 보스 공격·방어 -2", playerHp: 42, statModifier: -2 },
  { id: "normal", badge: "보통", name: "보통", description: "기본 집중력 · 기본 보스 공략", playerHp: 34, statModifier: 0 },
  { id: "hard", badge: "어려움", name: "어려움", description: "집중력 -8 · 보스 공격·방어 +2", playerHp: 26, statModifier: 2 },
] as const;

export function getDifficulty(id: AdventureDifficulty) { return difficulties.find((item) => item.id === id) ?? difficulties[1]; }
