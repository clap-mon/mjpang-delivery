import type { CombatCard } from "./card-draw.ts";
import { drawCards, drawOpeningHand } from "./card-draw.ts";
import { characters, type Character, type StageId } from "./content.ts";
import { getDifficulty, type AdventureDifficulty } from "./game.ts";
import { seedForQuiz } from "./quiz-engine.ts";
import type { RewardItemId } from "./reward-items.ts";

export type BattlePhase = "quiz" | "reward" | "action" | "enemy";
export type EnemyIntent = { type: "physical" | "magic" | "prepare"; damage: number; label: string };
export type BossStance = "물리 방어" | "마법 결계" | "빈틈";
export type BattleState = {
  phase: BattlePhase; round: number; playerName: string; playerHp: number; maxPlayerHp: number; bossHp: number; maxBossHp: number;
  basePhysicalDefense: number; baseMagicDefense: number; physicalGuard: number; magicGuard: number; physicalShield: boolean; dodge: boolean; energy: number; combo: number; score: number; attackBoost: number; hand: CombatCard[];
  discardCount: number; redrawCount: number; drawCount: number; intent: EnemyIntent; message: string; bossArmor: number; bossBarrier: number; bossStance: BossStance;
  burnDamage: number; burnTurns: number; burnSource?: string; impactSequence: number; attackNotice?: { kind: "physical" | "magic"; damage: number; defense: number; shieldDamage: number; shieldRemaining: number; brokeShield: boolean; sequence: number }; playerEffect?: "guard" | "dodge" | "heal";
  enemyAttackNotice?: { kind: "physical" | "magic"; damage: number; outcome?: "dodge" | "shield" | "guard" }; quizDamageNotice?: number; selfDamageNotice?: number; confusedTurns: number; bossEffect?: "confusion";
  quizDamageShield: number; enemyDamageShield: number; mirrorTurns: number; quizHint: boolean;
};

const profiles: Record<StageId, { hp: number; armor: number; barrier: number; stances: BossStance[] }> = {
  1: { hp: 38, armor: 4, barrier: 4, stances: ["물리 방어", "빈틈", "마법 결계", "빈틈"] },
  2: { hp: 44, armor: 5, barrier: 5, stances: ["마법 결계", "빈틈", "물리 방어", "빈틈"] },
  3: { hp: 50, armor: 5, barrier: 5, stances: ["물리 방어", "빈틈", "마법 결계", "빈틈"] },
  4: { hp: 56, armor: 6, barrier: 6, stances: ["마법 결계", "빈틈", "물리 방어", "빈틈"] },
  5: { hp: 48, armor: 6, barrier: 6, stances: ["물리 방어", "빈틈", "마법 결계", "빈틈", "물리 방어", "빈틈"] },
};

function defenseForStance(stageId: StageId, stance: BossStance, modifier: number) {
  const profile = profiles[stageId];
  return { stance, armor: stance === "물리 방어" ? Math.max(0, profile.armor + modifier) : 0, barrier: stance === "마법 결계" ? Math.max(0, profile.barrier + modifier) : 0 };
}
function defenseFor(stageId: StageId, round: number, modifier: number) { const profile = profiles[stageId]; return defenseForStance(stageId, profile.stances[(round - 1) % profile.stances.length], modifier); }
function intentFor(stageId: StageId, round: number, difficulty: AdventureDifficulty): EnemyIntent {
  const modifier = getDifficulty(difficulty).statModifier; const magic = (stageId + round) % 2 === 0;
  const damage = Math.max(1, 6 + Math.floor((stageId - 1) / 2) + (round > 5 ? 1 : 0) + modifier);
  return { type: magic ? "magic" : "physical", damage, label: `${magic ? "마법" : "물리"} 공격 ${damage}` };
}
function drawTo(state: BattleState, stageId: StageId, session: string, count: number) {
  const drawCount = state.drawCount + 1;
  return { hand: drawCards(state.hand, seedForQuiz(stageId, state.round, session), count, drawCount, { ensureDirectAttack: true }), drawCount };
}
function randomRange(min: number, max: number) { return min + Math.floor(Math.random() * (max - min + 1)); }
function directAttack(state: BattleState, card: CombatCard, rawBase: number, kind: "physical" | "magic") {
  const defense = kind === "physical" ? state.bossArmor : state.bossBarrier;
  const exposed = kind === "physical" && state.bossArmor === 0 ? card.exposedBonus ?? 0 : 0;
  const raw = rawBase + exposed + state.attackBoost;
  if (defense <= 0) return { damage: state.confusedTurns > 0 ? raw * 2 : raw, defense: 0, shieldDamage: 0, shieldRemaining: 0, brokeShield: false };
  const bypass = Math.min(card.pierce ?? 0, raw); const shieldDamage = Math.min(defense, Math.max(0, raw - bypass)); const shieldRemaining = defense - shieldDamage;
  return { damage: bypass + Math.max(0, raw - bypass - defense), defense, shieldDamage, shieldRemaining, brokeShield: shieldRemaining === 0 };
}
function withConfusionIfBroken(state: BattleState, armor: number, barrier: number) {
  if ((state.bossArmor > 0 && armor === 0) || (state.bossBarrier > 0 && barrier === 0)) return { confusedTurns: 1, bossEffect: "confusion" as const };
  return { confusedTurns: state.confusedTurns, bossEffect: state.bossEffect };
}

export function createBattleState(stageId: StageId, difficulty: AdventureDifficulty, session: string, character: Character = characters[0]): BattleState {
  const config = getDifficulty(difficulty); const profile = profiles[stageId]; const defense = defenseFor(stageId, 1, config.statModifier); const hand = drawOpeningHand(seedForQuiz(stageId, 1, session));
  return { phase: "quiz", round: 1, playerName: character.name, playerHp: config.playerHp, maxPlayerHp: config.playerHp, bossHp: profile.hp, maxBossHp: profile.hp,
    basePhysicalDefense: character.physicalDefense, baseMagicDefense: character.magicDefense, physicalGuard: 0, magicGuard: 0, physicalShield: false, dodge: false, energy: 0, combo: 0, score: 0, attackBoost: 0, hand, discardCount: 0, redrawCount: 0, drawCount: 0,
    intent: intentFor(stageId, 1, difficulty), bossArmor: defense.armor, bossBarrier: defense.barrier, bossStance: defense.stance, burnDamage: 0, burnTurns: 0, impactSequence: 0, confusedTurns: 0, quizDamageShield: 0, enemyDamageShield: 0, mirrorTurns: 0, quizHint: false,
    message: "문제를 맞혀 행동력을 얻고, 보스 태세에 맞는 카드를 사용하세요." };
}
export function rewardQuizAnswer(state: BattleState, correct: boolean, lucky: boolean, _bomb: boolean): BattleState {
  void _bomb;
  if (correct) {
    const energy = lucky ? 3 : 2; const drawn = state.hand.length < 5 ? { hand: drawCards(state.hand, state.round * 101, 1, state.drawCount + 1, { ensureDirectAttack: true }), drawCount: state.drawCount + 1 } : {};
    return { ...state, ...drawn, quizDamageNotice: undefined, phase: "reward", energy, combo: Math.min(3, state.combo + 1), score: state.score + (lucky ? 150 : 100), mirrorTurns: Math.max(0, state.mirrorTurns - 1), quizHint: false, message: `${lucky ? "럭키 정답" : "정답"}! 행동력 ${energy}을 얻었어요.` };
  }
  const penalty = randomRange(2, 5);
  const damage = Math.max(0, penalty - state.quizDamageShield);
  const shieldMessage = state.quizDamageShield > 0 ? ` · 별빛 돋보기가 피해 ${Math.min(penalty, state.quizDamageShield)} 감소` : "";
  return { ...state, phase: "reward", energy: 0, combo: Math.floor(state.combo / 2), attackBoost: 0, quizDamageNotice: damage || undefined, playerHp: Math.max(0, state.playerHp - damage), quizDamageShield: 0, quizHint: false, message: `오답! ${state.playerName}의 집중력 ${damage} 감소, 연쇄와 공격 강화가 정리됐어요.${shieldMessage}` };
}
export function applyRewardItem(state: BattleState, itemId: RewardItemId): BattleState {
  if (itemId === "gate-guardian-crystal") {
    if (state.phase !== "quiz") return state;
    return { ...state, quizHint: true, message: "별빛 돋보기 사용! 오답 선택지 1개를 봉인했습니다." };
  }
  if (itemId === "mist-guide-crystal") {
    if (state.phase !== "action") return state;
    const defenseActive = state.bossArmor > 0 || state.bossBarrier > 0;
    const stanceBreak = defenseActive ? withConfusionIfBroken(state, 0, 0) : { confusedTurns: 1 as const, bossEffect: "confusion" as const };
    return { ...state, bossArmor: 0, bossBarrier: 0, ...stanceBreak, message: defenseActive ? "얼음 파쇄 깃펜 사용! 보스의 방어와 결계를 해제해 1턴 혼란에 빠뜨렸습니다." : "얼음 파쇄 깃펜 사용! 빈틈을 포착해 보스를 1턴 혼란에 빠뜨렸습니다." };
  }
  if (itemId === "precision-gear-crystal") {
    if (state.phase !== "action") return state;
    return { ...state, energy: state.energy + 2, message: "황금 문장 열쇠 사용! 행동력 2 획득 · 이번 턴은 3을 넘어 사용할 수 있어요." };
  }
  if (itemId === "truth-mirror-crystal") {
    if (state.phase !== "quiz") return state;
    return { ...state, mirrorTurns: 2, message: "진실의 문장 거울 사용! 2턴 동안 럭키 정답을 비추고 폭탄 카드를 봉인합니다." };
  }
  return state;
}
export function retryQuizAfterWrong(state: BattleState): BattleState {
  if (state.phase !== "reward" || state.playerHp <= 0) return state;
  return { ...state, phase: "quiz", energy: 0, quizDamageNotice: undefined, message: "같은 문제를 다시 풀어 보세요." };
}
export function recoverComboHp(state: BattleState, amount: number): BattleState {
  if (state.combo < 3 || amount < 1 || amount > 5) return state;
  const recovered = Math.min(amount, state.maxPlayerHp - state.playerHp);
  return { ...state, playerHp: state.playerHp + recovered, combo: 0, message: `정답 연쇄 보상! ${state.playerName}의 집중력 ${recovered} 회복.` };
}
export function beginActionPhase(state: BattleState): BattleState { return { ...state, phase: "action", playerEffect: undefined, enemyAttackNotice: undefined, selfDamageNotice: undefined, bossEffect: state.confusedTurns > 0 ? "confusion" : undefined, message: `${state.confusedTurns > 0 ? "보스 혼란" : state.bossStance} 태세예요. 상성 카드를 사용하세요.` }; }
export function playCombatCard(state: BattleState, instanceId: string): BattleState {
  if (state.phase !== "action") return state; const card = state.hand.find((item) => item.instanceId === instanceId);
  if (!card || card.cost > state.energy) return { ...state, message: "행동력이 부족해요." };
  let next: BattleState = { ...state, energy: state.energy - card.cost, hand: state.hand.filter((item) => item.instanceId !== instanceId), discardCount: state.discardCount + 1, attackNotice: undefined, playerEffect: undefined, selfDamageNotice: undefined };
  if (card.effect === "physical" || card.effect === "magic" || card.effect === "risky") {
    const kind = card.effect === "magic" ? "magic" : "physical"; const riskyDamage = card.effect === "risky" ? randomRange(0, 6) : card.power; const hit = directAttack(state, card, riskyDamage, kind);
    const selfDamage = card.effect === "risky" ? randomRange(2, 5) : 0;
    const impactSequence = state.impactSequence + 1;
    const armor = kind === "physical" ? hit.shieldRemaining : state.bossArmor; const barrier = kind === "magic" ? hit.shieldRemaining : state.bossBarrier; const confusion = hit.brokeShield ? withConfusionIfBroken(state, armor, barrier) : {};
    const shieldName = kind === "physical" ? "물리 방어막" : "마법 결계";
    const shieldMessage = hit.defense > 0 ? hit.brokeShield ? `${shieldName} 파괴!${hit.damage ? ` 보스에게 ${kind === "physical" ? "물리" : "마법"} 피해 ${hit.damage}` : ""}` : `${shieldName} ${hit.shieldDamage} 감소 · 남음 ${hit.shieldRemaining}` : `보스에게 ${kind === "physical" ? "물리" : "마법"} 피해 ${hit.damage}`;
    const appliesBurn = Boolean(card.burn) && (kind !== "magic" || hit.defense === 0 || hit.brokeShield);
    next = { ...next, bossHp: Math.max(0, state.bossHp - hit.damage), playerHp: Math.max(0, state.playerHp - selfDamage), bossArmor: armor, bossBarrier: barrier, ...confusion, attackBoost: 0, score: state.score + hit.damage * 5, impactSequence, attackNotice: { kind, damage: hit.damage, defense: hit.defense, shieldDamage: hit.shieldDamage, shieldRemaining: hit.shieldRemaining, brokeShield: hit.brokeShield, sequence: impactSequence }, burnDamage: appliesBurn ? card.burn ?? 0 : state.burnDamage, burnTurns: appliesBurn ? 1 : state.burnTurns, burnSource: appliesBurn ? card.name : state.burnSource, selfDamageNotice: selfDamage || undefined, message: `${state.playerName}의 ${card.name}! ${shieldMessage}${selfDamage ? ` · ${state.playerName}의 집중력 ${selfDamage} 소모` : ""}` };
  } else if (card.effect === "guard") next = { ...next, physicalShield: true, physicalGuard: 1, playerEffect: "guard", message: `${state.playerName}의 ${card.name}! 다음 보스 물리 공격을 무효화합니다.` };
  else if (card.effect === "focus-guard") next = { ...next, physicalShield: true, physicalGuard: 1, playerHp: Math.min(state.maxPlayerHp, state.playerHp + 2), playerEffect: "heal", message: `${state.playerName}의 ${card.name}! 물리 무효 · 집중력 2 회복.` };
  else if (card.effect === "magic-ward") next = { ...next, magicGuard: state.magicGuard + card.power, playerEffect: "guard", message: `${state.playerName}의 ${card.name}! 다음 보스 마법 피해 ${card.power} 감소.` };
  else if (card.effect === "dodge") next = { ...next, dodge: true, playerEffect: "dodge", message: `${state.playerName}의 ${card.name}! 다음 보스 공격을 완전히 회피합니다.` };
  else if (card.effect === "heal") next = { ...next, playerHp: Math.min(state.maxPlayerHp, state.playerHp + card.power), playerEffect: "heal", message: `${state.playerName}의 ${card.name}! 집중력 ${card.power} 회복.` };
  else if (card.effect === "boost") next = { ...next, attackBoost: state.attackBoost + card.power, message: `${state.playerName}의 ${card.name}! 다음 직접 공격 피해 +${card.power}.` };
  else if (card.effect === "analyze") {
    const armor = Math.max(0, state.bossArmor - card.power); const barrier = Math.max(0, state.bossBarrier - card.power); const confusion = withConfusionIfBroken(state, armor, barrier);
    next = { ...next, bossArmor: armor, bossBarrier: barrier, ...confusion, message: confusion.confusedTurns === 1 ? `${state.playerName}의 ${card.name} 성공! 보스 방어막이 파괴되어 이번 턴 혼란.` : `${state.playerName}의 ${card.name}! 보스 방어막과 결계가 ${card.power} 감소.` };
  } else if (card.effect === "accelerate") {
    const afterDiscard = next.hand.slice(1); const drawn = drawCards(afterDiscard, state.round * 211, 2, state.drawCount + 1);
    next = { ...next, hand: drawn, drawCount: state.drawCount + 1, discardCount: next.discardCount + (next.hand.length ? 1 : 0), message: `${state.playerName}의 ${card.name}! 오래된 카드 1장을 버리고 2장을 뽑았어요.` };
  }
  if (next.bossHp <= 0) return { ...next, phase: "enemy", message: `${state.playerName}의 ${card.name}! 보스를 물리쳤어요!` };
  return next;
}
export function redrawHand(state: BattleState, stageId: StageId, session: string): BattleState {
  if (state.phase !== "action" || state.energy < 2) return { ...state, message: "새로 뽑기에는 행동력 2가 필요해요." };
  const drawIndex = state.drawCount + state.round * 10;
  return { ...state, energy: state.energy - 2, discardCount: state.discardCount + state.hand.length, redrawCount: state.redrawCount + 1, drawCount: drawIndex, hand: drawOpeningHand(seedForQuiz(stageId, state.round, session), 5, drawIndex), message: "현재 손패를 버리고 새 손패 5장을 뽑았어요." };
}
export function resolveEnemyTurn(state: BattleState): BattleState {
  if (state.phase !== "action") return state;
  const burnDamage = state.burnTurns > 0 ? state.burnDamage : 0; const bossHp = Math.max(0, state.bossHp - burnDamage); const burn = { bossHp, burnTurns: Math.max(0, state.burnTurns - 1), burnDamage: state.burnTurns > 1 ? state.burnDamage : 0, burnSource: state.burnTurns > 1 ? state.burnSource : undefined }; const burnMessage = burnDamage ? `${state.playerName}의 ${state.burnSource ?? "화상"}! 보스에게 화상 피해 ${burnDamage} · ` : "";
  if (bossHp <= 0) return { ...state, ...burn, phase: "enemy", attackNotice: undefined, message: `${burnMessage}보스를 물리쳤어요!` };
  if (state.confusedTurns > 0) return { ...state, ...burn, phase: "enemy", attackNotice: undefined, confusedTurns: state.confusedTurns - 1, bossEffect: "confusion", message: `${burnMessage}보스가 혼란으로 공격을 건너뛰었어요!` };
  if (state.intent.type === "prepare") return { ...state, ...burn, phase: "enemy", attackNotice: undefined, message: burnDamage ? `${burnMessage}보스가 공격을 준비해요.` : "보스가 공격을 준비해요." };
  if (state.dodge) return { ...state, ...burn, phase: "enemy", attackNotice: undefined, enemyAttackNotice: { kind: state.intent.type, damage: 0, outcome: "dodge" }, dodge: false, physicalShield: false, physicalGuard: 0, magicGuard: 0, enemyDamageShield: 0, attackBoost: state.attackBoost + 2, message: `보스의 ${state.intent.label}! ${state.playerName}가 완전히 회피 · 빈틈 포착 +2.` };
  if (state.intent.type === "physical" && state.physicalShield) return { ...state, ...burn, phase: "enemy", attackNotice: undefined, enemyAttackNotice: { kind: "physical", damage: 0, outcome: "shield" }, physicalShield: false, physicalGuard: 0, enemyDamageShield: 0, attackBoost: state.attackBoost + 2, message: `보스의 ${state.intent.label}! ${state.playerName}의 시험 방패로 ${state.intent.damage} 막음 · 반격 준비 +2.` };
  const guard = state.intent.type === "physical" ? state.basePhysicalDefense + state.physicalGuard : state.baseMagicDefense + state.magicGuard; const beforeCrystal = Math.max(0, state.intent.damage - guard); const damage = Math.max(0, beforeCrystal - state.enemyDamageShield); const defenseBlocked = Math.min(state.intent.damage, guard); const crystalBlocked = Math.min(beforeCrystal, state.enemyDamageShield); const defenseName = state.intent.type === "physical" ? "물리 방어" : "마법 방어"; const defenseMessage = defenseBlocked > 0 ? `${state.playerName}의 ${defenseName} ${guard}로 ${defenseBlocked} 막음 · ` : ""; const crystalMessage = crystalBlocked > 0 ? `안개길 길잡이 수정으로 ${crystalBlocked} 막음 · ` : "";
  return { ...state, ...burn, phase: "enemy", attackNotice: undefined, enemyAttackNotice: { kind: state.intent.type, damage, outcome: damage === 0 ? "guard" : undefined }, playerHp: Math.max(0, state.playerHp - damage), physicalShield: state.intent.type === "magic" ? state.physicalShield : false, physicalGuard: state.intent.type === "magic" ? state.physicalGuard : 0, magicGuard: state.intent.type === "physical" ? state.magicGuard : 0, enemyDamageShield: 0, message: `${burnMessage}보스의 ${state.intent.label}! ${defenseMessage}${crystalMessage}${state.playerName}의 집중력 ${damage} 감소.` };
}
export function battleFinished(state: BattleState) { return state.bossHp <= 0 || state.playerHp <= 0; }
export function battleWon(state: BattleState) { return state.bossHp <= 0; }
export function advanceBattleRound(state: BattleState, stageId: StageId, difficulty: AdventureDifficulty, session: string): BattleState {
  if (state.phase !== "enemy" || battleFinished(state)) return state;
  const round = state.round + 1;
  const config = getDifficulty(difficulty);
  const shieldHeld = (state.bossStance === "물리 방어" && state.bossArmor > 0) || (state.bossStance === "마법 결계" && state.bossBarrier > 0);
  const randomStances: BossStance[] = ["물리 방어", "마법 결계", "빈틈"];
  const chosenStance = randomStances[Math.floor(Math.random() * randomStances.length)];
  const defense = shieldHeld ? defenseForStance(stageId, chosenStance, config.statModifier) : defenseFor(stageId, round, config.statModifier);
  const drawn = state.hand.length <= 3 ? drawTo(state, stageId, session, 1) : { hand: state.hand, drawCount: state.drawCount };
  return { ...state, ...drawn, phase: "quiz", round, energy: 0, bossEffect: state.confusedTurns > 0 ? "confusion" : undefined, intent: intentFor(stageId, round, difficulty), bossArmor: defense.armor, bossBarrier: defense.barrier, bossStance: defense.stance, message: "다음 문제를 맞혀 행동력을 얻으세요." };
}
