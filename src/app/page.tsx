"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { advanceBattleRound, applyRewardItem, battleFinished, battleWon, beginActionPhase, createBattleState, playCombatCard, recoverComboHp, redrawHand, resolveEnemyTurn, retryQuizAfterWrong, rewardQuizAnswer, type BattleState } from "@/lib/battle-engine";
import { clearAdventureProgress, loadRewardItems, loadUnlockedStage, loadUsedRewardItems, saveRewardItems, saveUnlockedStage, saveUsedRewardItems } from "@/lib/adventure-progress";
import type { CombatCard } from "@/lib/card-draw";
import { characters, stages, type DialogueChoice, type DialogueMultiCheck as DialogueMultiCheckData, type DialogueVisualItem, type GrammarConceptCard, type GuideSideWings, type InteractiveTask, type StageId } from "@/lib/content";
import { difficulties, getDifficulty, type AdventureDifficulty } from "@/lib/game";
import { generateStageQuiz, type QuizOption } from "@/lib/quiz-engine";
import { playBattleSound, playNoteRhythm, type BattleSound } from "@/lib/battle-sound";
import { canUseRewardItem, rewardItemForStage, rewardItems, type RewardItem, type RewardItemId } from "@/lib/reward-items";
import { adventureTitles, campaignIsComplete, clearCollectedTitles, clearTitleCampaignProgress, getCampaignClearTitle, getScoreTitle, getTitleDifficulty, loadCollectedTitleIds, loadTitleCampaignProgress, saveCollectedTitleId, saveTitleCampaignStage, scoreTitleThresholds, type AdventureTitle, type CampaignProgress } from "@/lib/titles";

type Screen = "landing" | "setup" | "dialogue" | "battle" | "result" | "ending";
type BattleLogKind = "quiz" | "card" | "enemy" | "item" | "draw" | "system";
type BattleLogEntry = { id: number; round: number; kind: BattleLogKind; actor: string; text: string; detail?: string };

const battleLogKindLabel: Record<BattleLogKind, string> = { quiz: "퀴즈", card: "카드", enemy: "적", item: "아이템", draw: "드로우", system: "전투" };

function describeAttackNotice(notice: BattleState["attackNotice"]) {
  if (!notice) return undefined;
  const damageLabel = notice.kind === "physical" ? "물리" : "마법";
  if (notice.defense === 0) return `${damageLabel} 피해 ${notice.damage}`;
  if (notice.brokeShield) return `${damageLabel} 방어막 파괴${notice.damage ? ` · 남은 피해 ${notice.damage}` : ""}`;
  return `${damageLabel} 방어막 -${notice.shieldDamage} · 내구도 ${notice.shieldRemaining}`;
}

function describeEnemyAttack(notice: NonNullable<BattleState["enemyAttackNotice"]>) {
  if (notice.damage > 0) return `집중력 -${notice.damage}`;
  if (notice.outcome === "dodge") return "회피 성공 · 빈틈 포착 +2";
  if (notice.outcome === "shield") return "시험 방패로 완전 방어 · 반격 준비 +2";
  return "방어 성공";
}

function formatBattleLogMeta(log: BattleLogEntry) { return `${log.round}R · ${battleLogKindLabel[log.kind]}${log.kind === "quiz" ? "" : ` · ${log.actor}`}`; }

function describeRoundStart(battle: BattleState, difficulty: AdventureDifficulty) {
  return difficulty === "easy" ? `${battle.bossStance} 태세 · ${battle.intent.label} 예정` : `${battle.bossStance} 태세`;
}

function useDialogKeyboard(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirst = () => dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    const timer = window.setTimeout(focusFirst, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusables.length) return;
      const current = document.activeElement;
      const index = focusables.indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0 || current === dialogRef.current)) { event.preventDefault(); focusables.at(-1)?.focus(); }
      else if (!event.shiftKey && index === focusables.length - 1) { event.preventDefault(); focusables[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", onKeyDown); window.setTimeout(() => returnFocusRef.current?.focus(), 0); };
  }, [open]);
  return dialogRef;
}

function getCardPreview(battle: BattleState, card: CombatCard) {
  if (card.effect === "physical" || card.effect === "magic") {
    const defense = card.effect === "physical" ? battle.bossArmor : battle.bossBarrier;
    const label = card.effect === "physical" ? "물리 방어" : "마법 결계";
    const bonus = card.effect === "physical" && defense === 0 ? card.exposedBonus ?? 0 : 0;
    const power = card.power + battle.attackBoost + bonus;
    const bypass = Math.min(card.pierce ?? 0, power);
    const shieldDamage = Math.min(defense, Math.max(0, power - bypass));
    const damage = defense > 0 ? bypass + Math.max(0, power - bypass - defense) : power * (battle.confusedTurns > 0 ? 2 : 1);
    return defense > 0 ? `${label} ${defense} → ${defense - shieldDamage} · 피해 ${damage}` : `보스 HP ${battle.bossHp} → ${Math.max(0, battle.bossHp - damage)}`;
  }
  if (card.effect === "heal") return `집중력 ${battle.playerHp} → ${Math.min(battle.maxPlayerHp, battle.playerHp + card.power)}`;
  if (card.effect === "analyze") return `방어·결계 ${Math.max(battle.bossArmor, battle.bossBarrier)} → ${Math.max(0, Math.max(battle.bossArmor, battle.bossBarrier) - card.power)}`;
  if (card.effect === "guard" || card.effect === "focus-guard") return "다음 물리 공격 완전 방어";
  if (card.effect === "dodge") return "다음 보스 공격 완전 회피";
  if (card.effect === "magic-ward") return `다음 마법 피해 -${card.power}`;
  if (card.effect === "boost") return `다음 직접 공격 +${card.power}`;
  return "손패 2장 새로 뽑기";
}

const PRELOAD_DIAGRAMS = [
  "/music-diagrams/diagram-note-anatomy.svg",
  "/music-diagrams/diagram-rhythm-tree.svg",
  "/music-diagrams/diagram-rest-intro.svg",
  "/music-diagrams/diagram-time-signatures.svg",
  "/music-diagrams/diagram-time-read.svg",
  "/music-diagrams/diagram-time-4-4.svg",
  "/music-diagrams/diagram-time-3-4.svg",
  "/music-diagrams/diagram-time-2-4.svg",
  "/music-diagrams/diagram-time-6-8.svg",
  "/music-diagrams/diagram-staff-basic.svg",
  "/music-diagrams/diagram-treble-clef-notes.svg",
  "/music-diagrams/diagram-bass-clef-notes.svg",
  "/music-diagrams/diagram-grand-staff.svg",
  "/music-diagrams/diagram-dynamics-scale.svg",
  "/music-diagrams/diagram-tempo-scale.svg",
  "/music-diagrams/diagram-primary-triads.svg",
  "/music-diagrams/diagram-instrument-families.svg",
  "/music-diagrams/staff-treble-c.svg",
  "/music-diagrams/staff-treble-sol.svg",
  "/music-diagrams/staff-bass-c.svg",
  "/music-diagrams/staff-bass-fa.svg",
];

const preloadedDiagramSet = new Set<string>();
function preloadDiagramImages(urls: string[]) {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (!url || preloadedDiagramSet.has(url)) continue;
    preloadedDiagramSet.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [stageId, setStageId] = useState<StageId>(1);
  const [characterId, setCharacterId] = useState<(typeof characters)[number]["id"]>("bau");
  const [difficulty, setDifficulty] = useState<AdventureDifficulty>("normal");
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [resolvedChoice, setResolvedChoice] = useState<number | null>(null);
  const [choiceFeedback, setChoiceFeedback] = useState("");
  const [unlocked, setUnlocked] = useState<StageId>(1);
  const [resetOpen, setResetOpen] = useState(false);
  const [session, setSession] = useState("range-v3");
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [battleLogs, setBattleLogs] = useState<BattleLogEntry[]>([]);
  const battleLogId = useRef(0);
  const [answered, setAnswered] = useState<QuizOption | null>(null);
  const [quizHit, setQuizHit] = useState(false);
  const [ownedItems, setOwnedItems] = useState<RewardItemId[]>([]);
  const [usedItems, setUsedItems] = useState<RewardItemId[]>([]);
  const [earnedItem, setEarnedItem] = useState<RewardItem | null>(null);
  const [earnedTitles, setEarnedTitles] = useState<AdventureTitle[]>([]);
  const [collectedTitleIds, setCollectedTitleIds] = useState<string[]>([]);
  const [titleCampaignProgress, setTitleCampaignProgress] = useState<CampaignProgress>({});
  // 📱 스마트폰 접속 원천 차단 및 PC/태블릿 이용 안내 오버레이 상태 (꼬매팡 스타일)
  const [showMobileNotice, setShowMobileNotice] = useState<boolean>(false);

  const stage = stages[stageId - 1];
  const character = characters.find((item) => item.id === characterId) ?? characters[0];
  const node = stage.dialogue[dialogueIndex];
  const quiz = useMemo(
    () => generateStageQuiz(stageId, battle?.round ?? 1, session),
    [stageId, battle?.round, session],
  );

  useEffect(() => {
    const checkDeviceSize = () => {
      if (typeof window !== "undefined") {
        // 스마트폰 여부 판별: 가로/세로 중 짧은 변(단변)이 600px 미만인 소형 모바일 기기 (회전해도 차단 유지)
        // iPad, 갤럭시 탭 등 대화면 태블릿(단변 700px 이상) 및 PC/노트북은 정상 허용
        const shortestDimension = Math.min(window.innerWidth, window.innerHeight);
        setShowMobileNotice(shortestDimension < 600);
      }
    };
    checkDeviceSize();
    window.addEventListener("resize", checkDeviceSize);
    window.addEventListener("orientationchange", checkDeviceSize);
    return () => {
      window.removeEventListener("resize", checkDeviceSize);
      window.removeEventListener("orientationchange", checkDeviceSize);
    };
  }, []);

  // 🚀 다이어그램 사전 백그라운드 프리로드 (첫 등장 시 0ms 즉각 렌더링)
  useEffect(() => {
    const idleTimer = window.setTimeout(() => {
      preloadDiagramImages(PRELOAD_DIAGRAMS);
    }, 150);
    return () => window.clearTimeout(idleTimer);
  }, []);

  // 현재 스테이지 진입/변경 시 해당 스테이지의 visual 이미지 즉시 우선 캐싱
  useEffect(() => {
    const stageVisuals: string[] = [];
    for (const d of stage.dialogue) {
      if (d.visual?.src) stageVisuals.push(d.visual.src);
      if (d.visual?.items) {
        for (const it of d.visual.items) {
          if (it.src) stageVisuals.push(it.src);
        }
      }
    }
    preloadDiagramImages(stageVisuals);
  }, [stageId, stage]);

  useEffect(() => { const timer = window.setTimeout(() => { setUnlocked(loadUnlockedStage(localStorage)); setOwnedItems(loadRewardItems(localStorage)); setUsedItems(loadUsedRewardItems(localStorage)); setCollectedTitleIds(loadCollectedTitleIds(localStorage)); setTitleCampaignProgress(loadTitleCampaignProgress(localStorage)); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { document.documentElement.classList.toggle("quiz-hit", quizHit); return () => document.documentElement.classList.remove("quiz-hit"); }, [quizHit]);
  useEffect(() => { if (!quizHit) return; const timer = window.setTimeout(() => setQuizHit(false), 820); return () => window.clearTimeout(timer); }, [quizHit]);
  useEffect(() => { const enemyTurn = screen === "battle" && battle?.phase === "enemy" && !battleFinished(battle); document.documentElement.classList.toggle("enemy-turn", enemyTurn); return () => document.documentElement.classList.remove("enemy-turn"); }, [battle, screen]);
  useEffect(() => { const recover = (event: Event) => { const amount = event instanceof CustomEvent ? event.detail : 0; if (screen === "battle" && battle) { const next = recoverComboHp(battle, amount); setBattle(next); if (next !== battle) addBattleLog({ actor: "정답 연쇄", detail: `집중력 +${amount}`, kind: "system", round: battle.round, text: "연쇄 보상 회복" }); } }; window.addEventListener("combo-recover", recover); return () => window.removeEventListener("combo-recover", recover); }, [battle, screen]);
  useEffect(() => { if (screen !== "battle" || !battle || battle.phase !== "enemy" || battleFinished(battle)) return; const timer = window.setTimeout(() => { triggerBattleEffect("stance"); const next = advanceBattleRound(battle, stageId, difficulty, session); setBattle(next); addBattleLog({ actor: "시스템", detail: describeRoundStart(next, difficulty), kind: "system", round: next.round, text: `${next.round}라운드 시작` }); setAnswered(null); }, 1100); return () => window.clearTimeout(timer); }, [battle, difficulty, screen, session, stageId]);
  useEffect(() => {
    if (screen !== "battle" || battle?.phase !== "reward") return;
    // 오답일 때는 해설을 충분히 읽고 사용자가 직접 '다시 도전하기' 버튼을 누를 때까지 대기
    if (!answered?.isCorrect) return;
    const timer = window.setTimeout(() => {
      setBattle(beginActionPhase(battle));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [answered, battle, screen]);
  function beginStage() { setDialogueIndex(0); setResolvedChoice(null); setChoiceFeedback(""); setScreen("dialogue"); }
  function chooseDialogue(choice: DialogueChoice, index: number) { playBattleSound(choice.correct ? "correct" : "wrong"); setResolvedChoice(choice.correct ? index : -1); setChoiceFeedback(choice.feedback); }
  function nextDialogue() { if ((node.choices || node.multiCheck || node.task) && (resolvedChoice === null || resolvedChoice === -1)) return; if (dialogueIndex < stage.dialogue.length - 1) { setDialogueIndex((value) => value + 1); setResolvedChoice(null); setChoiceFeedback(""); return; } startBattle(); }
  function prevDialogue() { if (dialogueIndex > 0) { setDialogueIndex((value) => value - 1); setResolvedChoice(null); setChoiceFeedback(""); } }
  function addBattleLog(entry: Omit<BattleLogEntry, "id">) { battleLogId.current += 1; setBattleLogs((logs) => [...logs, { ...entry, id: battleLogId.current }].slice(-10)); }
  function startBattle() { const nextSession = `${Date.now()}-${Math.random()}`; const nextBattle = createBattleState(stageId, difficulty, nextSession, character); setSession(nextSession); battleLogId.current = 0; setBattleLogs([]); setBattle(nextBattle); addBattleLog({ actor: "시스템", detail: describeRoundStart(nextBattle, difficulty), kind: "system", round: 1, text: "전투 시작" }); setAnswered(null); setQuizHit(false); setEarnedItem(null); setEarnedTitles([]); setScreen("battle"); }
  function triggerBattleEffect(effect: BattleSound) { playBattleSound(effect); }
  function answerQuiz(option: QuizOption) { if (!battle || answered || battle.phase !== "quiz") return; triggerBattleEffect(option.isLucky ? "lucky" : option.isBomb ? "bomb" : option.isCorrect ? "correct" : "wrong"); const next = rewardQuizAnswer(battle, option.isCorrect, option.isLucky, option.isBomb); setAnswered(option); setQuizHit(!option.isCorrect); setBattle(next); addBattleLog({ actor: "퀴즈", detail: option.isCorrect ? `행동력 +${next.energy}${option.isLucky ? " · 럭키 정답" : ""}` : `집중력 -${battle.playerHp - next.playerHp}${option.isBomb ? " · 폭탄 오답" : ""}`, kind: "quiz", round: battle.round, text: option.isCorrect ? "정답 선택" : "오답 선택" }); }
  function continueToAction() { if (!battle || battle.phase !== "reward" || !answered?.isCorrect) return; setBattle(beginActionPhase(battle)); }

  function retryQuiz() { if (!battle || battle.phase !== "reward") return; if (battle.playerHp <= 0) { setScreen("result"); return; } setBattle(retryQuizAfterWrong(battle)); setAnswered(null); }
  function playCard(card: CombatCard) { if (!battle) return; triggerBattleEffect(card.effect === "magic" ? "magic" : card.effect === "guard" || card.effect === "focus-guard" || card.effect === "magic-ward" || card.effect === "heal" ? "guard" : card.effect === "dodge" ? "dodge" : "physical"); const next = playCombatCard(battle, card.instanceId); setBattle(next); const supportDetails: Partial<Record<CombatCard["effect"], string>> = { guard: "다음 물리 공격 무효", "focus-guard": "물리 무효 · 집중력 +2", "magic-ward": `마법 피해 ${card.power} 감소`, dodge: "다음 공격 완전 회피", heal: `집중력 +${card.power}`, boost: `다음 직접 공격 +${card.power}`, analyze: `방어·결계 -${card.power}`, accelerate: "오래된 카드 버림 · 2장 드로우" }; addBattleLog({ actor: battle.playerName, detail: describeAttackNotice(next.attackNotice) ?? supportDetails[card.effect] ?? next.message, kind: "card", round: battle.round, text: `${card.name} 사용` }); }
  function redraw() { if (!battle) return; const next = redrawHand(battle, stageId, session); setBattle(next); addBattleLog({ actor: battle.playerName, detail: `카드 ${battle.hand.length}장 교체 · 행동력 -2`, kind: "draw", round: battle.round, text: "새로 뽑기" }); }
  function useItem(itemId: RewardItemId) {
    if (!battle || !ownedItems.includes(itemId) || usedItems.includes(itemId) || !canUseRewardItem(itemId, battle.phase)) return;
    const next = applyRewardItem(battle, itemId); setBattle(next); addBattleLog({ actor: "가방", detail: next.message, kind: "item", round: battle.round, text: rewardItems.find((item) => item.id === itemId)?.name ?? "고유 수정 사용" });
    const nextUsed = [...usedItems, itemId]; setUsedItems(nextUsed); saveUsedRewardItems(localStorage, nextUsed);
  }
  function endTurn() { if (!battle) return; triggerBattleEffect("enemy"); const next = resolveEnemyTurn(battle); setBattle(next); const defeated = next.bossHp <= 0; const detail = next.enemyAttackNotice ? describeEnemyAttack(next.enemyAttackNotice) : defeated ? next.message : battle.confusedTurns > 0 ? "혼란으로 공격을 건너뜀" : battle.intent.type === "prepare" ? "공격을 준비함" : next.message; addBattleLog({ actor: stage.bossShortName, detail, kind: "enemy", round: battle.round, text: next.enemyAttackNotice ? battle.intent.label : defeated ? "보스 격파" : battle.confusedTurns > 0 ? "행동 불가" : "행동 준비" }); }
  function continueAfterEnemy() { if (!battle) return; if (battleFinished(battle)) { finishBattle(battle); return; } triggerBattleEffect("stance"); setBattle(advanceBattleRound(battle, stageId, difficulty, session)); setAnswered(null); }
  function finishBattle(finalState: BattleState) { setBattle(finalState); if (battleWon(finalState)) { const nextUnlocked = Math.min(5, Math.max(unlocked, stageId + 1)) as StageId; setUnlocked(nextUnlocked); saveUnlockedStage(localStorage, nextUnlocked); const reward = rewardItemForStage(stageId); if (reward && !ownedItems.includes(reward.id)) { const nextItems = [...ownedItems, reward.id]; setOwnedItems(nextItems); saveRewardItems(localStorage, nextItems); setEarnedItem(reward); } const campaignProgress = saveTitleCampaignStage(localStorage, titleCampaignProgress, characterId, difficulty, stageId); setTitleCampaignProgress(campaignProgress); let nextCollectedIds = collectedTitleIds; const newlyEarned: AdventureTitle[] = []; const collectTitle = (title: AdventureTitle | undefined) => { if (!title || nextCollectedIds.includes(title.id)) return; nextCollectedIds = saveCollectedTitleId(localStorage, title.id); newlyEarned.push(title); }; const scoreTitle = getScoreTitle(characterId, difficulty); if (finalState.score >= scoreTitleThresholds[difficulty]) collectTitle(scoreTitle); if (stageId === 5 && campaignIsComplete(campaignProgress, characterId, difficulty)) collectTitle(getCampaignClearTitle(characterId, difficulty, nextCollectedIds)); if (newlyEarned.length > 0) { setCollectedTitleIds(nextCollectedIds); setEarnedTitles(newlyEarned); } } setScreen("result"); }
  function resetProgress() { clearAdventureProgress(localStorage); clearCollectedTitles(localStorage); clearTitleCampaignProgress(localStorage); setUnlocked(1); setStageId(1); setOwnedItems([]); setUsedItems([]); setEarnedItem(null); setEarnedTitles([]); setCollectedTitleIds([]); setTitleCampaignProgress({}); setResetOpen(false); }

  function handleRefreshTitles(): string[] {
    if (typeof window !== "undefined") {
      const latest = loadCollectedTitleIds(localStorage);
      setCollectedTitleIds(latest);
      return latest;
    }
    return collectedTitleIds;
  }

  let currentView: React.ReactNode = null;
  if (screen === "landing") {
    currentView = <Landing collectedTitleIds={collectedTitleIds} onRefreshTitles={handleRefreshTitles} onStart={() => setScreen("setup")} />;
  } else if (screen === "setup") {
    currentView = <Setup characterId={characterId} difficulty={difficulty} onBack={() => setScreen("landing")} onCancelReset={() => setResetOpen(false)} onCharacter={setCharacterId} onConfirmReset={resetProgress} onDifficulty={setDifficulty} onOpenReset={() => setResetOpen(true)} onStage={setStageId} onStart={beginStage} resetOpen={resetOpen} selectedStage={stageId} unlocked={unlocked} />;
  } else if (screen === "dialogue") {
    currentView = <Dialogue character={character} choiceFeedback={choiceFeedback} node={node} nodeIndex={dialogueIndex} onBack={() => setScreen("setup")} onChoice={chooseDialogue} onMultiResolved={() => { playBattleSound("correct"); setResolvedChoice(0); }} onNext={nextDialogue} onPrev={prevDialogue} onRetryChoice={() => { setResolvedChoice(null); setChoiceFeedback(""); }} onSkip={startBattle} onTaskResolved={() => { playBattleSound("correct"); setResolvedChoice(0); }} resolvedChoice={resolvedChoice} stage={stage} />;
  } else if (screen === "battle" && battle) {
    currentView = <Battle answered={answered} battle={battle} character={character} difficulty={difficulty} logs={battleLogs} onAnswer={answerQuiz} onContinueEnemy={continueAfterEnemy} onContinueToAction={continueToAction} onEndTurn={endTurn} onExit={() => setScreen("setup")} onPlayCard={playCard} onRedraw={redraw} onRetryQuiz={retryQuiz} onUseItem={useItem} ownedItems={ownedItems} quiz={quiz} stage={stage} usedItems={usedItems} />;
  } else if (screen === "result" && battle) {
    currentView = <Result earnedItem={earnedItem} earnedTitles={earnedTitles} onNext={() => { if (battleWon(battle) && stageId < 5) { setStageId((stageId + 1) as StageId); setDialogueIndex(0); setResolvedChoice(null); setChoiceFeedback(""); setScreen("dialogue"); } else if (battleWon(battle)) setScreen("ending"); else startBattle(); }} onSetup={() => setScreen("setup")} score={battle.score} stage={stage} won={battleWon(battle)} />;
  } else {
    currentView = <Ending character={character} collectedTitleIds={collectedTitleIds} onMain={() => setScreen("landing")} onRefreshTitles={handleRefreshTitles} score={battle?.score ?? 0} />;
  }

  return (
    <>
      {currentView}
      {showMobileNotice && <MobileRestrictionNotice />}
    </>
  );
}

function Landing({ collectedTitleIds, onRefreshTitles, onStart }: { collectedTitleIds: string[]; onRefreshTitles: () => string[]; onStart: () => void }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [titleCollectionOpen, setTitleCollectionOpen] = useState(false);

  const handleOpenTitles = () => {
    onRefreshTitles();
    setTitleCollectionOpen(true);
  };

  return (
    <main className="landing-page">
      <div className="pixel-grid" />
      <section aria-label="럭키팡: 문장던전 - 문장 성분과 호응 관계" className="landing-shell">
        <div className="landing-art-card">
          <img alt="럭키팡: 문장던전 - 문장 성분과 호응 관계" className="landing-art" src="/luckypang_munjang_landing.webp" />
        </div>
        <div className="landing-actions">
          <button className="landing-button start" onClick={onStart}>
            시작하기! <span aria-hidden="true">🏰</span>
          </button>
          <div className="landing-action-row">
            <button className="landing-button help" onClick={() => setGuideOpen(true)}>
              사용 안내 <span aria-hidden="true">📖</span>
            </button>
            <button
              aria-label={`칭호 도감, ${collectedTitleIds.length}개 획득`}
              className="title-cabinet-button"
              onClick={handleOpenTitles}
              type="button"
            >
              <i aria-hidden="true">🏅</i>
              <b>칭호 도감</b>
              <span>{collectedTitleIds.length} / {adventureTitles.length}</span>
            </button>
          </div>
        </div>
      </section>
      {guideOpen && <LandingGuide onClose={() => setGuideOpen(false)} />}
      {titleCollectionOpen && (
        <TitleCollection
          collectedTitleIds={collectedTitleIds}
          onClose={() => setTitleCollectionOpen(false)}
          onRefresh={onRefreshTitles}
        />
      )}
    </main>
  );
}

function TitleCollection({ collectedTitleIds, onClose, onRefresh }: { collectedTitleIds: string[]; onClose: () => void; onRefresh?: () => string[] }) {
  const [characterId, setCharacterId] = useState<(typeof characters)[number]["id"]>("bau");
  const [difficulty, setDifficulty] = useState<AdventureDifficulty>("easy");
  const [currentCollected, setCurrentCollected] = useState<string[]>(collectedTitleIds);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // 모달 진입 시 로컬스토리지 최신 칭호 목록 자동 동기화
  useEffect(() => {
    if (typeof window !== "undefined") {
      const timer = window.setTimeout(() => {
        const latest = onRefresh ? onRefresh() : loadCollectedTitleIds(localStorage);
        setCurrentCollected(latest);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [collectedTitleIds, onRefresh]);

  const handleManualRefresh = () => {
    if (typeof window !== "undefined") {
      const latest = onRefresh ? onRefresh() : loadCollectedTitleIds(localStorage);
      setCurrentCollected(latest);
      setRefreshNotice("✨ 칭호 도감이 최신 상태로 새로고침되었습니다!");
      const timer = window.setTimeout(() => setRefreshNotice(null), 2500);
      return () => window.clearTimeout(timer);
    }
  };

  const collected = new Set(currentCollected);
  const titles = adventureTitles.filter((title) => title.characterId === characterId && title.difficulty === difficulty);
  const detail = getTitleDifficulty(difficulty);

  return (
    <div className="title-collection-backdrop" onMouseDown={onClose}>
      <section aria-labelledby="title-collection-title" aria-modal="true" className="title-collection-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div className="title-collection-top-actions">
          <button aria-label="최신 칭호 새로고침" className="title-collection-refresh-btn" onClick={handleManualRefresh} type="button">
            <i aria-hidden="true">🔄</i> 최신 칭호 새로고침
          </button>
          <button aria-label="칭호 도감 닫기" className="title-collection-close" onClick={onClose} type="button">×</button>
        </div>
        <header className="title-collection-header">
          <span aria-hidden="true">🏅</span>
          <div>
            <h2 id="title-collection-title">칭호 도감 <b>{currentCollected.length} / {adventureTitles.length}</b></h2>
            <p>전 스테이지 완주 또는 점수 도전으로 칭호를 얻어요.</p>
          </div>
        </header>
        {refreshNotice && (
          <div aria-live="polite" className="title-refresh-notice" role="status">
            {refreshNotice}
          </div>
        )}
        <div aria-label="캐릭터 선택" className="title-character-tabs">
          {characters.map((character) => (
            <button aria-pressed={characterId === character.id} className={characterId === character.id ? "selected" : ""} key={character.id} onClick={() => setCharacterId(character.id)} type="button">
              <img alt="" src={character.image} />{character.name}
            </button>
          ))}
        </div>
        <div aria-label="난이도 선택" className="title-difficulty-tabs">
          {difficulties.map((item) => (
            <button aria-pressed={difficulty === item.id} className={`${item.id} ${difficulty === item.id ? "selected" : ""}`} key={item.id} onClick={() => setDifficulty(item.id)} type="button">
              <i>{getTitleDifficulty(item.id).mark}</i>{item.name}
              <small>{adventureTitles.filter((title) => title.characterId === characterId && title.difficulty === item.id && collected.has(title.id)).length} / 6</small>
            </button>
          ))}
        </div>
        <div aria-label={`${characters.find((character) => character.id === characterId)?.name} ${detail.label} 칭호 목록`} className="title-badge-grid">
          {titles.map((title) => {
            const isCollected = collected.has(title.id);
            return (
              <article className={`title-badge ${isCollected ? "collected" : "locked"}`} key={title.id} style={{ "--title-color": detail.color } as React.CSSProperties}>
                <i>{title.kind === "score" ? "✹" : detail.mark}</i>
                <small>{title.condition}</small>
                <strong>{isCollected ? title.name : "???"}</strong>
                <em>{isCollected ? "획득함" : title.kind === "score" ? "점수 도전" : "미획득"}</em>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function LandingGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="landing-guide-backdrop" onMouseDown={onClose}>
      <section aria-labelledby="landing-guide-title" aria-modal="true" className="landing-guide" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <button aria-label="사용 안내 닫기" className="guide-close" onClick={onClose} type="button">×</button>
        <p className="eyebrow">HOW TO PLAY · 초등 국어 문법 모험</p>
        <h2 id="landing-guide-title">럭키팡: 문장던전 사용 안내</h2>
        <p style={{ fontSize: "0.92rem", color: "#64748b", margin: "-6px 0 16px 0", fontWeight: 600 }}>
          부제: 문장 성분과 호응 관계 (초등 3~6학년 국어 교과 연계)
        </p>

        <section className="guide-section">
          <h3>이렇게 모험해요</h3>
          <ol>
            <li><b>1</b><span><strong>탐험을 준비해요.</strong>수호자 캐릭터, 난이도(쉬움·보통·어려움), 도전할 스테이지를 선택합니다.</span></li>
            <li><b>2</b><span><strong>이야기와 확인문제를 풀어요.</strong>글별이와의 대화를 읽고 문법 원리를 배운 뒤 빈칸 채우기·선 잇기·문장 순서 맞추기 실습을 풉니다.</span></li>
            <li><b>3</b><span><strong>전투 퀴즈를 맞혀요.</strong>정답 카드(일반 +2, 럭키 +3)로 이번 턴 행동력을 얻고 손패에 새 카드를 보충합니다.</span></li>
            <li><b>4</b><span><strong>카드를 내고 요괴를 물리쳐요.</strong>행동력 안에서 공격·방어·회피·마법 카드를 조합해 요괴 보스의 HP를 0으로 만들면 다음 모험이 열립니다.</span></li>
          </ol>
        </section>

        <section className="guide-section">
          <h3>전투는 이렇게 해요 (카드 덱빌딩 전략)</h3>
          <ol>
            <li><b>1</b><span><strong>퀴즈 카드 5장 중 정답은 3장이에요.</strong>일반 정답은 행동력 2, 럭키 정답은 행동력 3을 줘요. 폭탄 카드는 오답이니 조심해서 피하세요!</span></li>
            <li><b>2</b><span><strong>행동력만큼 카드를 조합해요.</strong>카드 왼쪽 위 숫자(비용)만큼 행동력이 필요하며, 남은 행동력 안에서 여러 장의 카드를 전략적으로 조합해 낼 수 있어요.</span></li>
            <li><b>3</b><span><strong>보스 태세와 약점을 살펴봐요.</strong>물리 방어를 올린 보스에게는 마법 카드로 결계를 뚫고, 마법 결계를 두른 보스에게는 공격 카드로 약점을 공략하세요.</span></li>
            <li><b>4</b><span><strong>적 공격 대비 & 손패 새로고침:</strong>내 턴이 끝나면 보스가 반격하므로 수비(방패), 회피, 회복 카드로 대비하세요. 낼 카드가 없다면 행동력 2로 손패 2장을 새로 뽑을 수 있어요.</span></li>
          </ol>
        </section>

        <section className="guide-section">
          <h3>스테이지별 핵심 학습 목표 (5대 챕터)</h3>
          <p>🌿 <b>1단계: 주어의 숲</b> — 문장에서 행동이나 상태의 주인공인 <b>주어</b>({"'누가/무엇이', '이/가'"})의 개념과 바른 쓰임새 익히기</p>
          <p>❄️ <b>2단계: 서술어의 빙하</b> — 주어의 동작, 상태, 성질을 나타내고 문장을 끝맺는 <b>서술어</b>({"'어찌하다/어떠하다/무엇이다'"}) 완성하기</p>
          <p>🗼 <b>3단계: 목적어의 탑</b> — 동작이 향하는 대상인 <b>목적어</b>({"'무엇을', '을/를'"})를 찾고 [주어-목적어-서술어]의 완전한 3단 구조 조립하기</p>
          <p>🏛️ <b>4단계: 시간과 높임의 신전</b> — 어제·오늘·내일의 <b>시간 표현 호응</b>과 웃어른을 공경하는 <b>바른 높임 표현 호응</b> 배우기</p>
          <p>✨ <b>5단계: 혼돈의 성</b> — {"'결코/전혀'"}의 <b>부정 호응</b>과 {"'왜냐하면 ~ 때문이다'"}의 <b>까닭(인과) 호응</b>, 그리고 바른 문장 총결산</p>
        </section>

        <section className="guide-section">
          <h3>수호자 캐릭터와 난이도</h3>
          <p><b>바우</b>는 문장의 든든한 수호자(기본 물리 방어 4), <b>아라</b>는 낱말 탐험가(물리·마법 방어 각 2 밸런스), <b>나래</b>는 호응의 조율사(기본 마법 결계 4)예요.</p>
          <p><b>쉬움</b>은 집중력이 높고 보스가 약하며 힌트 보기(문법 개념표)가 제공돼요. <b>보통</b>은 표준 난이도, <b>어려움</b>은 강력한 보스를 상대하는 심화 배틀이에요.</p>
        </section>

        <section className="guide-section">
          <h3>고유 유물 및 칭호 도감 수집</h3>
          <p>스테이지 1~4 보스를 처음 물리치면 고유 유물을 얻어요. 전투 중 가방에서 사용할 수 있지만, <b>한 게임 진행 전체에서 유물별로 한 번만</b> 사용할 수 있는 비장의 수단이에요.</p>
          <p>각 캐릭터와 난이도별 완주 및 고득점 도전을 통해 <b>총 15종의 모험 칭호</b>를 도감에 영구 수집할 수 있어요.</p>
        </section>

        <section className="guide-section">
          <h3>권장 플레이 환경</h3>
          <p>럭키팡: 문장던전은 다채로운 국어 문장 탐구와 3D 문법 개념표, 문장 조립 실습을 위해 <b>PC 및 태블릿(가로 화면) 환경</b>에 최적화되어 있습니다. (스마트폰 접속 시 전용 안내 화면 제공)</p>
        </section>

        <section className="guide-section">
          <h3>이미지 안내</h3>
          <p><b>게임 속 일부 캐릭터와 배경 이미지는 AI 이미지 생성 도구를 활용해 제작했습니다.</b></p>
        </section>

        <button className="guide-confirm" onClick={onClose} type="button">모험 준비 완료</button>
      </section>
    </div>
  );
}

const stageSymbols: Record<number, React.ReactNode> = {
  1: "주어",
  2: "서술",
  3: "목적",
  4: "호응",
  5: "완성",
};

const stageDisplayLabels: Record<number, string> = {
  1: "주어",
  2: "서술어",
  3: "목적어",
  4: "시간과 높임",
  5: "부정 및 서술어+전체복습",
};

const simpleDifficultyDesc: Record<string, string> = {
  easy: "차근차근 집중해서 배워요",
  normal: "기본 모험 난이도예요",
  hard: "도전적인 보스 배틀이에요",
};

function Setup({ characterId, difficulty, onBack, onCancelReset, onCharacter, onConfirmReset, onDifficulty, onOpenReset, onStage, onStart, resetOpen, selectedStage, unlocked }: { characterId: string; difficulty: AdventureDifficulty; onBack: () => void; onCancelReset: () => void; onCharacter: (id: (typeof characters)[number]["id"]) => void; onConfirmReset: () => void; onDifficulty: (id: AdventureDifficulty) => void; onOpenReset: () => void; onStage: (id: StageId) => void; onStart: () => void; resetOpen: boolean; selectedStage: StageId; unlocked: StageId }) {
  const selected = stages[selectedStage - 1]; const selectedCharacter = characters.find((item) => item.id === characterId) ?? characters[0]; const selectedDifficulty = getDifficulty(difficulty);
  return (
    <main className="setup-page">
      <section className="setup-shell">
        <header className="topbar">
          <button onClick={onBack}>← 처음으로</button>
          <div>
            <h1>모험 준비</h1>
          </div>
          <button onClick={onOpenReset}>진행 기록 초기화</button>
        </header>

        <section className="setup-block">
          <SectionTitle icon="✨" number="01" subtitle="모험을 함께할 수호자를 고르세요" title="수호자 선택" />
          <div className="character-grid">
            {characters.map((item) => (
              <button aria-pressed={characterId === item.id} className={characterId === item.id ? "selected" : ""} key={item.id} onClick={() => onCharacter(item.id)}>
                <img alt="" src={item.image} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.role}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-block">
          <SectionTitle icon="⚖️" number="02" subtitle="자신에게 알맞은 난이도를 고르세요" title="난이도 선택" />
          <div className="difficulty-grid">
            {difficulties.map((item) => (
              <button aria-pressed={difficulty === item.id} className={difficulty === item.id ? "selected" : ""} key={item.id} onClick={() => onDifficulty(item.id)}>
                <strong>{item.name} 모드</strong>
                <small>{simpleDifficultyDesc[item.id] ?? item.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-block">
          <SectionTitle icon="📜" number="03" subtitle="도전할 스테이지를 고르세요" title="스테이지 선택" />
          <div className="stage-grid">
            {stages.map((item) => {
              const locked = item.id > unlocked;
              return (
                <button
                  className={`${selectedStage === item.id ? "selected" : ""} ${locked ? "locked" : ""}`}
                  disabled={locked}
                  key={item.id}
                  onClick={() => onStage(item.id)}
                  style={{ "--stage-accent": item.color } as React.CSSProperties}
                >
                  <span>{locked ? "🔒" : (stageSymbols[item.id] ?? item.id)}</span>
                  <strong>{stageDisplayLabels[item.id] ?? item.shortTitle}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="setup-summary">
          <div>
            <img alt="" src={selectedCharacter.image} />
            <p>
              <small>출격 준비 완료</small>
              <strong>{selectedCharacter.name} · {selectedDifficulty.name} 난이도</strong>
              <em>STAGE {selected.id}. {stageDisplayLabels[selected.id]}</em>
            </p>
          </div>
          <button onClick={onStart}>문장 모험 출발! →</button>
        </footer>
      </section>
      {resetOpen && <ConfirmReset onCancel={onCancelReset} onConfirm={onConfirmReset} />}
    </main>
  );
}

function SectionTitle({ icon = "📜", number, subtitle, title }: { icon?: React.ReactNode; number: string; subtitle: string; title: string }) {
  return (
    <div className="section-title">
      <b>{icon}</b>
      <div>
        <h2><span>{number}.</span> {title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function ConfirmReset({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <span>↻</span>
        <p className="eyebrow">PROGRESS RESET</p>
        <h2 id="reset-title">진행 기록을 지울까요?</h2>
        <p>이 기기에 저장된 스테이지 완료 기록이 사라집니다.</p>
        <div>
          <button onClick={onCancel}>아니요</button>
          <button onClick={onConfirm}>초기화할게요</button>
        </div>
      </section>
    </div>
  );
}

/**
 * 인물 대사가 2문장 이상인 경우, 문맥과 호흡에 맞추어 깔끔하게 2줄로 줄바꿈해주는 스마트 포맷터
 * - 이미 \n 개행이 있는 경우: 작성자의 수동 줄바꿈 1순위 존중
 * - 따옴표('...', "...") 내부의 문장부호(!, ?, .)는 분할 지점에서 배제
 * - 문두 6글자 이하의 짧은 감탄사("수호자님!", "아하!", "크히히!") 바로 뒤는 배제 (다음 문장과 함께 묶음)
 * - 2문장이면 첫 문장 끝에서 줄바꿈, 3문장 이상이면 전체 길이의 50%에 가장 가까운 지점에서 2줄 분할
 */
export function formatDialogueSpeech(text: string): string {
  if (!text || text.includes("\n")) return text;

  const splitPoints: number[] = [];
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < text.length - 1; i += 1) {
    const char = text[i];
    if (char === "'" || char === "‘" || char === "’") inSingleQuote = !inSingleQuote;
    else if (char === '"' || char === "“" || char === "”") inDoubleQuote = !inDoubleQuote;

    // 따옴표 바깥이고 종결 부호([.!?]) 바로 뒤에 공백이 있는 경우
    if (!inSingleQuote && !inDoubleQuote && (char === "." || char === "!" || char === "?")) {
      const nextChar = text[i + 1];
      if (nextChar === " " && i < text.length - 2) {
        // 문두 6자 이하의 짧은 감탄사/호칭 바로 뒤는 단독 분할하지 않고 다음 문장과 묶음
        if (i <= 6) {
          continue;
        }
        splitPoints.push(i + 1);
      }
    }
  }

  if (splitPoints.length === 0) return text;

  if (splitPoints.length === 1) {
    const splitIndex = splitPoints[0]!;
    return `${text.slice(0, splitIndex).trimEnd()}\n${text.slice(splitIndex).trimStart()}`;
  }

  const mid = text.length / 2;
  let bestPoint = splitPoints[0]!;
  let minDiff = Math.abs(bestPoint - mid);

  for (const point of splitPoints) {
    const diff = Math.abs(point - mid);
    if (diff < minDiff) {
      minDiff = diff;
      bestPoint = point;
    }
  }

  return `${text.slice(0, bestPoint).trimEnd()}\n${text.slice(bestPoint).trimStart()}`;
}

function Dialogue({ character, choiceFeedback, node, nodeIndex, onBack, onChoice, onMultiResolved, onNext, onPrev, onRetryChoice, onSkip, onTaskResolved, resolvedChoice, stage }: { character: (typeof characters)[number]; choiceFeedback: string; node: (typeof stages)[number]["dialogue"][number]; nodeIndex: number; onBack: () => void; onChoice: (choice: DialogueChoice, index: number) => void; onMultiResolved: () => void; onNext: () => void; onPrev: () => void; onRetryChoice?: () => void; onSkip: () => void; onTaskResolved: () => void; resolvedChoice: number | null; stage: (typeof stages)[number] }) {
  const [zoomDiagram, setZoomDiagram] = useState<string | null>(null);
  const [tempoSpeedModalOpen, setTempoSpeedModalOpen] = useState(false);
  const isHero = node.speaker === "주인공";
  const isBoss = node.speaker === "보스";
  const speakerName = isHero ? character.name : isBoss ? stage.bossShortName : node.speaker;
  const portrait = isHero ? character.image : isBoss ? stage.bossImage : "/characters/geulbyeol.webp";
  const hasBoard = Boolean((node.visual && node.visual.type !== "guide-wings") || node.task || node.choices || node.multiCheck);
  const canNext = (!node.choices && !node.multiCheck && !node.task) || (resolvedChoice !== null && resolvedChoice >= 0);

  useEffect(() => {
    document.querySelector(".concept-banner small")?.replaceChildren("스테이지 핵심개념");
    function handleDialogueClick(event: MouseEvent) {
      if (!canNext || !(event.target instanceof Element)) return;
      const dialogueBox = event.target.closest(".dialogue-box");
      if (dialogueBox && !event.target.closest("button")) onNext();
    }
    document.addEventListener("click", handleDialogueClick);
    return () => document.removeEventListener("click", handleDialogueClick);
  }, [canNext, onNext]);

  return (
    <main
      className="dialogue-page"
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " " || event.key === "ArrowRight") && canNext && !zoomDiagram && !tempoSpeedModalOpen) {
          onNext();
        } else if (event.key === "ArrowLeft" && nodeIndex > 0 && !zoomDiagram && !tempoSpeedModalOpen) {
          onPrev();
        }
      }}
      style={{ "--stage": stage.color } as React.CSSProperties}
      tabIndex={0}
    >
      <header className="dialogue-bar">
        <button onClick={onBack}>← 메인</button>
        <div>
          <span>STAGE {stage.id}</span>
          <strong>{stage.title}</strong>
        </div>
        <button onClick={onSkip}>대화 건너뛰기</button>
      </header>

      {/* 배경창 (월드 무대 + 중앙 대형 HUD 보드) */}
      <section className="dialogue-world" style={{ backgroundImage: `linear-gradient(180deg,transparent 35%,#08091ddd 83%),url(${stage.background})` }}>
        <img className={`world-hero ${hasBoard ? "board-mode" : ""} ${isHero ? "speaking" : "dim"}`} alt="" src={character.image} />
        <img className={`world-guide ${hasBoard ? "board-mode" : ""} ${node.speaker === "글별이" || node.speaker === "소리별" ? "speaking" : "dim"}`} alt="" src="/characters/geulbyeol.webp" />
        <img className={`world-boss ${hasBoard ? "board-mode" : ""} ${isBoss ? "speaking" : "dim"}`} alt="" src={stage.bossImage} />

        {/* 글별이 양옆 높임표현 듀얼 윙 패널 */}
        {node.visual?.type === "guide-wings" && node.visual.guideWings && (
          <GuideSideWingsVisual wings={node.visual.guideWings} />
        )}

        <div className="concept-banner">
          <small>오늘의 핵심</small>
          <strong>{stage.concept}</strong>
        </div>

        {/* 배경창 중앙 대형 HUD 보드 (개념 다이어그램 및 시각 조작 퀴즈) */}
        {hasBoard && (
          <DialogueStageBoard
            choiceFeedback={choiceFeedback}
            key={`board-${nodeIndex}`}
            node={node}
            nodeIndex={nodeIndex}
            onChoice={onChoice}
            onMultiResolved={onMultiResolved}
            onOpenTempoSpeedModal={() => setTempoSpeedModalOpen(true)}
            onRetryChoice={onRetryChoice}
            onTaskResolved={onTaskResolved}
            onZoomDiagram={(src) => setZoomDiagram(src)}
            resolvedChoice={resolvedChoice}
          />
        )}
      </section>

      {/* 하단 대화창: 오직 순수 대사(스토리)와 진행 버튼만 표시 */}
      <section className="dialogue-box">
        <img alt={`${speakerName} 초상`} src={portrait} />
        <div className="dialogue-copy">
          <header>
            {isBoss ? (
              <div className="dialogue-boss-name">
                <small>{stage.bossTitle}</small>
                <strong>{stage.bossShortName}</strong>
              </div>
            ) : (
              <strong>{speakerName}</strong>
            )}
            <span>{node.choices || node.multiCheck || node.task ? "THEORY QUEST" : "STORY"}</span>
            <i>{nodeIndex + 1} / {stage.dialogue.length}</i>
          </header>
          <p className="dialogue-speech-text">{formatDialogueSpeech(node.text)}</p>
        </div>
        <div className="dialogue-nav-buttons">
          <button
            className="prev-button"
            disabled={nodeIndex === 0}
            onClick={onPrev}
            type="button"
          >
            ← 이전
          </button>
          <button
            className="next-button"
            disabled={!canNext}
            onClick={onNext}
            type="button"
          >
            {nodeIndex === stage.dialogue.length - 1 ? "전투 시작" : "다음"} →
          </button>
        </div>
      </section>

      <p className="dialogue-hint">대화창을 선택한 뒤 [Enter / Space / →] 다음, [←] 이전으로 이동할 수 있어요</p>

      {zoomDiagram && (
        <div className="diagram-modal-backdrop" onClick={() => setZoomDiagram(null)}>
          <div className="diagram-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>📖 국어 문법 개념 안내표</h3>
              <button onClick={() => setZoomDiagram(null)} type="button">닫기 ✕</button>
            </header>
            <div className="diagram-modal-body">
              <img alt="국어 문법 개념 안내표 크게 보기" decoding="async" src={zoomDiagram} />
            </div>
          </div>
        </div>
      )}

      {tempoSpeedModalOpen && (
        <div className="diagram-modal-backdrop" onClick={() => setTempoSpeedModalOpen(false)}>
          <div aria-modal="true" className="tempo-speed-modal" onClick={(event) => event.stopPropagation()} role="dialog">
            <header className="tempo-speed-modal-header">
              <div className="header-title-box">
                <span className="tempo-modal-icon">🎵</span>
                <h3>&apos;♩ = 숫자&apos; 속도 표시는 무슨 뜻일까요?</h3>
              </div>
              <button onClick={() => setTempoSpeedModalOpen(false)} type="button">닫기 ✕</button>
            </header>
            <div className="tempo-speed-modal-body">
              <div className="tempo-concept-card">
                <span className="concept-badge">메트로놈(박자기) 속도</span>
                <p className="concept-lead">
                  <b>1분(60초) 동안 4분음표(♩) 박자를 몇 번 치는지</b>를 나타내는 음악의 표준 속도 표시예요! 숫자가 클수록 박자가 빨라집니다.
                </p>
              </div>
              <div className="tempo-examples-grid">
                <div className="tempo-example-card slow">
                  <span className="speed-num">♩ = 60</span>
                  <div className="speed-desc">
                    <strong>1초에 딱 1번 박자</strong>
                    <small>시계 초침 소리 (&apos;똑-딱&apos;)와 같은 차분한 빠르기예요.</small>
                  </div>
                </div>
                <div className="tempo-example-card normal">
                  <span className="speed-num">♩ = 120</span>
                  <div className="speed-desc">
                    <strong>1초에 2번 박자</strong>
                    <small>신나게 발맞춰 씩씩하게 걷는 경쾌한 행진 속도예요!</small>
                  </div>
                </div>
                <div className="tempo-example-card fast">
                  <span className="speed-num">♩ = 180</span>
                  <div className="speed-desc">
                    <strong>1초에 3번 박자</strong>
                    <small>전속력으로 숨차게 질주하는 아주 빠른 속도예요!</small>
                  </div>
                </div>
              </div>
            </div>
            <footer className="tempo-speed-modal-footer">
              <button onClick={() => setTempoSpeedModalOpen(false)} type="button">이해했어요! 확인 완료 👍</button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}

function GuideSideWingsVisual({ wings }: { wings: GuideSideWings }) {
  return (
    <div className="guide-side-wings-container">
      {/* 좌측 날개: 특별한 높임 낱말 */}
      <div className="guide-wing-panel wing-left">
        <div className="wing-header">
          <span className="wing-icon">{wings.leftIcon}</span>
          <strong className="wing-title">{wings.leftTitle}</strong>
          <span className="wing-badge">{wings.leftBadge}</span>
        </div>
        <div className="wing-items-list">
          {wings.leftItems.map((item, idx) => (
            <div className="wing-item-row" key={idx}>
              <span className="item-normal">{item.normal}</span>
              <span className="item-arrow">➔</span>
              <strong className="item-honorific">{item.honorific}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* 우측 날개: 특별한 높임 서술어 */}
      <div className="guide-wing-panel wing-right">
        <div className="wing-header">
          <span className="wing-icon">{wings.rightIcon}</span>
          <strong className="wing-title">{wings.rightTitle}</strong>
          <span className="wing-badge">{wings.rightBadge}</span>
        </div>
        <div className="wing-items-list">
          {wings.rightItems.map((item, idx) => (
            <div className="wing-item-row" key={idx}>
              <span className="item-normal">{item.normal}</span>
              <span className="item-arrow">➔</span>
              <strong className="item-honorific">{item.honorific}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GrammarConceptTableView({ table }: { table: { title: string; subtitle?: string; cards: GrammarConceptCard[] } }) {
  return (
    <div className={`grammar-table-view count-${table.cards.length}`}>
      <div className="grammar-table-header">
        <h3 className="grammar-table-title">{table.title}</h3>
        {table.subtitle && <p className="grammar-table-subtitle">{table.subtitle}</p>}
      </div>

      <div className="grammar-cards-grid">
        {table.cards.map((card, idx) => (
          <div className={`grammar-concept-card theme-${card.colorTheme}`} key={idx}>
            <div className="card-top-row">
              <span className="card-icon">{card.icon}</span>
              <strong className="card-title">{card.title}</strong>
              <span className="card-badge">{card.badge}</span>
            </div>

            <div className="card-match-pairs">
              {card.timeKeywords && (
                <div className="pair-item time-item">
                  <span className="pair-label">{card.pairLabel1 ?? "⏱️ 시간 표현"}</span>
                  <span className="pair-val">{card.timeKeywords}</span>
                </div>
              )}
              {card.timeKeywords && card.verbEndings && card.pairDivider !== "" && (
                <div className="pair-divider">{card.pairDivider ?? "↕ 짝꿍 결합 ↕"}</div>
              )}
              {card.verbEndings && (
                <div className="pair-item verb-item">
                  <span className="pair-label">{card.pairLabel2 ?? "🔗 어울리는 서술어의 형태"}</span>
                  <span className="pair-val">{card.verbEndings}</span>
                </div>
              )}
            </div>

            {(card.goodExample || card.badExample) && (
              <div className="card-examples-box">
                {card.goodExample && (
                  <div className="example-row good">
                    <span className="example-badge good">⭕ {card.goodBadge ?? "바른 문장"}</span>
                    <span className="example-text">{card.goodExample}</span>
                  </div>
                )}
                {card.badExample && (
                  <div className="example-row bad">
                    <span className="example-badge bad">❌ {card.badBadge ?? "어색한 문장"}</span>
                    <span className="example-text">{card.badExample}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SingleVisualShowcase({ item }: { item: DialogueVisualItem }) {
  const [isPlayingBeat, setIsPlayingBeat] = useState(false);
  const beats = item.beats ?? item.gridBlocks ?? 1;

  const handlePlaySound = () => {
    setIsPlayingBeat(true);
    playNoteRhythm(beats);
    setTimeout(() => setIsPlayingBeat(false), Math.max(beats * 450, 400));
  };

  const isRest = item.title.includes("쉼표") || (item.src && item.src.includes("rest"));
  let relationTip = "";

  if (isRest) {
    if (beats === 4) {
      relationTip = "오선 넷째 줄에 거꾸로 매달린 모자 모양! 4박자 동안 소리를 완전히 멈추고 숨을 골라요.";
    } else if (beats === 2) {
      relationTip = "오선 셋째 줄 위에 반듯이 올라앉은 모자 모양! 2박자 동안 숨을 고르는 쉼표예요.";
    } else if (beats === 1) {
      relationTip = "번개 혹은 지그재그 모양! 기준 1박 동안 조용히 쉬어가요.";
    } else if (beats === 0.5) {
      relationTip = "작은 꼬리가 1개 달린 쉼표! 1박의 절반(반 박) 동안 쉬어요.";
    } else {
      relationTip = "꼬리가 2개 달린 쉼표! 아주 빠르게 스쳐 지나가듯 쉼을 가져요.";
    }
  } else {
    if (beats === 4) {
      relationTip = "기둥 없이 온전한 둥근 빈 머리! 4박자 동안 소리를 가장 풍성하고 길게 이어가는 맏형 음표예요.";
    } else if (beats === 2) {
      relationTip = "하얗게 비어 있는 머리에 곧은 기둥 1개! 온음표의 딱 절반인 2박자 동안 소리를 내요.";
    } else if (beats === 1) {
      relationTip = "속이 찬 까만 머리에 곧은 기둥 1개! 2분음표의 절반이자 음악에서 가장 기본이 되는 기준 박자(1박)예요.";
    } else if (beats === 0.5) {
      relationTip = "기둥 끝에 꼬리 1개 찰랑! 기준 1박을 둘로 나눈 반 박(1/2박)의 길이를 가져요.";
    } else if (beats === 0.25) {
      relationTip = "기둥 끝에 꼬리 2개 나란히! 1박을 넷으로 쪼갠 1/4박으로, 넷이 모여야 1박이 완성되는 빠른 음표예요.";
    } else {
      relationTip = item.desc || "원래 음표 길이에 그 음표의 반(1/2)을 더한 길이예요.";
    }
  }

  return (
    <div className="single-showcase-container">
      {/* 1. 좌측: 대형 비주얼 및 리듬 사운드 탭 */}
      <div className="showcase-left-hero">
        {item.tag && <span className="showcase-badge">{item.tag}</span>}
        <div className={`showcase-symbol-box ${isPlayingBeat ? "beating" : ""}`}>
          <img alt={item.title} className="showcase-symbol-img" decoding="async" src={item.src} />
        </div>
        <strong className="showcase-symbol-title">{item.title}</strong>
        <button
          type="button"
          className={`showcase-sound-btn ${isPlayingBeat ? "active" : ""}`}
          onClick={handlePlaySound}
          title="클릭하여 박자 리듬 소리 듣기"
        >
          <span>{isPlayingBeat ? "🎵 소리 나는 중..." : "🎵 박자 소리 들어보기"}</span>
        </button>
      </div>

      {/* 2. 중앙: 음표 설명 및 박자 블록 게이지 */}
      <div className="showcase-center-body">
        {/* 음표 설명 카드 */}
        <div className="showcase-tip-card">
          <div className="tip-header">
            <span className="tip-icon">💡</span>
            <strong className="tip-title">{isRest ? "쉼표 설명" : "음표 설명"}</strong>
          </div>
          <p className="tip-desc-text">{relationTip}</p>
        </div>

        {/* 박자 블록 카드 */}
        <div className="showcase-section-card">
          <div className="showcase-row-header">
            <span className="showcase-sublabel">📏 박자 블록 (전체 4박 중 차지하는 칸수)</span>
            {item.beatsLabel && <span className="v-label-badge">{item.beatsLabel}</span>}
          </div>
          <div aria-label={`박자 칸수: 4칸 중 ${item.gridBlocks ?? item.beats}칸`} className="showcase-beat-grid">
            {[0, 1, 2, 3].map((blockIdx) => {
              const fill = (item.gridBlocks ?? item.beats ?? 0) - blockIdx;
              const cls = fill >= 1 ? "filled" : fill === 0.5 ? "half" : fill === 0.25 ? "quarter" : "empty";
              return (
                <div key={blockIdx} className={`showcase-beat-block ${cls}`}>
                  <span className="block-number">{blockIdx + 1}박</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. 우측: 그림으로 보는 박자 모음 & 미니 팁 */}
      <div className="showcase-right-tips">
        {/* [음표] 1. 온음표 전용: 2분음표 2개 = 온음표 4박 완성 다이어그램 */}
        {beats === 4 && !isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">👑 그림으로 보는 박자 완성</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="2분음표" src="/music-symbols/note-half.svg" className="beam-mini-img" />
                <span className="beam-note-label">2박 x 2개</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">👑 4박 완성!</div>
                <img alt="온음표" src="/music-symbols/note-whole.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">온음표 (4박)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 2박자(2분음표) 2개 또는 1박자(4분음표) 4개가 모이면 <b>가장 긴 온음표(4박)</b>를 완성해요!
            </p>
          </div>
        )}

        {/* [음표] 2. 2분음표 전용: 1박(4분음표) 2개 = 2분음표 2박 완성 */}
        {beats === 2 && !isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">⭐ 그림으로 보는 박자 완성</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="4분음표" src="/music-symbols/note-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label">1박 (♩)</span>
              </div>
              <span className="beam-calc-op">+</span>
              <div className="beam-note-item">
                <img alt="4분음표" src="/music-symbols/note-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label">1박 (♩)</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">✨ 2박 완성!</div>
                <img alt="2분음표" src="/music-symbols/note-half.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">2분음표 (2박)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 기준 1박자(4분음표) 2개가 모이면 <b>온음표의 딱 절반인 2분음표(2박)</b>가 완성돼요!
            </p>
          </div>
        )}

        {/* [음표] 3. 4분음표 전용: 4분음표 4개 = 온음표 1개 완성 */}
        {beats === 1 && !isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">🌳 그림으로 보는 박자 모음</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="4분음표" src="/music-symbols/note-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label">1박 x 4개</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">👑 4박 완성!</div>
                <img alt="온음표" src="/music-symbols/note-whole.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">온음표 (4박)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 기준 1박(4분음표)이 4개 모이면 음악에서 가장 긴 <b>온음표(4박)</b>가 돼요!
            </p>
          </div>
        )}

        {/* [음표] 4. 8분음표 전용: 깃(Beam) 묶음 그림 다이어그램 */}
        {beats === 0.5 && !isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">🤝 그림으로 보는 &apos;깃(Beam)&apos; 묶음</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="8분음표" src="/music-symbols/note-eighth.svg" className="beam-mini-img" />
                <span className="beam-note-label">반 박 (♪)</span>
              </div>
              <span className="beam-calc-op">+</span>
              <div className="beam-note-item">
                <img alt="8분음표" src="/music-symbols/note-eighth.svg" className="beam-mini-img" />
                <span className="beam-note-label">반 박 (♪)</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">☝️ 가로선이 &apos;깃(Beam)&apos;!</div>
                <img alt="깃으로 묶인 8분음표" src="/music-symbols/note-two-eighths.svg" className="beam-mini-img beam-two-img" />
                <span className="beam-note-label highlight">깃으로 손잡고 1박(♩)!</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 혼자 있을 땐 <b>꼬리(Flag)</b>이지만, 둘이 만나면 기둥을 <b>가로지르는 굵은 선 &apos;깃(Beam)&apos;</b>으로 연결되어 <b>온전한 1박자(♩)</b>가 돼요!
            </p>
          </div>
        )}

        {/* [음표] 5. 16분음표 전용: 2줄 깃(Double Beam) 묶음 그림 다이어그램 */}
        {beats === 0.25 && !isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">🤝 그림으로 보는 &apos;이중 깃&apos; 묶음</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="16분음표" src="/music-symbols/note-sixteenth.svg" className="beam-mini-img" />
                <span className="beam-note-label">1/4박 x 4개</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">✌️ 2줄 깃으로 결합!</div>
                <img alt="4연음표" src="/music-symbols/note-four-sixteenths.svg" className="beam-mini-img beam-four-img" />
                <span className="beam-note-label highlight">넷이 모여 1박(♩)!</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 꼬리가 2개인 16분음표 4개가 모이면 <b>두 줄의 깃(Double Beam)</b>으로 한 번에 묶여 <b>1박(♩)</b>이 완성돼요!
            </p>
          </div>
        )}

        {/* [쉼표 전용] 1. 온쉼표 (4박 쉼) */}
        {beats === 4 && isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">👑 4박자 동안 쉬어가기</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="2분쉼표" src="/music-symbols/rest-half.svg" className="beam-mini-img" />
                <span className="beam-note-label">2분쉼표 (2박 쉼)</span>
              </div>
              <span className="beam-calc-op">+</span>
              <div className="beam-note-item">
                <img alt="2분쉼표" src="/music-symbols/rest-half.svg" className="beam-mini-img" />
                <span className="beam-note-label">2분쉼표 (2박 쉼)</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">👑 4박 쉼!</div>
                <img alt="온쉼표" src="/music-symbols/rest-whole.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">온쉼표 (4박 쉼)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 넷째 줄에 <b>거꾸로 매달린 모자 모양</b>! 4박자 동안 모든 소리를 멈추고 온전히 쉬어가요.
            </p>
          </div>
        )}

        {/* [쉼표 전용] 2. 2분쉼표 (2박 쉼) */}
        {beats === 2 && isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">⭐ 2박자 동안 쉬어가기</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="4분쉼표" src="/music-symbols/rest-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label">4분쉼표 (1박 쉼)</span>
              </div>
              <span className="beam-calc-op">+</span>
              <div className="beam-note-item">
                <img alt="4분쉼표" src="/music-symbols/rest-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label">4분쉼표 (1박 쉼)</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">✨ 2박 쉼!</div>
                <img alt="2분쉼표" src="/music-symbols/rest-half.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">2분쉼표 (2박 쉼)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 셋째 줄 위에 <b>반듯이 올라앉은 모자 모양</b>! 2박자 동안 숨을 고르는 쉼표예요.
            </p>
          </div>
        )}

        {/* [쉼표 전용] 3. 4분쉼표 (1박 쉼) */}
        {beats === 1 && isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">⚡ 기준 1박 쉬어가기</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="8분쉼표" src="/music-symbols/rest-eighth.svg" className="beam-mini-img" />
                <span className="beam-note-label">8분쉼표 (반 박)</span>
              </div>
              <span className="beam-calc-op">+</span>
              <div className="beam-note-item">
                <img alt="8분쉼표" src="/music-symbols/rest-eighth.svg" className="beam-mini-img" />
                <span className="beam-note-label">8분쉼표 (반 박)</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">✨ 기준 1박 쉼!</div>
                <img alt="4분쉼표" src="/music-symbols/rest-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">4분쉼표 (1박 쉼)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 번개 혹은 지그재그 모양! <b>기준 1박 동안 조용히 쉬어가는</b> 음악의 대표 쉼표예요.
            </p>
          </div>
        )}

        {/* [쉼표 전용] 4. 8분쉼표 (반 박 쉼) */}
        {beats === 0.5 && isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">🌿 반 박(1/2박) 쉬어가기</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="8분쉼표" src="/music-symbols/rest-eighth.svg" className="beam-mini-img" />
                <span className="beam-note-label">반 박 쉼</span>
              </div>
              <span className="beam-calc-op">+</span>
              <div className="beam-note-item">
                <img alt="8분쉼표" src="/music-symbols/rest-eighth.svg" className="beam-mini-img" />
                <span className="beam-note-label">반 박 쉼</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">✨ 1박 쉼 완성!</div>
                <img alt="4분쉼표" src="/music-symbols/rest-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">4분쉼표 (1박 쉼)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 작은 꼬리가 1개 달린 쉼표! <b>둘이 모이면 4분쉼표(1박 쉼)</b>를 만들어요.
            </p>
          </div>
        )}

        {/* [쉼표 전용] 5. 16분쉼표 (1/4박 쉼) */}
        {beats === 0.25 && isRest && (
          <div className="showcase-beam-visual-box">
            <div className="beam-box-header">
              <span className="beam-tag">⚡ 반의 반 박(1/4박) 쉬어가기</span>
            </div>
            <div className="beam-equation-row">
              <div className="beam-note-item">
                <img alt="16분쉼표" src="/music-symbols/rest-sixteenth.svg" className="beam-mini-img" />
                <span className="beam-note-label">1/4박 x 4개</span>
              </div>
              <span className="beam-calc-arrow">➔</span>
              <div className="beam-note-item highlight">
                <div className="beam-callout-bubble">✨ 1박 쉼 완성!</div>
                <img alt="4분쉼표" src="/music-symbols/rest-quarter.svg" className="beam-mini-img" />
                <span className="beam-note-label highlight">4분쉼표 (1박 쉼)</span>
              </div>
            </div>
            <p className="beam-explain-footer">
              💡 꼬리가 2개 달린 빠른 쉼표! <b>넷이 모여야 4분쉼표(1박 쉼)</b>가 완성돼요.
            </p>
          </div>
        )}

        <div className="showcase-mini-tip">
          <span className="mini-bulb">⭐</span>
          <small>대화창 우측의 [다음 →] 버튼을 눌러 다음 단계로 진행할 수 있어요!</small>
        </div>
      </div>
    </div>
  );
}

function DialogueStageBoard({
  choiceFeedback,
  node,
  nodeIndex,
  onChoice,
  onMultiResolved,
  onOpenTempoSpeedModal,
  onRetryChoice,
  onTaskResolved,
  onZoomDiagram,
  resolvedChoice,
}: {
  choiceFeedback: string;
  node: (typeof stages)[number]["dialogue"][number];
  nodeIndex: number;
  onChoice: (choice: DialogueChoice, index: number) => void;
  onMultiResolved: () => void;
  onOpenTempoSpeedModal?: () => void;
  onRetryChoice?: () => void;
  onTaskResolved: () => void;
  onZoomDiagram: (src: string) => void;
  resolvedChoice: number | null;
}) {
  return (
    <section className="dialogue-stage-board" aria-label="국어 문법 대형 학습 보드">
      {/* 상단 타이틀 배너 (다이어그램이 아니고 task/choices/multiCheck가 없을 때만 렌더링) */}
      {node.visual?.title && node.visual.type !== "diagram" && !node.task && !node.choices && !node.multiCheck && (
        <div className="stage-board-title-banner">
          <div className="banner-left">
            <span className="banner-icon">📖</span>
            <span className="banner-title">{node.visual.title}</span>
          </div>
          <span className="banner-tag">국어 문법 탐구</span>
        </div>
      )}

      {/* 1. 시각 자료 영역 (단독 쇼케이스, 비교 그리드, 기호, 대형 악보 다이어그램, 문법 개념표) */}
      {node.visual && (
        node.visual.type === "grammar-table" && node.visual.grammarTable ? (
          <GrammarConceptTableView table={node.visual.grammarTable} />
        ) : (
          <div className={`stage-visual-container ${node.visual.type} ${node.visual.items?.length === 1 ? "is-single" : ""}`}>
            {node.visual.items && node.visual.items.length === 1 ? (
              <SingleVisualShowcase item={node.visual.items[0]} />
            ) : node.visual.items && node.visual.items.length > 1 ? (
              <div className="stage-visual-compare-grid">
                {node.visual.items.map((item, idx) => (
                  <div className="visual-compare-card" key={idx}>
                    <div className="visual-card-left">
                      {item.tag && <span className="visual-card-tag">{item.tag}</span>}
                      <div className="visual-card-symbol-wrapper">
                        <img alt={item.title} className="visual-card-img" decoding="async" src={item.src} />
                      </div>
                      <strong className="visual-card-title">{item.title}</strong>
                    </div>

                    <div className="visual-card-right">
                      {/* 4칸 박자 블록 게이지 */}
                      <div className="beat-block-section">
                        <span className="beat-section-label">박자 블록 (길이 비교)</span>
                        <div aria-label={`박자 칸수: 4칸 중 ${item.gridBlocks ?? item.beats}칸`} className="beat-grid-bar">
                          {[0, 1, 2, 3].map((blockIdx) => {
                            const fill = (item.gridBlocks ?? item.beats ?? 0) - blockIdx;
                            const cls = fill >= 1 ? "filled" : fill === 0.5 ? "half" : fill === 0.25 ? "quarter" : "empty";
                            return <span className={`beat-block ${cls}`} key={blockIdx} />;
                          })}
                        </div>
                      </div>

                      {/* V자 리듬 카운트 표기 */}
                      {item.beatsLabel && (
                        <div className="beat-v-count">
                          <span className="v-label-badge">{item.beatsLabel}</span>
                        </div>
                      )}

                      {item.desc && <p className="visual-card-desc">{item.desc}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : node.visual.type === "symbol" ? (
              <div className="stage-visual-symbol">
                <img alt={node.visual.title} decoding="async" src={node.visual.src} />
                <span>{node.visual.title}</span>
              </div>
            ) : (
              <div className="stage-visual-diagram-wrapper">
                <div
                  className="stage-visual-diagram"
                  onClick={(e) => {
                    if (node.visual?.src === "/music-diagrams/diagram-tempo-scale.svg" && onOpenTempoSpeedModal) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickY = e.clientY - rect.top;
                      if (clickY > rect.height * 0.7) {
                        e.stopPropagation();
                        onOpenTempoSpeedModal();
                        return;
                      }
                    }
                    onZoomDiagram(node.visual?.src ?? "");
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="diagram-top-badge">
                    <b>🎼 {node.visual.title}</b>
                    <small>🔍 크게 보기</small>
                  </div>
                  <img alt={node.visual.title} decoding="async" src={node.visual.src} />
                </div>
                {node.visual?.src === "/music-diagrams/diagram-tempo-scale.svg" && onOpenTempoSpeedModal && (
                  <button
                    className="tempo-speed-explain-trigger-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTempoSpeedModal();
                    }}
                    type="button"
                  >
                    <span className="trigger-badge">💡 클릭하여 해설 보기 🔍</span>
                    <span className="trigger-text">🎵 <strong>&apos;♩ = 숫자&apos; 속도 표시</strong>는 무슨 뜻일까요?</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      )}

      {/* 2. 인터랙티브 조작 영역 (빈칸 맞추기, 연결하기, 순서 정렬하기) */}
      {node.task && (
        <div className="stage-task-container">
          {node.task.type === "fill-blank" && <SlotFillTaskComponent key={`fb-${nodeIndex}`} onResolved={onTaskResolved} task={node.task} />}
          {node.task.type === "match-pairs" && <MatchPairsTaskComponent key={`mp-${nodeIndex}`} onResolved={onTaskResolved} task={node.task} />}
          {node.task.type === "order-sequence" && <SequenceOrderTaskComponent key={`os-${nodeIndex}`} onResolved={onTaskResolved} task={node.task} />}
        </div>
      )}

      {/* 3. 4지선다 퀴즈 영역 (제시 문장 카드 + 프롬프트 + 카드 그리드) */}
      {node.choices && (
        <div className="stage-choices-container">
          {(node.prompt || node.sentence) && (
            <div className="stage-quest-card">
              <div className="stage-quest-prompt">
                <span className="quest-badge">🎯 문장 탐구 퀘스트</span>
                {node.prompt && <h4>{node.prompt}</h4>}
              </div>
              {node.sentence && (
                <div className="stage-quest-sentence-box">
                  <span className="sentence-quote-mark">“</span>
                  <p className="sentence-text">{node.sentence}</p>
                  <span className="sentence-quote-mark">”</span>
                </div>
              )}
            </div>
          )}
          <div className="stage-choices-grid">
            {node.choices.map((item, index) => (
              <button
                className={`stage-choice-btn ${resolvedChoice === index ? "correct" : ""}`}
                disabled={resolvedChoice !== null && resolvedChoice >= 0}
                key={item.text}
                onClick={() => onChoice(item, index)}
                type="button"
              >
                {item.icon && <img alt="" className="choice-icon" src={item.icon} />}
                <span className="choice-index-num">{index + 1}</span>
                <span className="choice-btn-text">{item.text}</span>
              </button>
            ))}
          </div>
          {choiceFeedback && (
            <div className={`stage-feedback ${resolvedChoice === -1 ? "wrong" : "correct"}`}>
              <div className="feedback-text-wrap">
                <span className="feedback-prefix">{resolvedChoice === -1 ? "⚠️ 다시 생각해 봐요! " : "🎉 정답! "}</span>
                <span>{choiceFeedback}</span>
              </div>
              {resolvedChoice === -1 && onRetryChoice && (
                <button className="task-retry-btn" onClick={onRetryChoice} type="button">
                  🔄 다시 풀기
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. 다중 선택 체크 문제 영역 (아이콘 지원) */}
      {node.multiCheck && (
        <div className="stage-multicheck-container">
          <DialogueMultiCheck key={`multi-${nodeIndex}`} check={node.multiCheck} onResolved={onMultiResolved} />
        </div>
      )}
    </section>
  );
}

{/* 빈칸 채우기 컴포넌트 */}
function SlotFillTaskComponent({ onResolved, task }: { onResolved: () => void; task: Extract<InteractiveTask, { type: "fill-blank" }> }) {
  const [selectedOption, setSelectedOption] = useState<typeof task.options[number] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSelect = (option: typeof task.options[number]) => {
    if (isSuccess) return;
    setSelectedOption(option);
    if (option.isAnswer) {
      setIsSuccess(true);
      setFeedback(task.successFeedback);
      onResolved();
    } else {
      setFeedback(option.explanation);
    }
  };

  const handleRetry = () => {
    setSelectedOption(null);
    setFeedback(null);
  };

  return (
    <div className="task-slot-fill">
      <p className="task-instruction">💡 {task.instruction}</p>
      {/* 수식 / 슬롯 디스플레이 */}
      <div className="slot-equation-row">
        {task.equation.map((slot, idx) => (
          <div className={`equation-item ${slot.isSlot ? "is-slot" : ""}`} key={idx}>
            {slot.isSlot ? (
              <div className={`slot-box ${selectedOption ? (isSuccess ? "filled-success" : "filled-wrong") : "empty"}`}>
                {selectedOption ? (
                  <>
                    {selectedOption.icon && <img alt="" className="slot-icon" src={selectedOption.icon} />}
                    <b>{selectedOption.text}</b>
                  </>
                ) : (
                  <span className="slot-placeholder">? 빈칸</span>
                )}
              </div>
            ) : (
              <div className="equation-text">
                {slot.icon && <img alt="" className="equation-icon" src={slot.icon} />}
                <span>{slot.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 보기 카드 풀 */}
      <div className="slot-options-pool">
        {task.options.map((option) => (
          <button
            className={`slot-option-card ${selectedOption?.id === option.id ? "selected" : ""} ${isSuccess && option.isAnswer ? "is-answer" : ""}`}
            disabled={isSuccess}
            key={option.id}
            onClick={() => handleSelect(option)}
            type="button"
          >
            {option.icon && <img alt="" className="option-icon" src={option.icon} />}
            <span>{option.text}</span>
          </button>
        ))}
      </div>

      {feedback && (
        <div className={`stage-feedback ${isSuccess ? "correct" : "wrong"}`}>
          <div className="feedback-text-wrap">
            <span>{isSuccess ? `🎉 정답! ${feedback}` : `⚠️ 다시 확인해 봐요: ${feedback}`}</span>
          </div>
          {!isSuccess && (
            <button className="task-retry-btn" onClick={handleRetry} type="button">🔄 다시 풀기</button>
          )}
        </div>
      )}
    </div>
  );
}

{/* 짝맞추기 / 연결하기 컴포넌트 */}
function MatchPairsTaskComponent({ onResolved, task }: { onResolved: () => void; task: Extract<InteractiveTask, { type: "match-pairs" }> }) {
  const isRightAnchor = task.anchorSide === "right";
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [selectedRightId, setSelectedRightId] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]); // matched left IDs
  const [hoveredPairId, setHoveredPairId] = useState<string | null>(null); // 마우스 호버 시 짝 하이라이트
  const [feedback, setFeedback] = useState<string | null>(null);
  const isComplete = matchedPairs.length === task.leftItems.length;

  // 우측 보기 셔플: 바로 옆에 같은 짝이 나란히 오지 않도록 탈배열(Derangement) 셔플 적용
  const [shuffledRightItems] = useState(() => {
    const list = [...task.rightItems];
    if (list.length <= 1) return list;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      // 좌측과 같은 행(인덱스)에 정답이 나란히 오는지 확인
      const hasAdjacentMatch = list.some((item, idx) => task.leftItems[idx]?.id === item.matchId);
      if (!hasAdjacentMatch) break;
    }
    return list;
  });

  const handleLeftClick = (item: typeof task.leftItems[number]) => {
    if (matchedPairs.includes(item.id) || isComplete) return;

    if (isRightAnchor) {
      // 오른쪽이 기준 카드인 경우: 선택된 오른쪽 카드와 매칭 검사
      if (!selectedRightId) return;
      const selectedRight = shuffledRightItems.find((it) => it.id === selectedRightId);
      if (!selectedRight) return;

      if (item.matchId === selectedRight.matchId) {
        const nextMatched = [...matchedPairs, item.id];
        setMatchedPairs(nextMatched);
        setSelectedRightId(null);
        if (nextMatched.length === task.leftItems.length) {
          setFeedback(`🎉 ${task.successFeedback}`);
          onResolved();
        } else {
          setFeedback(`✨ 짝 연결 성공! [${selectedRight.text}] ↔ [${item.text}]`);
        }
      } else {
        setFeedback(`❌ 짝이 맞지 않아요! [${selectedRight.text}]에 어울리는 올바른 목적어 카드를 다시 찾아보세요.`);
        setSelectedRightId(null);
      }
    } else {
      // 왼쪽이 기준 카드인 경우
      setSelectedLeftId(item.id);
      setFeedback(null);
    }
  };

  const handleRightClick = (rightItem: typeof task.rightItems[number]) => {
    const isMatched = matchedPairs.some((leftId) => task.leftItems.find((li) => li.id === leftId)?.matchId === rightItem.matchId);
    if (isMatched || isComplete) return;

    if (isRightAnchor) {
      // 오른쪽이 기준 카드인 경우: 기준 카드 선택
      setSelectedRightId(rightItem.id);
      setFeedback(null);
    } else {
      // 왼쪽이 기준 카드인 경우: 선택된 왼쪽 카드와 매칭 검사
      if (!selectedLeftId) return;
      const selectedLeft = task.leftItems.find((it) => it.id === selectedLeftId);
      if (!selectedLeft) return;

      if (selectedLeft.matchId === rightItem.matchId) {
        const nextMatched = [...matchedPairs, selectedLeft.id];
        setMatchedPairs(nextMatched);
        setSelectedLeftId(null);
        if (nextMatched.length === task.leftItems.length) {
          setFeedback(`🎉 ${task.successFeedback}`);
          onResolved();
        } else {
          setFeedback(`✨ 짝 연결 성공! [${selectedLeft.text}] ↔ [${rightItem.text}]`);
        }
      } else {
        setFeedback(`❌ 짝이 맞지 않아요! [${selectedLeft.text}]에 어울리는 올바른 짝 카드를 다시 찾아보세요.`);
        setSelectedLeftId(null);
      }
    }
  };

  const handleReset = () => {
    setMatchedPairs([]);
    setSelectedLeftId(null);
    setSelectedRightId(null);
    setFeedback(null);
  };

  return (
    <div className="task-match-pairs">
      <div className="task-instruction-banner">
        <div className="instruction-header-row">
          <p className="task-instruction">🔗 {task.instruction}</p>
          {!isComplete && matchedPairs.length > 0 && (
            <button className="task-reset-link-btn" onClick={handleReset} type="button">
              ↺ 처음부터 다시 연결
            </button>
          )}
        </div>
        <div className="match-guide-text">
          {isRightAnchor
            ? "💡 오른쪽 카드를 먼저 클릭하고, 왼쪽에서 알맞은 짝을 찾아 클릭해 보세요!"
            : "💡 왼쪽 카드를 먼저 클릭하고, 오른쪽에서 알맞은 짝을 찾아 클릭해 보세요!"}
        </div>
        <span className={`task-sub-hint ${(isRightAnchor ? selectedRightId : selectedLeftId) ? "active-step" : ""}`}>
          {isRightAnchor
            ? (selectedRightId
                ? "👉 좋아요! 이제 왼쪽에서 알맞은 짝 카드를 클릭하여 연결하세요!"
                : "👉 먼저 오른쪽에서 연결할 기준 카드를 하나 선택해 주세요.")
            : (selectedLeftId
                ? "👉 좋아요! 이제 오른쪽에서 알맞은 짝 카드를 클릭하여 연결하세요!"
                : "👉 먼저 왼쪽에서 연결할 기준 카드를 하나 선택해 주세요.")}
        </span>
      </div>
      <div className="match-columns-grid">
        <div className="match-column left">
          <div className="col-header">
            <span className="col-title">{task.leftTitle ?? "항목 선택"}</span>
            <span className="col-desc">{isRightAnchor ? "짝 맞추기" : "기준 카드"}</span>
          </div>
          {task.leftItems.map((item, idx) => {
            const isMatched = matchedPairs.includes(item.id);
            const isSelected = isRightAnchor ? false : selectedLeftId === item.id;
            const pairIndex = idx;
            const colorCls = isMatched ? `pair-color-${pairIndex % 6}` : "";
            const isHovered = isMatched && hoveredPairId === item.id;
            return (
              <button
                className={`match-card left-card ${isSelected ? "selected" : ""} ${isMatched ? "matched" : ""} ${colorCls} ${isHovered ? "hover-linked" : ""} ${isRightAnchor && selectedRightId ? "target-waiting" : ""}`}
                disabled={isMatched || isComplete || (isRightAnchor && !selectedRightId)}
                key={item.id}
                onClick={() => handleLeftClick(item)}
                onMouseEnter={() => isMatched && setHoveredPairId(item.id)}
                onMouseLeave={() => setHoveredPairId(null)}
                type="button"
              >
                {item.icon && <img alt="" className="match-icon" src={item.icon} />}
                {item.emoji && <span className="match-emoji-box">{item.emoji}</span>}
                <div className="match-card-content">
                  <div className="match-card-title-row">
                    <span className="match-title">{item.text}</span>
                    {item.badge && <span className="match-tempo-badge">{item.badge}</span>}
                  </div>
                  {item.subText && <span className="match-sub-text">{item.subText}</span>}
                </div>
                {isMatched && <b className="check-badge">✓ {pairIndex + 1}</b>}
              </button>
            );
          })}
        </div>

        <div className="match-column right">
          <div className="col-header">
            <span className="col-title">{task.rightTitle ?? "알맞은 짝 연결"}</span>
            <span className="col-desc">{isRightAnchor ? "기준 카드" : "짝 맞추기"}</span>
          </div>
          {shuffledRightItems.map((item) => {
            const isMatched = matchedPairs.some((leftId) => task.leftItems.find((li) => li.id === leftId)?.matchId === item.matchId);
            const pairIndex = task.leftItems.findIndex((li) => li.matchId === item.matchId);
            const colorCls = isMatched ? `pair-color-${(pairIndex >= 0 ? pairIndex : 0) % 6}` : "";
            const isHovered = isMatched && hoveredPairId === item.matchId;
            const isSelected = isRightAnchor ? selectedRightId === item.id : false;
            return (
              <button
                className={`match-card right-card ${isSelected ? "selected" : ""} ${isMatched ? "matched" : ""} ${colorCls} ${isHovered ? "hover-linked" : ""} ${!isRightAnchor && selectedLeftId ? "target-waiting" : ""}`}
                disabled={isMatched || isComplete || (!isRightAnchor && !selectedLeftId)}
                key={item.id}
                onClick={() => handleRightClick(item)}
                onMouseEnter={() => isMatched && setHoveredPairId(item.matchId)}
                onMouseLeave={() => setHoveredPairId(null)}
                type="button"
              >
                {item.icon && <img alt="" className="match-icon" src={item.icon} />}
                {item.emoji && <span className="match-emoji-box">{item.emoji}</span>}
                <div className="match-card-content">
                  <div className="match-card-title-row">
                    <span className="match-title">{item.text}</span>
                    {item.badge && <span className="match-tempo-badge">{item.badge}</span>}
                  </div>
                  {item.subText && <span className="match-sub-text">{item.subText}</span>}
                </div>
                {isMatched && <b className="check-badge">✓ {pairIndex >= 0 ? pairIndex + 1 : ""}</b>}
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div className={`stage-feedback ${isComplete || feedback.startsWith("✨") || feedback.startsWith("🎉") ? "correct" : "wrong"}`}>
          <div className="feedback-text-wrap">
            <span>{feedback}</span>
          </div>
          {!isComplete && !feedback.startsWith("✨") && !feedback.startsWith("🎉") && (
            <button className="task-retry-btn" onClick={() => { setSelectedLeftId(null); setFeedback(null); }} type="button">
              🔄 다시 풀기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

{/* 순서 정렬하기 컴포넌트 */}
function SequenceOrderTaskComponent({ onResolved, task }: { onResolved: () => void; task: Extract<InteractiveTask, { type: "order-sequence" }> }) {
  // 초기 순서는 살짝 섞어서 배치
  const [items, setItems] = useState(() => {
    const shuffled = [...task.items];
    return shuffled.sort(() => (task.items.length > 2 ? 0.5 - Math.random() : 1));
  });
  const [isSuccess, setIsSuccess] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleReset = () => {
    const shuffled = [...task.items].sort(() => (task.items.length > 2 ? 0.5 - Math.random() : 1));
    setItems(shuffled);
    setFeedback(null);
  };

  const moveLeft = (index: number) => {
    if (isSuccess || index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setItems(next);
    setFeedback(null);
  };

  const moveRight = (index: number) => {
    if (isSuccess || index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setItems(next);
    setFeedback(null);
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isSuccess) return;
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndex) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(targetIndex, 0, moved);
    setItems(next);
    setDraggedIdx(null);
    setDragOverIdx(null);
    setFeedback(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const checkOrder = () => {
    const currentOrders = items.map((i) => i.order);
    const minOrder = items.length > 0 ? Math.min(...items.map((i) => i.order)) : 0;
    const isStandardCorrect = items.every((item, idx) => item.order === idx + minOrder);

    let isAllowed = false;
    if (task.allowedOrders && task.allowedOrders.length > 0) {
      isAllowed = task.allowedOrders.some(
        (orderList) =>
          orderList.length === currentOrders.length &&
          orderList.every((val, idx) => val === currentOrders[idx])
      );
    }

    if (isStandardCorrect || isAllowed) {
      setIsSuccess(true);
      setFeedback(task.successFeedback);
      onResolved();
    } else {
      const wrongMsg = task.instruction.includes("문장") || task.instruction.includes("순서")
        ? "아직 순서가 맞지 않는 부분이 있어요. 올바른 문장 순서를 다시 확인해 보세요!"
        : "아직 순서가 맞지 않는 부분이 있어요. 올바른 순서를 다시 확인해 보세요!";
      setFeedback(wrongMsg);
    }
  };

  return (
    <div className="task-order-sequence">
      <div className="task-instruction-banner">
        <p className="task-instruction">📊 {task.instruction}</p>
        <span className="task-drag-tip">💡 카드를 마우스로 직접 끌어다 놓거나(드래그), 아래 ◀ ▶ 버튼으로 순서를 바꿀 수 있어요!</span>
      </div>
      <div className="order-items-grid">
        {items.map((item, index) => (
          <div
            className={`order-card ${isSuccess ? "success" : ""} ${draggedIdx === index ? "dragging" : ""} ${dragOverIdx === index ? "drag-over" : ""}`}
            draggable={!isSuccess}
            key={item.id}
            onDragEnd={handleDragEnd}
            onDragLeave={() => setDragOverIdx(null)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragStart={(e) => handleDragStart(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            title={!isSuccess ? "마우스로 드래그하여 순서를 바꿀 수 있어요" : ""}
          >
            <div className="order-card-header">
              <span className="order-number">{index + 1}단계</span>
              {!isSuccess && <span className="order-drag-handle" title="드래그 가능">⠿</span>}
            </div>
            {item.icon && <img alt="" className="order-icon" src={item.icon} />}
            <strong>{item.text}</strong>
            {!isSuccess && (
              <div className="order-arrow-btns">
                <button disabled={index === 0} onClick={() => moveLeft(index)} title="왼쪽으로 이동" type="button">◀</button>
                <button disabled={index === items.length - 1} onClick={() => moveRight(index)} title="오른쪽으로 이동" type="button">▶</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isSuccess && (
        <div className="order-check-action">
          <button className="order-submit-btn" onClick={checkOrder} type="button">정렬 순서 확인하기 ✨</button>
        </div>
      )}

      {feedback && !isSuccess && (
        <div className="stage-feedback wrong">
          <div className="feedback-text-wrap">
            <span>⚠️ {feedback}</span>
          </div>
          <button className="task-retry-btn" onClick={handleReset} type="button">
            🔄 다시 정렬하기
          </button>
        </div>
      )}
    </div>
  );
}

function DialogueMultiCheck({ check, onResolved }: { check: DialogueMultiCheckData; onResolved: () => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [passed, setPassed] = useState(false);
  const toggleOption = (id: string) => { if (passed) return; setFeedback([]); setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); };
  const submit = () => {
    const selected = new Set(selectedIds); const missed = check.options.filter((option) => option.isAnswer && !selected.has(option.id)); const incorrect = check.options.filter((option) => !option.isAnswer && selected.has(option.id));
    if (!missed.length && !incorrect.length) { setPassed(true); setFeedback([check.successFeedback]); onResolved(); return; }
    const messages = [...incorrect.map((option) => `${option.text}: ${option.explanation}`), ...missed.map((option) => `${option.text}도 골라야 해요: ${option.explanation}`)];
    setFeedback(messages);
  };
  const retry = () => { setSelectedIds([]); setFeedback([]); };
  const hasMeasure = check.options.some((opt) => opt.measureImage);
  const hasCard = check.options.some((opt) => opt.cardImage);
  return (
    <section className={`dialogue-multi-check ${hasMeasure ? "is-measure-quiz" : ""} ${hasCard ? "is-card-quiz" : ""}`} aria-label="여러 개 선택 확인문제">
      <small>💡 {check.instruction}</small>
      <div className={`dialogue-multi-options ${hasMeasure ? "has-measure" : ""} ${hasCard ? "has-staff-cards" : ""}`}>
        {check.options.map((option) => (
          <button
            aria-pressed={selectedIds.includes(option.id)}
            className={`${selectedIds.includes(option.id) ? "selected" : ""} ${passed && option.isAnswer ? "answer" : ""} ${option.measureImage || option.cardImage ? "is-measure-card" : ""}`}
            disabled={passed}
            key={option.id}
            onClick={() => toggleOption(option.id)}
            type="button"
          >
            {option.cardImage ? (
              <div className="staff-card-content">
                <div className="staff-card-header">
                  <b className="measure-check-mark">{selectedIds.includes(option.id) ? "✓" : "+"}</b>
                </div>
                <div className="staff-score-wrapper">
                  <img alt={option.text} className="staff-score-img" src={option.cardImage} />
                </div>
                <div className="staff-card-footer">
                  <strong className="staff-opt-name">{option.text}</strong>
                </div>
              </div>
            ) : option.measureImage ? (
              <div className="measure-card-content">
                <div className="measure-card-header">
                  {option.timeBadge && <span className={`measure-time-badge badge-${option.timeBadge.replace(/[^0-9]/g, "")}`}>{option.timeBadge}</span>}
                  <b className="measure-check-mark">{selectedIds.includes(option.id) ? "✓" : "+"}</b>
                </div>
                <div className="measure-score-wrapper">
                  <img alt={option.text} className="measure-score-img" src={option.measureImage} />
                </div>
                <div className="measure-card-footer">
                  <strong className="measure-opt-name">{option.text}</strong>
                </div>
              </div>
            ) : (
              <>
                {option.icons && option.icons.length > 0 ? (
                  <span className="multi-option-icons-row">
                    {option.icons.map((iconSrc, idx) => (
                      <img alt="" className="multi-option-icon" key={idx} src={iconSrc} />
                    ))}
                  </span>
                ) : option.icon ? (
                  <img alt="" className="multi-option-icon" src={option.icon} />
                ) : null}
                <b>{selectedIds.includes(option.id) ? "✓" : "+"}</b>
                <span>{option.text}</span>
              </>
            )}
          </button>
        ))}
      </div>
      <div className="dialogue-multi-actions">
        <button disabled={!selectedIds.length || passed} onClick={submit} type="button">선택 완료</button>
        {feedback.length > 0 && !passed && <button className="retry" onClick={retry} type="button">🔄 다시 풀기</button>}
      </div>
      {feedback.length > 0 && !passed && (
        <div className="multi-feedback wrong" role="status">
          <div className="multi-feedback-header">
            <strong>⚠️ 다시 확인해 봐요!</strong>
            <button className="task-retry-btn" onClick={retry} type="button">🔄 다시 풀기</button>
          </div>
          <ul>{feedback.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function Battle({ answered, battle, character, difficulty, logs, onAnswer, onContinueEnemy, onContinueToAction, onEndTurn, onExit, onPlayCard, onRedraw, onRetryQuiz, onUseItem, ownedItems, quiz, stage, usedItems }: { answered: QuizOption | null; battle: BattleState; character: (typeof characters)[number]; difficulty: AdventureDifficulty; logs: BattleLogEntry[]; onAnswer: (option: QuizOption) => void; onContinueEnemy: () => void; onContinueToAction: () => void; onEndTurn: () => void; onExit: () => void; onPlayCard: (card: CombatCard) => void; onRedraw: () => void; onRetryQuiz: () => void; onUseItem: (itemId: RewardItemId) => void; ownedItems: RewardItemId[]; quiz: ReturnType<typeof generateStageQuiz>; stage: (typeof stages)[number]; usedItems: RewardItemId[] }) {
  const [logOpen, setLogOpen] = useState(false);
  const [minimizedQuizRound, setMinimizedQuizRound] = useState<number | null>(null);
  const quizMinimized = battle.phase === "quiz" && minimizedQuizRound === battle.round;
  const latestCombatLog = logs.at(-1);
  const logDialogRef = useDialogKeyboard(logOpen, () => setLogOpen(false));
  return <main className="battle-page" style={{ "--stage": stage.color, backgroundImage: `linear-gradient(#070a1baa,#070a1bee),url(${stage.background})` } as React.CSSProperties}>
    <header className="combat-header"><strong>럭키팡 문장던전</strong><span>STAGE {stage.id} · {stage.shortTitle} / {getDifficulty(difficulty).badge}</span><div className="combat-header-actions"><button aria-expanded={logOpen} onClick={() => setLogOpen(true)} type="button">전투 로그</button><button onClick={onExit}>메뉴로 나가기</button></div></header>
    <section className="combat-stats"><Stat label={`${character.name} HP`} value={`${battle.playerHp} / ${battle.maxPlayerHp}`} /><Stat label={battle.physicalShield ? "물리 방패" : "물리 방어"} value={battle.physicalShield ? `${battle.basePhysicalDefense} · 준비` : battle.basePhysicalDefense + battle.physicalGuard} /><Stat label="마법 방어" value={battle.baseMagicDefense + battle.magicGuard} /><Stat label="정답 연쇄" value={`${battle.combo} / 3`} /><BagStat battle={battle} onUseItem={onUseItem} ownedItems={ownedItems} usedItems={usedItems} /><Stat label="보스 방어" value={`물리 ${battle.bossArmor} · 마법 ${battle.bossBarrier}`} /><Stat label="BOSS HP" value={`${battle.bossHp} / ${battle.maxBossHp}`} /></section>
    <section className="battlefield">
      <Fighter battle={battle} image={character.image} label={character.name} side="hero" />
      <div className="battlefield-center">
        {quizMinimized && <button className="quiz-reopen" onClick={() => setMinimizedQuizRound(null)} type="button">문제 보기</button>}
        <div className={`turn-energy ${battle.phase === "action" ? "active" : ""}`}><small>이번 턴 행동력</small><strong>{battle.energy}<i>/3</i></strong><span>{battle.phase === "action" ? "카드를 낼 수 있어요" : battle.phase.toUpperCase()}</span></div>
      </div>
      <Fighter battle={battle} image={stage.bossImage} label={stage.bossName} showIntent={difficulty === "easy"} side="boss" />
    </section>
    <p aria-atomic="true" aria-live="polite" className="sr-only">{battle.message}</p><button aria-haspopup="dialog" className="battle-message" onClick={() => setLogOpen(true)} type="button">{battle.message}</button>
    {logOpen && <div className="battle-log-backdrop" onMouseDown={() => setLogOpen(false)}><section aria-labelledby="battle-log-title" aria-modal="true" className="battle-log-modal" onMouseDown={(event) => event.stopPropagation()} ref={logDialogRef} role="dialog"><header><div><p>RECENT BATTLE LOG</p><h2 id="battle-log-title">최근 전투 기록 <span>{logs.length} / 10</span></h2></div><button aria-label="전투 로그 닫기" onClick={() => setLogOpen(false)} type="button">×</button></header>{logs.length === 0 ? <p className="empty-battle-log">아직 전투 기록이 없어요. 문제를 풀거나 카드를 사용하면 여기에 표시됩니다.</p> : <ol>{[...logs].reverse().map((log, index) => <li key={log.id}><b>{logs.length - index}</b><div><span className="battle-log-meta">{formatBattleLogMeta(log)}</span><strong>{log.text}</strong>{log.detail && <small>{log.detail}</small>}</div></li>)}</ol>}<small>최근 10개까지 기록됩니다.</small></section></div>}
    {(battle.phase === "action" || quizMinimized) && <ActionPanel battle={battle} difficulty={difficulty} onEndTurn={onEndTurn} onPlayCard={onPlayCard} onRedraw={onRedraw} preview={quizMinimized} />}
    {(battle.phase === "quiz" || battle.phase === "reward") && !quizMinimized && <QuizModal answered={answered} battle={battle} battleLog={latestCombatLog} difficulty={difficulty} onAnswer={onAnswer} onContinueToAction={onContinueToAction} onMinimize={() => setMinimizedQuizRound(battle.round)} onRetryQuiz={onRetryQuiz} quiz={quiz} />}
    {battle.phase === "enemy" && <div className="phase-banner"><p>ENEMY TURN</p><h2>{battle.message}</h2><button onClick={onContinueEnemy}>{battleFinished(battle) ? "전투 결과" : "다음 문제"} →</button></div>}
  </main>;
}
function Stat({ label, value }: { label: string; value: number | string }) { if (label === "정답 연쇄") return <ComboStat combo={Number(String(value).split("/")[0].trim())} />; const detail = ["물리 방어", "물리 방패", "마법 방어", "보스 방어"].includes(label); return <div className={detail ? "detail-stat" : "primary-stat"}><span>{label}</span><strong>{value}</strong></div>; }
function ComboStat({ combo }: { combo: number }) { const ready = combo >= 3; function recover() { window.dispatchEvent(new CustomEvent("combo-recover", { detail: Math.floor(Math.random() * 5) + 1 })); } return <div className="combo-stat primary-stat"><span>정답 연쇄</span><strong>{combo} / 3</strong>{ready ? <button onClick={recover}>HP 회복</button> : <small>오답 시 절반으로 감소</small>}</div>; }
function BagStat({ battle, onUseItem, ownedItems, usedItems }: { battle: BattleState; onUseItem: (itemId: RewardItemId) => void; ownedItems: RewardItemId[]; usedItems: RewardItemId[] }) {
  const [open, setOpen] = useState(false);
  const usableCount = ownedItems.filter((id) => !usedItems.includes(id)).length;
  const bagDialogRef = useDialogKeyboard(open, () => setOpen(false));
  return <div className="bag-stat"><button aria-expanded={open} onClick={() => setOpen(true)} type="button"><span>ITEMS</span><strong>가방 <b>{usableCount}</b></strong></button>{open && <div className="bag-modal-backdrop" onMouseDown={() => setOpen(false)}><section aria-labelledby="bag-title" aria-modal="true" className="bag-modal" onMouseDown={(event) => event.stopPropagation()} ref={bagDialogRef} role="dialog"><span>🎒</span><p className="eyebrow">RELIC BAG</p><h2 id="bag-title">고유 유물 가방</h2><p>한 게임에서 각 유물은 한 번만 사용할 수 있어요.</p><div className="reward-item-list">{rewardItems.map((item) => { const owned = ownedItems.includes(item.id); const used = usedItems.includes(item.id); const usable = owned && !used && canUseRewardItem(item.id, battle.phase); return <article className={`${owned ? "owned" : "locked"} ${used ? "used" : ""}`} key={item.id} style={{ "--item": item.color } as React.CSSProperties}><i>{owned ? item.icon : "?"}</i><div><strong>{item.name}</strong><small>{owned ? item.description : `스테이지 ${item.stageId} 보스 격파 보상`}</small><em>{used ? "사용 완료" : usable ? "지금 사용 가능" : owned ? item.timing : "미획득"}</em></div>{owned && !used && <button disabled={!usable} onClick={() => onUseItem(item.id)} type="button">사용하기</button>}</article>; })}</div><button onClick={() => setOpen(false)} type="button">닫기</button></section></div>}</div>;
}
function Fighter({ battle, image, label, showIntent = false, side }: { battle: BattleState; image: string; label: string; showIntent?: boolean; side: "hero" | "boss" }) {
  const bossIdentity = stages.find((stage) => stage.bossName === label);
  const displayTitle = side === "hero" ? characters.find((character) => character.name === label)?.role ?? "탐험가" : bossIdentity?.bossTitle ?? "던전 보스";
  const displayName = side === "hero" ? label : bossIdentity?.bossShortName ?? label;
  const hp = side === "hero" ? battle.playerHp : battle.bossHp;
  const max = side === "hero" ? battle.maxPlayerHp : battle.maxBossHp;
  const attackNotice = side === "boss" ? battle.attackNotice : undefined;
  const enemyAttack = side === "hero" ? battle.enemyAttackNotice : undefined;
  const bossAttack = side === "boss" ? battle.enemyAttackNotice : undefined;
  const quizDamage = side === "hero" ? battle.quizDamageNotice : undefined;
  const selfDamage = side === "hero" ? battle.selfDamageNotice : undefined;
  const wrongAnswer = side === "hero" && battle.phase === "reward" && battle.message.includes("오답");
  const bossConfused = side === "boss" && battle.bossEffect === "confusion";
  const confusionBurst = bossConfused && battle.phase === "action";
  const heroStance = battle.dodge ? "회피 준비" : battle.physicalShield ? "물리 방패 준비" : battle.magicGuard > 0 ? `마법 결계 +${battle.magicGuard}` : battle.attackBoost > 0 ? `공격 강화 +${battle.attackBoost}` : null;
  const bossStance = bossConfused ? "혼란" : battle.bossArmor > 0 ? `물리 방어 ${battle.bossArmor}` : battle.bossBarrier > 0 ? `마법 결계 ${battle.bossBarrier}` : battle.bossStance;
  return <article className={`fighter ${side} ${attackNotice ? `impact ${attackNotice.kind}-impact` : ""} ${side === "boss" && bossAttack ? `enemy-attacking ${bossAttack.kind}` : ""} ${side === "hero" && battle.playerEffect ? `player-effect ${battle.playerEffect}` : ""} ${wrongAnswer ? "wrong-answer" : ""} ${bossConfused ? "boss-confused" : ""} ${confusionBurst ? "confusion-burst" : ""}`}>
    <img alt={displayName} key={side === "boss" ? `boss-impact-${attackNotice?.sequence ?? 0}` : "hero"} src={image} />
    {side === "hero" && heroStance && <span className="fighter-stance hero-stance">{heroStance}</span>}
    {attackNotice && <><span aria-hidden="true" className={`boss-impact-flash ${attackNotice.kind}`} key={`flash-${attackNotice.sequence}`} /><div className={`battle-damage-pop ${attackNotice.kind}`} key={attackNotice.sequence}><strong>{attackNotice.defense > 0 ? attackNotice.brokeShield ? `${attackNotice.kind === "physical" ? "물리 방어막" : "마법 결계"} 파괴!` : `${attackNotice.kind === "physical" ? "물리 방어막" : "마법 결계"} -${attackNotice.shieldDamage}` : `${attackNotice.kind === "physical" ? "물리" : "마법"} 피해 ${attackNotice.damage}`}</strong>{attackNotice.defense > 0 && <small>{attackNotice.brokeShield ? `남은 피해 ${attackNotice.damage}` : `남은 내구도 ${attackNotice.shieldRemaining}`}</small>}</div></>}
    {enemyAttack && <div className={`battle-damage-pop ${enemyAttack.damage > 0 ? "player-hit" : "player-defense"} ${enemyAttack.kind}`} key={`${battle.round}-${enemyAttack.damage}-${enemyAttack.outcome ?? "hit"}`}><strong>{enemyAttack.damage > 0 ? `피해 ${enemyAttack.damage}` : enemyAttack.outcome === "dodge" ? "회피 성공!" : enemyAttack.outcome === "shield" ? "방패 방어!" : "방어 성공!"}</strong></div>}
    {quizDamage && <div className="battle-damage-pop player-hit physical" key={`quiz-${quizDamage}-${battle.score}`}><strong>피해 ${quizDamage}</strong></div>}
    {selfDamage && <div className="battle-damage-pop self-hit" key={`self-${battle.round}-${selfDamage}-${battle.impactSequence}`}><strong>반동 피해 ${selfDamage}</strong></div>}
    {wrongAnswer && <div className="wrong-pop">? ? ?</div>}
    {bossConfused && <div className="confusion-questions"><b>?</b><b>?</b><b>?</b></div>}
    <div className="fighter-name"><span className="fighter-title">{displayTitle}</span><strong>{displayName}</strong>{side === "boss" && showIntent && <small className="next-intent">다음 공격 · {battle.intent.label}</small>}{side === "boss" && <span className="fighter-stance boss-stance">{bossStance}</span>}<div className="hp-bar"><i style={{ width: `${Math.max(0, hp / max * 100)}%` }} /></div><div className="fighter-hp-row"><small>{hp} / {max}</small></div></div>
  </article>;
}
function QuizModal({ answered, battle, battleLog, difficulty, onAnswer, onContinueToAction, onMinimize, onRetryQuiz, quiz }: { answered: QuizOption | null; battle: BattleState; battleLog: BattleLogEntry | undefined; difficulty: AdventureDifficulty; onAnswer: (option: QuizOption) => void; onContinueToAction: () => void; onMinimize: () => void; onRetryQuiz: () => void; quiz: ReturnType<typeof generateStageQuiz> }) {
  const [zoomDiagram, setZoomDiagram] = useState<string | null>(null);
  const isLongOption = quiz.options.some((option) => 
    option.text.length > 7 || 
    option.text.includes(" ") || 
    option.text.includes("→") || 
    option.text.includes(",") || 
    option.text.includes("=") || 
    option.text.includes("\n")
  );
  const optionLayout = isLongOption ? "long" : "short";
  const mirrorActive = battle.mirrorTurns > 0;
  const sealedHintId = battle.quizHint ? quiz.options.find((option) => !option.isCorrect)?.id : undefined;
  const quizDialogRef = useDialogKeyboard(true, onMinimize);
  return (
    <div className="quiz-modal-backdrop">
      <section aria-labelledby="quiz-title" aria-modal="true" className={`quiz-modal ${optionLayout}`} ref={quizDialogRef} role="dialog">
        <header>
          <p className="eyebrow">{getDifficulty(difficulty).badge} · QUIZ GATE</p>
          <div>
            <strong>정답 3 · 오답 2</strong>
            {!answered && <button className="quiz-minimize" onClick={onMinimize} type="button">전장 보기</button>}
          </div>
        </header>
        <div className={`quiz-prompt-wrapper ${quiz.referenceNote ? "has-ref-note" : ""}`}>
          <div className="quiz-prompt-center">
            <h1 id="quiz-title">{quiz.prompt}</h1>
            {quiz.referenceNote && (
              <aside aria-label="문법 개념 참고 카드" className="quiz-reference-card">
                <span className="quiz-reference-tag">💡 {quiz.referenceNote.tag}</span>
                <img alt={quiz.referenceNote.label} className="quiz-reference-img" decoding="async" src={quiz.referenceNote.symbol} />
                <div className="quiz-reference-meta">
                  <strong className="quiz-reference-name">{quiz.referenceNote.label}</strong>
                  <small className="quiz-reference-desc">{quiz.referenceNote.desc}</small>
                </div>
              </aside>
            )}
            {/* 난이도가 쉬움(easy)일 때만 힌트보기 버튼 제공 (클릭 시 팝업 모달로 관계표 표시) */}
            {difficulty === "easy" && quiz.diagram && (
              <div className="quiz-hint-section">
                <button
                  className="quiz-hint-toggle"
                  onClick={() => setZoomDiagram(quiz.diagram ?? null)}
                  type="button"
                >
                  💡 힌트 보기 ({quiz.diagramTitle ?? "문법 개념표"}) 🔍
                </button>
              </div>
            )}
            <p>{mirrorActive ? `진실의 문장 거울 유물 효과 · 남은 ${battle.mirrorTurns}턴` : battle.quizHint ? "별빛 돋보기 유물 효과 · 오답 선택지 1개를 봉인했어요." : "일반 정답은 행동력 2, 숨겨진 럭키 정답은 행동력 3을 줍니다."}</p>
          </div>
        </div>
        <div className={`quiz-options ${optionLayout}`}>
          {quiz.options.map((option) => {
            const hintSealed = option.id === sealedHintId;
            const sealed = (mirrorActive && option.isBomb) || hintSealed;
            const luckyMarked = mirrorActive && option.isLucky;
            return (
              <button
                className={`${answered?.id === option.id ? option.isCorrect ? "correct" : "wrong" : ""} ${luckyMarked ? "lucky-revealed" : ""} ${sealed ? "bomb-sealed" : ""} ${option.equation ? "has-symbol has-equation" : option.symbols && option.symbols.length > 0 ? "has-symbol has-multi-symbols" : option.symbol ? "has-symbol" : ""}`}
                disabled={Boolean(answered) || sealed}
                key={option.id}
                onClick={() => onAnswer(option)}
              >
                {luckyMarked && <small>🍀 럭키</small>}
                {hintSealed ? <small>🔒 제외</small> : sealed && <small>🔒 봉인</small>}
                {option.equation ? (
                  <div
                    className={`quiz-option-equation-cluster ${option.equation.rightIcons.length >= 3 ? "many-items" : ""}`}
                    aria-hidden="true"
                  >
                    <img alt="" className="quiz-option-symbol left-symbol" src={option.equation.leftIcon} />
                    <span className="equation-eq-sign">=</span>
                    <div className="equation-right-icons">
                      {option.equation.rightIcons.map((sym, sIdx) => (
                        <img alt="" className="quiz-option-symbol" key={sIdx} src={sym} />
                      ))}
                    </div>
                  </div>
                ) : option.symbols && option.symbols.length > 0 ? (
                  <div className={`quiz-option-symbols-cluster ${option.symbols.length >= 4 ? "dense-cluster" : option.symbols.length === 3 ? "medium-cluster" : ""}`} aria-hidden="true">
                    {option.symbols.map((sym, sIdx) => (
                      <img alt="" className="quiz-option-symbol" key={sIdx} src={sym} />
                    ))}
                  </div>
                ) : option.symbol ? (
                  <img alt="" className="quiz-option-symbol" src={option.symbol} />
                ) : null}
                <span className="quiz-option-text">{option.text}</span>
              </button>
            );
          })}
        </div>
        {answered ? (
          <div aria-live="polite" className={`quiz-feedback ${answered.isCorrect ? "correct" : "wrong"}`} role="status">
            <strong>{answered.isLucky ? "🍀 럭키팡 정답!" : answered.isCorrect ? "✓ 정답이에요!" : answered.isBomb ? "💣 폭탄 오답!" : "다시 확인해 봐요."}</strong>
            <p>{answered.explanation}</p>
            {answered.misconception && <small>오개념 진단: {answered.misconception}</small>}
            {answered.isCorrect ? (

              <button className="quiz-continue" onClick={onContinueToAction} type="button">전투로 이동 →</button>

            ) : battle.playerHp <= 0 ? (

              <button className="quiz-retry" onClick={onRetryQuiz} type="button">전투 결과 확인 →</button>

            ) : (

              <button className="quiz-retry" onClick={onRetryQuiz} type="button">🔄 다시 도전하기</button>

            )}
          </div>
        ) : (
          <aside aria-label="최근 전투 기록" className="quiz-rule">
            <b>최근 전투 기록</b>
            {battleLog ? (
              <div>
                <small>{formatBattleLogMeta(battleLog)}</small>
                <strong>{battleLog.text}</strong>
                {battleLog.detail && <span>{battleLog.detail}</span>}
              </div>
            ) : <span>전투 기록이 아직 없습니다.</span>}
          </aside>
        )}
      </section>
      {zoomDiagram && (
        <div className="diagram-modal-backdrop" onClick={() => setZoomDiagram(null)}>
          <div className="diagram-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>📖 {quiz.diagramTitle ?? "국어 문법 개념 안내표"}</h3>
              <button onClick={() => setZoomDiagram(null)} type="button">닫기 ✕</button>
            </header>
            <div className="diagram-modal-body">
              <img alt="국어 문법 개념 안내표 크게 보기" decoding="async" src={zoomDiagram} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function getCardRole(card: CombatCard) { return ({ attack: "공격", magic: "마법", defense: "수비", dodge: "회피", heal: "회복", strategy: "전략", boost: "강화" } as const)[card.role]; }
function getCardRoleColor(card: CombatCard) { return ({ attack: "coral", magic: "violet", defense: "cyan", dodge: "mint", heal: "cyan", strategy: "amber", boost: "orange" } as const)[card.role]; }
function ActionPanel({ battle, difficulty, onEndTurn, onPlayCard, onRedraw, preview = false }: { battle: BattleState; difficulty: AdventureDifficulty; onEndTurn: () => void; onPlayCard: (card: CombatCard) => void; onRedraw: () => void; preview?: boolean }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesDialogRef = useDialogKeyboard(rulesOpen, () => setRulesOpen(false));
  const showCardPreview = difficulty === "easy";
  return <section className={`action-panel ${preview ? "preview" : ""}`}><header><div className="hand-heading"><p>YOUR HAND · {battle.hand.length}/5 · 버림 {battle.discardCount}</p><strong>{preview ? "문제를 푸는 동안에는 손패를 확인만 할 수 있어요." : "행동력 안에서 공격·방어·회피·마법 카드를 조합하세요."}</strong></div><div className="action-controls"><button aria-haspopup="dialog" className="card-draw-rules" onClick={() => setRulesOpen(true)} type="button">☷ 카드 뽑기 규칙</button>{!preview && <><button className="redraw-button" disabled={battle.energy < 2} onClick={onRedraw}>↻ 새로 뽑기 <b>2</b></button><button onClick={onEndTurn}>{battle.bossHp <= 0 ? "승리 확인" : "턴 종료"} →</button></>}</div></header><div className="combat-hand">{battle.hand.map((card) => { const cardPreview = getCardPreview(battle, card); const ariaLabel = `${card.name}: 비용 ${card.cost}, ${getCardRole(card)}, ${card.description}${showCardPreview ? `. 예상 결과: ${cardPreview}` : ""}`; return <button aria-label={ariaLabel} className={getCardRoleColor(card)} disabled={preview || card.cost > battle.energy || battle.bossHp <= 0} key={card.instanceId} onClick={() => onPlayCard(card)}><span className="card-cost">{card.cost}</span><small className="card-role">{getCardRole(card)}</small><i aria-hidden="true">{card.symbol}</i><strong className="card-name">{card.name}</strong><em>{card.description}</em>{showCardPreview && <small className="card-preview">{cardPreview}</small>}</button>; })}</div>{rulesOpen && <div className="card-rules-backdrop" onMouseDown={() => setRulesOpen(false)}><section aria-labelledby="card-rules-title" aria-modal="true" className="card-rules-modal" onMouseDown={(event) => event.stopPropagation()} ref={rulesDialogRef} role="dialog"><header><div><p>CARD DRAW RULES</p><h2 id="card-rules-title">카드 뽑기 규칙</h2></div><button aria-label="카드 뽑기 규칙 닫기" onClick={() => setRulesOpen(false)} type="button">×</button></header><ol><li><b>1</b><div><strong>시작 손패 공격 보장</strong><span>시작할 때 공격 카드는 1~2장만 들어와요.</span></div></li><li><b>2</b><div><strong>정답 보상 드로우</strong><span>정답을 맞히면 빈 손패 자리에 카드 1장을 뽑아요.</span></div></li><li><b>3</b><div><strong>턴 시작 드로우</strong><span>턴이 시작될 때 손패가 3장 이하라면 카드 1장을 뽑아요.</span></div></li><li><b>4</b><div><strong>같은 카드 중복 제한</strong><span>같은 이름의 카드는 손에 1장만 뽑아요.</span></div></li></ol><button className="card-rules-close" onClick={() => setRulesOpen(false)} type="button">확인했어요</button></section></div>}</section>;
}
function Result({ earnedItem, earnedTitles, onNext, onSetup, score, stage, won }: { earnedItem: RewardItem | null; earnedTitles: AdventureTitle[]; onNext: () => void; onSetup: () => void; score: number; stage: (typeof stages)[number]; won: boolean }) { return <main className="result-page"><section><span className="result-icon">{won ? "✦" : "↻"}</span><p className="eyebrow">BOSS BATTLE RESULT</p><h1>{won ? `${stage.bossName} 격파!` : "집중력이 모두 소진됐어요"}</h1><p>{won ? `${stage.shortTitle}의 말글 조각을 되찾았습니다. 퀴즈로 얻은 행동력을 카드 전략으로 바꾸는 데 성공했어요.` : "개념 설명을 다시 확인하고 방어·회피 카드로 보스 행동에 대비해 보세요."}</p>{earnedItem && <div className="reward-item-earned" style={{ "--item": earnedItem.color } as React.CSSProperties}><i>{earnedItem.icon}</i><span><small>새 고유 유물 획득</small><strong>{earnedItem.name}</strong><em>{earnedItem.description}</em></span></div>}{earnedTitles.map((title) => { const titleDetail = getTitleDifficulty(title.difficulty); return <div className="earned-title" key={title.id} style={{ "--title-color": titleDetail.color } as React.CSSProperties}><i>{title.kind === "score" ? "✹" : titleDetail.mark}</i><span><small>새 칭호 획득 · {titleDetail.label}</small><strong>{title.name}</strong><em>{title.condition}</em></span></div>; })}<div className="result-score"><span>획득 점수</span><strong>{score}</strong></div><div className="result-actions"><button onClick={onNext}>{won ? stage.id === 5 ? "엔딩 보기" : "다음 구역" : "다시 도전"} →</button><button className="secondary" onClick={onSetup}>구역 선택</button></div></section></main>; }
function Ending({ character, collectedTitleIds, onMain, onRefreshTitles, score }: { character: (typeof characters)[number]; collectedTitleIds: string[]; onMain: () => void; onRefreshTitles: () => string[]; score: number }) {
  const [step, setStep] = useState<"dialogue" | "epilogue" | "celebration">("dialogue");
  const [epilogueIndex, setEpilogueIndex] = useState(0);
  const [titleCabinetOpen, setTitleCabinetOpen] = useState(false);

  const heroSpeech = character.id === "bau"
    ? "네! 해냈어요! 문장의 주인공인 주어를 바르게 세우고, 서술어와 목적어를 든든하게 지켜내어 드디어 뒤죽박죽 마왕을 정화했어요! 문장의 중심이 바로 설 때 사람들의 마음도 바르게 이어진다는 걸 배웠답니다!"
    : character.id === "ara"
    ? "네! 넓은 말글 세상에서 알맞은 목적어와 낱말 조각들을 쏙쏙 찾아냈어요. 주어와 서술어 사이에 알맞은 낱말이 놓일 때 문장이 풍성하게 살아 숨 쉰다는 걸 확인했답니다!"
    : "네! 시간과 높임의 약속을 지키고, 부정하는 말과 어울리는 표현을 완벽하게 찾아냈습니다! 앞말과 뒷말이 서로를 배려하며 호응할 때 세상에서 가장 아름다운 말이 완성된다는 것을 증명했어요!";

  const epilogueDialogue = [
    {
      speaker: "말글 전당의 수호신",
      roleTag: "🕊️ 정화된 말글 왕국의 수호신",
      portrait: "/characters/boss-stage-5-chaos.webp",
      title: "아름다운 문장의 귀환",
      speech: "…아아, 온 세상을 뒤흔들던 엉터리 말과 뒤틀린 소음이 멎고… 가슴속 깊은 곳까지 맑고 가지런한 글빛이 차오르는구나! 나의 뒤틀린 마음을 정화하고 말글 세상에 진정한 조화를 되찾아준 이들이… 바로 그대들이었는가?",
    },
    {
      speaker: character.name,
      roleTag: `✨ ${character.role || "문장 수호대장"}`,
      portrait: character.image,
      title: "함께 엮어낸 바른 문장의 기적",
      speech: heroSpeech,
    },
    {
      speaker: "글별이",
      roleTag: "✨ 말글 나라의 별빛 안내자",
      portrait: "/characters/geulbyeol.webp",
      title: "되살아난 온 세상의 문장",
      speech: "보세요! 안개 걷힌 언덕에서 사람들이 정다운 인사를 나누고, 시계탑 정원과 말글 전당 위로 영롱한 황금 문장들이 펼쳐지고 있어요! 문장의 법칙을 믿고 끝까지 카드를 지휘해준 당신이 있었기에 가능했던 기적이에요!",
    },
    {
      speaker: "말글 전당의 수호신",
      roleTag: "🕊️ 말글 왕국의 거대한 수호신",
      portrait: "/characters/boss-stage-5-chaos.webp",
      title: "최고의 문장 마스터에게 바치는 경의",
      speech: "고맙구나, 꼬마 수호자여. 그대가 조율해준 이 아름다운 문장들은 말글 세상의 모든 골짜기와 마을에 영원히 울려 퍼질 것이다. 이제 그대에게 말글 세상 최고의 영예를 바치노라!",
    },
    {
      speaker: "말글 수호대 모두 함께",
      roleTag: "👑 글별이 · 바우 · 아라 · 나래",
      portrait: "/characters/geulbyeol.webp",
      title: "영원히 기억될 대단원 피날레",
      speech: "당신이야말로 혼란을 잠재우고 바른 문장을 완성한 '위대한 문장의 대수호자'입니다! 우리가 함께 엮어낸 모험을 영원히 잊지 않을게요, 수호자님!",
    },
  ];

  const currentDialogue = epilogueDialogue[epilogueIndex];

  if (step === "dialogue") {
    return (
      <main className="ending-epilogue-page">
        <div className="epilogue-overlay" />
        <section aria-label="엔딩 에필로그 대화" className="epilogue-dialogue-shell">
          <header className="epilogue-header">
            <span className="epilogue-badge">🌟 GRAND EPILOGUE · 대단원의 막</span>
            <div className="epilogue-header-right">
              <span className="epilogue-step-indicator">{epilogueIndex + 1} / {epilogueDialogue.length}</span>
              <button className="epilogue-skip-btn" onClick={() => setStep("celebration")} type="button">
                스킵하고 결과 보기 ⏭️
              </button>
            </div>
          </header>

          <div className="epilogue-stage">
            <div className="epilogue-portrait-box">
              <img alt={currentDialogue.speaker} className="epilogue-portrait-img" src={currentDialogue.portrait} />
              <div className="portrait-glow" />
            </div>

            <div className="epilogue-speech-card">
              <div className="speaker-header">
                <span className="speaker-role">{currentDialogue.roleTag}</span>
                <strong className="speaker-name">{currentDialogue.speaker}</strong>
              </div>
              <h3 className="speech-title">{currentDialogue.title}</h3>
              <p className="speech-body">&ldquo;{currentDialogue.speech}&rdquo;</p>

              <div className="epilogue-controls">
                {epilogueIndex > 0 ? (
                  <button className="epilogue-prev-btn" onClick={() => setEpilogueIndex((prev) => prev - 1)} type="button">
                    ← 이전 이야기
                  </button>
                ) : <span />}

                {epilogueIndex < epilogueDialogue.length - 1 ? (
                  <button className="epilogue-next-btn" onClick={() => setEpilogueIndex((prev) => prev + 1)} type="button">
                    다음 이야기 →
                  </button>
                ) : (
                  <button className="epilogue-next-btn finish" onClick={() => setStep("celebration")} type="button">
                    🎉 영광의 엔딩 확인하기 →
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="ending-page">
      <section className="ending-card">
        <div className="ending-party">
          <img alt="바우" src="/characters/bau.webp" />
          <img alt="글별이" src="/characters/geulbyeol.webp" />
          <img alt="아라" src="/characters/ara.webp" />
          <img alt="나래" src="/characters/narae.webp" />
        </div>
        <p className="eyebrow">ADVENTURE COMPLETE · GRAND FINALE</p>
        <h1>말글 세상의 바른 문장을 되찾았습니다!</h1>
        <p className="ending-lead-desc">
          주어, 서술어, 목적어와 문장의 호응을 완벽히 지휘하여 말글 세상에 평화와 아름다운 대화를 복원했습니다.
        </p>

        {/* 5개 챕터 모험 완주 훈장 그리드 */}
        <div className="ending-chapters-grid">
          <div className="chapter-badge-item">
            <span className="chapter-num">1장 완료 🌿</span>
            <strong>주어의 숲</strong>
            <small>누가/무엇이 주어의 비밀 정복</small>
          </div>
          <div className="chapter-badge-item">
            <span className="chapter-num">2장 완료 ❄️</span>
            <strong>서술어의 빙하</strong>
            <small>어찌하다/어떠하다 서술어 정복</small>
          </div>
          <div className="chapter-badge-item">
            <span className="chapter-num">3장 완료 🗼</span>
            <strong>목적어의 탑</strong>
            <small>무엇을 목적어와 3단 구조 완성</small>
          </div>
          <div className="chapter-badge-item">
            <span className="chapter-num">4장 완료 🏛️</span>
            <strong>시간과 높임의 신전</strong>
            <small>시간·높임 바른 호응 조율</small>
          </div>
          <div className="chapter-badge-item">
            <span className="chapter-num">5장 완료 ✨</span>
            <strong>혼돈의 성</strong>
            <small>부정·인과 호응과 바른 문장 완성</small>
          </div>
        </div>

        <div className="ending-title-card">
          <span className="title-shine">👑 최종 수여 칭호</span>
          <strong className="ending-title">위대한 문장의 대수호자</strong>
          <p className="title-desc">모든 문장의 질서를 바로잡고 말글 세상을 구원한 전설의 수호자</p>
        </div>

        <div className="ending-score-box">
          <span>마지막 전투 점수</span>
          <strong>{score}</strong>
        </div>

        <div className="ending-action-buttons">
          <button className="replay-story-btn" onClick={() => { setStep("dialogue"); setEpilogueIndex(0); }} type="button">
            이야기 다시 보기 ↺
          </button>
          <button
            className="ending-title-btn"
            onClick={() => {
              onRefreshTitles();
              setTitleCabinetOpen(true);
            }}
            type="button"
          >
            칭호 보관함 확인 🏅
          </button>
          <button className="primary-button" onClick={onMain} type="button">
            메인 화면으로 🏰
          </button>
        </div>
      </section>
      {titleCabinetOpen && (
        <TitleCollection
          collectedTitleIds={collectedTitleIds}
          onClose={() => setTitleCabinetOpen(false)}
          onRefresh={onRefreshTitles}
        />
      )}
    </main>
  );
}

function MobileRestrictionNotice() {
  return (
    <div className="mobile-restriction-backdrop">
      <div className="mobile-restriction-card">
        {/* 상단 안내 뱃지 */}
        <div className="mobile-restriction-badge">
          <span>⚠️</span>
          <span>스마트폰 이용 제한 안내</span>
        </div>

        {/* 디바이스 아이콘 */}
        <div className="mobile-restriction-icon-box">
          <span>🖥️</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h3 className="mobile-restriction-title">
            스마트폰 환경에서는<br />이용할 수 없어요!
          </h3>
          <p className="mobile-restriction-desc">
            럭키팡: 문장던전은 다채로운 국어 문장 탐구와 3D 문법 개념표, 문장 조립 실습을 위해 <strong>PC 및 태블릿 환경</strong>에 최적화되어 있습니다.
          </p>
        </div>

        {/* 권장 기기 안내 박스 */}
        <div className="mobile-restriction-device-guide">
          <div className="mobile-restriction-device-row">
            <span className="device-emoji">💻</span>
            <div className="device-info">
              <div className="device-name-wrap">
                <span className="device-name">PC / 노트북 / 크롬북</span>
                <span className="recommend-tag">★ 가장 추천</span>
              </div>
              <span className="device-tip">🖱️ <b>마우스와 키보드로 실습</b>할 때 가장 쾌적하고 편리해요!</span>
            </div>
          </div>
          <div className="mobile-restriction-device-row">
            <span className="device-emoji">📱</span>
            <div className="device-info">
              <span className="device-name">태블릿 (iPad, 갤럭시 탭)</span>
              <span className="device-tip" style={{ color: "#64748b" }}>넓은 대화면 터치로 원활하게 플레이 가능</span>
            </div>
          </div>
        </div>

        {/* 하단 안내 문구 */}
        <div className="mobile-restriction-footer-note">
          📖 PC나 태블릿에서 더 넓고 즐겁게 럭키팡: 문장던전을 모험해 보세요! ✨
        </div>
      </div>
    </div>
  );
}
