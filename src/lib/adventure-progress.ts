import type { StageId } from "./content.ts";
import type { RewardItemId } from "./reward-items.ts";

const KEY = "luckypang-v3-range-unlocked";
const ITEM_KEY = "luckypang-v3-range-items";
const USED_ITEM_KEY = "luckypang-v3-range-used-items";

export function loadUnlockedStage(storage: Pick<Storage, "getItem">): StageId {
  const saved = Number(storage.getItem(KEY));
  return saved >= 1 && saved <= 5 ? saved as StageId : 1;
}

export function saveUnlockedStage(storage: Pick<Storage, "setItem">, stageId: StageId) {
  storage.setItem(KEY, String(stageId));
}

function loadItemIds(storage: Pick<Storage, "getItem">, key: string): RewardItemId[] {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is RewardItemId => typeof value === "string") : [];
  } catch { return []; }
}

export function loadRewardItems(storage: Pick<Storage, "getItem">) { return loadItemIds(storage, ITEM_KEY); }
export function loadUsedRewardItems(storage: Pick<Storage, "getItem">) { return loadItemIds(storage, USED_ITEM_KEY); }
export function saveRewardItems(storage: Pick<Storage, "setItem">, itemIds: RewardItemId[]) { storage.setItem(ITEM_KEY, JSON.stringify(itemIds)); }
export function saveUsedRewardItems(storage: Pick<Storage, "setItem">, itemIds: RewardItemId[]) { storage.setItem(USED_ITEM_KEY, JSON.stringify(itemIds)); }

export function clearAdventureProgress(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(KEY);
  storage.removeItem(ITEM_KEY);
  storage.removeItem(USED_ITEM_KEY);
}
