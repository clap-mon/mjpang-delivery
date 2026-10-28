import { makePrng } from "./quiz-engine.ts";

export type CardEffect = "physical" | "magic" | "guard" | "magic-ward" | "dodge" | "heal" | "analyze" | "accelerate" | "boost" | "focus-guard" | "risky";
export type CardRole = "attack" | "magic" | "defense" | "dodge" | "heal" | "strategy" | "boost";
export type CombatCard = {
  instanceId: string; key: string; name: string; cost: number; effect: CardEffect; power: number; symbol: string;
  role: CardRole; description: string; exposedBonus?: number; burn?: number; pierce?: number;
};

const catalog = [
  { key: "strike", name: "국어사전 펀치", cost: 1, effect: "physical", power: 6, symbol: "📕", role: "attack", description: "물리 피해 6" },
  { key: "jab", name: "연필촉 콕콕 찌르기", cost: 1, effect: "physical", power: 4, symbol: "✏️", role: "attack", description: "물리 피해 4 · 방어 0이면 +3", exposedBonus: 3 },
  { key: "factor-slash", name: "밑줄 긋기", cost: 1, effect: "physical", power: 5, symbol: "🖍️", role: "attack", description: "물리 피해 5 · 방어 0이면 +4", exposedBonus: 4 },
  { key: "product-rush", name: "원고지 돌격", cost: 1, effect: "physical", power: 3, symbol: "📝", role: "attack", description: "물리 피해 3 · 방어 0이면 +5", exposedBonus: 5 },
  { key: "risky-bet", name: "과감한 끝말잇기", cost: 0, effect: "risky", power: 6, symbol: "🎲", role: "attack", description: "물리 피해 0~6 · 집중력 2~5 소모" },
  { key: "spell", name: "황금 깃펜 번개", cost: 2, effect: "magic", power: 10, symbol: "✒️", role: "magic", description: "마법 피해 10" },
  { key: "spark", name: "작은따옴표 불꽃", cost: 1, effect: "magic", power: 3, symbol: "💬", role: "magic", description: "마법 피해 3 · 화상 피해 2", burn: 2 },
  { key: "guard", name: "마침표 방패", cost: 1, effect: "guard", power: 1, symbol: "🛑", role: "defense", description: "다음 물리 공격 무효" },
  { key: "focus-shield", name: "쉼표 결계", cost: 2, effect: "focus-guard", power: 2, symbol: "🌿", role: "defense", description: "물리 무효 · 집중력 2 회복" },
  { key: "dodge", name: "말바꾸기 회피", cost: 2, effect: "dodge", power: 1, symbol: "💨", role: "dodge", description: "다음 공격 완전 회피" },
  { key: "heal", name: "독서 휴식", cost: 1, effect: "heal", power: 5, symbol: "✨", role: "heal", description: "집중력 5 회복" },
  { key: "analyze", name: "글쓴이의 의도 파악", cost: 1, effect: "analyze", power: 3, symbol: "🔍", role: "strategy", description: "방어·결계 3 약화" },
  { key: "accelerate", name: "줄줄이 잇기", cost: 1, effect: "accelerate", power: 2, symbol: "📜", role: "strategy", description: "오래된 카드 버림 · 2장 뽑기" },
  { key: "chain", name: "새 낱말 익히기", cost: 1, effect: "boost", power: 3, symbol: "🔥", role: "boost", description: "다음 공격 피해 +3" },
  { key: "magic-ward", name: "느낌표 충격 방패", cost: 1, effect: "magic-ward", power: 3, symbol: "❗", role: "defense", description: "다음 마법 피해 3 감소" },
  { key: "armor-pierce", name: "마침표 일격", cost: 1, effect: "physical", power: 5, symbol: "⚡", role: "attack", description: "물리 5 · 방어 2 무시", pierce: 2 },
  { key: "rounding-wave", name: "낱말의 파동", cost: 1, effect: "magic", power: 5, symbol: "🌊", role: "magic", description: "마법 피해 5" },
] as const;

type CardTemplate = (typeof catalog)[number];
type DrawOptions = { ensureDirectAttack?: boolean };
const openingGroups: CardRole[][] = [["attack"], ["magic", "strategy"], ["defense", "dodge", "heal", "boost"]];
const roleWeights: Record<CardRole, number> = { attack: 35, magic: 25, defense: 10, dodge: 5, heal: 10, strategy: 10, boost: 5 };
const openingFlexWeights: Record<CardRole, number> = { attack: 60, magic: 15, defense: 6, dodge: 3, heal: 6, strategy: 6, boost: 4 };
const maxAttackCardsInHand = 3;

function copy(template: CardTemplate, drawIndex: number, order: number): CombatCard { return { ...template, instanceId: `${template.key}-${drawIndex}-${order}` }; }
function handCount(hand: CombatCard[], key: string) { return hand.filter((card) => card.key === key).length; }
function roleCount(hand: CombatCard[], role: CardRole) { return hand.filter((card) => card.role === role).length; }
function canAdd(hand: CombatCard[], card: CardTemplate) { return handCount(hand, card.key) < 1 && (card.role !== "attack" || roleCount(hand, "attack") < maxAttackCardsInHand); }
function pick(rng: () => number, candidates: CardTemplate[]) { return candidates[Math.floor(rng() * candidates.length)]!; }
function pickWeightedRole(rng: () => number, candidates: CardTemplate[], weights: Record<CardRole, number>, allowedRoles?: CardRole[]) {
  const roles = [...new Set(candidates.map((card) => card.role))].filter((role) => !allowedRoles || allowedRoles.includes(role));
  const total = roles.reduce((sum, role) => sum + weights[role], 0); let point = rng() * total;
  for (const role of roles) { point -= weights[role]; if (point <= 0) return role; }
  return roles[roles.length - 1]!;
}
function pickCardForRole(rng: () => number, candidates: CardTemplate[], role: CardRole) {
  return pick(rng, candidates.filter((card) => card.role === role));
}
function hasDirectAttack(hand: CombatCard[]) { return hand.some((card) => card.role === "attack" || card.role === "magic"); }
function addDraws(hand: CombatCard[], seed: number, count: number, drawIndex: number, groups: CardRole[][] = [], options: DrawOptions = {}) {
  const rng = makePrng(seed + drawIndex * 7919); const next = [...hand];
  for (let order = 0; order < count; order += 1) {
    const pool = catalog.filter((card) => canAdd(next, card));
    const directAttackSafety = options.ensureDirectAttack && order === 0 && !hasDirectAttack(next);
    const openingRoles = directAttackSafety ? ["attack", "magic"] as CardRole[] : groups[order];
    const weights = order === 3 && groups === openingGroups ? openingFlexWeights : roleWeights;
    const role = pickWeightedRole(rng, pool, weights, openingRoles);
    const card = pickCardForRole(rng, pool, role);
    next.push(copy(card, drawIndex, next.length + order));
  }
  return next;
}

export function drawOpeningHand(seed: number, count = 4, drawIndex = 0) { return addDraws([], seed, count, drawIndex, openingGroups); }
export function drawCards(hand: CombatCard[], seed: number, count: number, drawIndex: number, options?: DrawOptions) { return addDraws(hand, seed, count, drawIndex, [], options); }
export function drawHand(seed: number, count = 4, drawIndex = 0) { return drawOpeningHand(seed, count, drawIndex); }
