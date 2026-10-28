import type { StageId } from "./content";
import type { AdventureDifficulty } from "./game";

export type CharacterId = "bau" | "ara" | "narae";

export type AdventureTitle = {
  id: string;
  characterId: CharacterId;
  difficulty: AdventureDifficulty;
  name: string;
  condition: string;
  kind: "campaign" | "score";
};

export const titleDifficultyDetails = {
  easy: { label: "쉬움", mark: "◆", color: "#218a70" },
  normal: { label: "보통", mark: "★", color: "#5042ca" },
  hard: { label: "어려움", mark: "✦", color: "#b13878" },
} satisfies Record<AdventureDifficulty, { label: string; mark: string; color: string }>;

const titleNames: Record<CharacterId, Record<AdventureDifficulty, readonly [string, string, string, string, string]>> = {
  bau: {
    easy: ["새싹 주어 수호자", "문장 완성 견습기사", "바른 주어 방패", "바른 문장 지킴이", "첫 문장 수호대장"],
    normal: ["주어 규칙 수호기사", "서술어 연계 기사", "문장 뼈대 조율사", "말글 질서 기사", "문장의 대수호자"],
    hard: ["철벽 문장 수호신", "완전한 주어 철갑", "단단한 바우 방패", "말글 성운 수호자", "오대 문장 절대수호자"],
  },
  ara: {
    easy: ["낱말 숲 길잡이", "목적어 보물 견습자", "말글 돋보기 탐험가", "어휘 조각 탐색가", "문장 지도지기"],
    normal: ["풍부한 낱말 탐험가", "목적어 추적가", "말글 바다 항해사", "바른 문장 해독가", "말글 질서 탐험가"],
    hard: ["낱말 미로 돌파자", "완벽한 목적어 탐색가", "아라의 황금 돋보기", "문장 심해 항해사", "오대 낱말 대탐험가"],
  },
  narae: {
    easy: ["호응 마법 견습생", "시간 짝꿍 조율사", "높임말 깃펜 마법사", "부정 호응술사", "말글 날개 조율사"],
    normal: ["호응 법칙 해석가", "시간 높임 조율사", "짝꿍 낱말 연금술사", "부정 호응 마도사", "문장 조화 대마도사"],
    hard: ["호응 봉인 대마도사", "완벽한 나래 조율신", "말글 조화 연금술사", "호응 대현자", "오대 호응 성운 현자"],
  },
};

const characterIds: CharacterId[] = ["bau", "ara", "narae"];
const difficultyIds: AdventureDifficulty[] = ["easy", "normal", "hard"];

const scoreTitleNames: Record<CharacterId, Record<AdventureDifficulty, string>> = {
  bau: { easy: "새싹 수호 명인", normal: "정밀 뼈대 명인", hard: "전설 문장 수호대장" },
  ara: { easy: "낱말 점수 길잡이", normal: "어휘 점수 탐험가", hard: "대항해 낱말 대탐험가" },
  narae: { easy: "새싹 호응 조율사", normal: "조화 성운 마도사", hard: "대현자 호응 대마도사" },
};

export const scoreTitleThresholds = { easy: 800, normal: 900, hard: 1000 } satisfies Record<AdventureDifficulty, number>;

const campaignTitles: AdventureTitle[] = characterIds.flatMap((characterId) => difficultyIds.flatMap((difficulty) =>
  titleNames[characterId][difficulty].map((name, index) => ({
    id: `title-${characterId}-${difficulty}-${index + 1}`,
    characterId,
    difficulty,
    name,
    condition: `${titleDifficultyDetails[difficulty].label} 난이도 · 전 스테이지 완주`,
    kind: "campaign" as const,
  })),
));

const scoreTitles: AdventureTitle[] = characterIds.flatMap((characterId) => difficultyIds.map((difficulty) => ({
  id: `score-title-${characterId}-${difficulty}`,
  characterId,
  difficulty,
  name: scoreTitleNames[characterId][difficulty],
  condition: `${titleDifficultyDetails[difficulty].label} 난이도 · 한 전투 ${scoreTitleThresholds[difficulty]}점 이상 승리`,
  kind: "score" as const,
})));

export const adventureTitles: AdventureTitle[] = [...campaignTitles, ...scoreTitles];

const titleStorageKey = "luckypang-v3-range-collected-titles";

export function getTitleDifficulty(difficulty: AdventureDifficulty) { return titleDifficultyDetails[difficulty]; }

export function getCampaignClearTitle(characterId: CharacterId, difficulty: AdventureDifficulty, excludedIds: readonly string[]) {
  const candidates = adventureTitles.filter((title) => title.kind === "campaign" && title.characterId === characterId && title.difficulty === difficulty);
  const excluded = new Set(excludedIds);
  const uncollected = candidates.filter((title) => !excluded.has(title.id));
  const pool = uncollected.length > 0 ? uncollected : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getScoreTitle(characterId: CharacterId, difficulty: AdventureDifficulty) {
  return adventureTitles.find((title) => title.kind === "score" && title.characterId === characterId && title.difficulty === difficulty);
}

export function loadCollectedTitleIds(storage: Storage): string[] {
  try {
    const saved = JSON.parse(storage.getItem(titleStorageKey) ?? "[]") as unknown;
    const validIds = new Set(adventureTitles.map((title) => title.id));
    return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === "string" && validIds.has(id)))] : [];
  } catch {
    return [];
  }
}

export function saveCollectedTitleId(storage: Storage, titleId: string) {
  const next = [...new Set([...loadCollectedTitleIds(storage), titleId])];
  storage.setItem(titleStorageKey, JSON.stringify(next));
  return next;
}

export function clearCollectedTitles(storage: Storage) { storage.removeItem(titleStorageKey); }

const campaignProgressStorageKey = "luckypang-v3-range-title-campaign-progress";
export type CampaignProgress = Partial<Record<`${CharacterId}-${AdventureDifficulty}`, StageId[]>>;

export function loadTitleCampaignProgress(storage: Storage): CampaignProgress {
  try {
    const saved = JSON.parse(storage.getItem(campaignProgressStorageKey) ?? "{}") as unknown;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, Array.isArray(value) ? value.filter((id): id is StageId => Number.isInteger(id) && id >= 1 && id <= 5) : []])) as CampaignProgress;
  } catch { return {}; }
}

export function saveTitleCampaignStage(storage: Storage, progress: CampaignProgress, characterId: CharacterId, difficulty: AdventureDifficulty, stageId: StageId) {
  const key = `${characterId}-${difficulty}` as const;
  const next = { ...progress, [key]: [...new Set([...(progress[key] ?? []), stageId])].sort() };
  storage.setItem(campaignProgressStorageKey, JSON.stringify(next));
  return next;
}

export function campaignIsComplete(progress: CampaignProgress, characterId: CharacterId, difficulty: AdventureDifficulty) {
  return (progress[`${characterId}-${difficulty}`] ?? []).length === 5;
}

export function clearTitleCampaignProgress(storage: Storage) { storage.removeItem(campaignProgressStorageKey); }
