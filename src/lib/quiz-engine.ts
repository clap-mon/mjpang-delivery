import type { StageId } from "./content.ts";

export type Difficulty = "EASY" | "NORMAL" | "HARD";
export type QuizOption = {
  id: string;
  text: string;
  symbol?: string;
  symbols?: string[];
  equation?: { leftIcon: string; rightIcons: string[] };
  isCorrect: boolean;
  isLucky: boolean;
  isBomb: boolean;
  explanation: string;
  misconception?: string;
};
export type ReferenceNote = {
  tag: string;
  label: string;
  desc: string;
  symbol: string;
};

export type Quiz = {
  id: string;
  stageId: StageId;
  prompt: string;
  diagram?: string;
  diagramTitle?: string;
  referenceNote?: ReferenceNote;
  difficulty: Difficulty;
  options: QuizOption[];
};

// 레거시 인터페이스 호환을 위한 빈 헬퍼 함수들
export function parseEquationOption(_text: string): { leftIcon: string; rightIcons: string[] } | null {
  return null;
}
export function getSymbolsForText(_text: string): string[] {
  return [];
}
export function getSymbolForText(_text: string): string | undefined {
  return undefined;
}

export function getDiagramForStage(stageId: StageId, _prompt: string): { src: string; title: string } | undefined {
  if (stageId === 1) return { src: "/images/bg-stage1.jpg", title: "문장의 주인공! 주어의 개념 정리" };
  if (stageId === 2) return { src: "/images/bg-stage2.jpg", title: "서술어 3총사(동작·상태·정체) 정리" };
  if (stageId === 3) return { src: "/images/bg-stage3.jpg", title: "목적어의 개념과 문장의 짜임 정리" };
  if (stageId === 4) return { src: "/images/bg-stage4.jpg", title: "시간과 높임의 호응 정리" };
  if (stageId === 5) return { src: "/images/bg-stage5.jpg", title: "부정·인과 호응과 바른 문장 정리" };
  return undefined;
}

export function makePrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function seedForQuiz(stageId: StageId, round: number, session = "sentence-v1"): number {
  let hash = 2166136261;
  for (const char of `${session}:${stageId}:${round}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function int(rng: () => number, min: number, max: number) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick<T>(rng: () => number, values: T[]): T { return values[int(rng, 0, values.length - 1)]; }
function shuffle<T>(rng: () => number, values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) { const j = int(rng, 0, i); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

function finalize(stageId: StageId, round: number, prompt: string, difficulty: Difficulty, rows: (Omit<QuizOption, "id" | "isLucky" | "isBomb"> & { symbol?: string })[], rng: () => number, referenceNote?: ReferenceNote): Quiz {
  if (rows.length !== 5 || rows.filter((row) => row.isCorrect).length !== 3 || new Set(rows.map((row) => row.text)).size !== 5) {
    throw new Error("퀴즈는 서로 다른 보기 5개와 정답 3개로 구성해야 합니다.");
  }
  const correct = rows.filter((row) => row.isCorrect);
  const wrong = rows.filter((row) => !row.isCorrect);
  const luckyText = pick(rng, correct).text;
  const bombText = pick(rng, wrong).text;
  const options = rows.map((row, index) => {
    return {
      ...row,
      id: `s${stageId}-r${round}-o${index}`,
      symbol: row.symbol,
      symbols: row.symbol ? [row.symbol] : [],
      isLucky: row.text === luckyText,
      isBomb: row.text === bombText,
    };
  });
  const diagramInfo = getDiagramForStage(stageId, prompt);
  return {
    id: `stage-${stageId}-round-${round}`,
    stageId,
    prompt,
    diagram: diagramInfo?.src,
    diagramTitle: diagramInfo?.title,
    referenceNote,
    difficulty,
    options: shuffle(rng, options),
  };
}

type QuestionTemplate = {
  prompt: string;
  referenceNote?: ReferenceNote;
  correct: { text: string; explanation: string; symbol?: string }[];
  wrong: { text: string; explanation: string; misconception: string; symbol?: string }[];
};

// ==================== STAGE 1: 주어의 숲 (보스: 헛깨비) ====================
const stage1Templates: QuestionTemplate[] = [
  // 유형 1: 문장에서 '누가/무엇이'에 해당하는 주어 찾기
  {
    prompt: "문장에서 행동을 하거나 상태의 주인공인 [주어(누가/무엇이)] 역할을 하는 낱말 카드를 고르세요.",
    correct: [
      { text: "지호가", explanation: "'지호가'는 문장에서 행동을 하는 주인공(주어)이에요." },
      { text: "토끼가", explanation: "'토끼가'는 살아 움직이는 주인공인 '누가'에 해당하는 주어예요." },
      { text: "봄바람이", explanation: "'봄바람이'는 자연현상인 '무엇이'에 해당하는 문장의 주어예요." },
      { text: "별들이", explanation: "'별들이'는 하늘에서 환하게 빛나는 주인공(주어)이에요." },
      { text: "민수가", explanation: "'민수가'는 문장에서 행동을 하는 주인공(주어)이에요." },
      { text: "시냇물이", explanation: "'시냇물이'는 졸졸 맑게 흐르는 주인공(주어)이에요." },
      { text: "다람쥐가", explanation: "'다람쥐가'는 숲속에서 도토리를 모으는 주인공(주어)이에요." },
      { text: "자동차가", explanation: "'자동차가'는 도로 위를 힘차게 달리는 주인공(주어)이에요." },
      { text: "나비가", explanation: "'나비가'는 꽃밭을 훨훨 날아다니는 주인공(주어)이에요." },
      { text: "해님이", explanation: "'해님이'는 온 세상을 따스하게 비추는 주인공(주어)이에요." },
      { text: "선생님이", explanation: "'선생님이'는 교실에서 학생들을 가르치시는 주인공(주어)이에요." },
      { text: "비행기가", explanation: "'비행기가'는 푸른 하늘을 날아가는 주인공(주어)이에요." },
    ],
    wrong: [
      { text: "달린다", explanation: "'달린다'는 주어의 움직임을 나타내는 서술어예요.", misconception: "움직임을 나타내는 서술어를 주어로 혼동한 오개념이에요." },
      { text: "지도를", explanation: "'지도를'은 동작의 대상이 되는 목적어예요.", misconception: "'을/를'이 붙는 목적어를 주어로 착각한 오개념이에요." },
      { text: "빠르게", explanation: "'빠르게'는 서술어를 꾸며 주는 말이에요.", misconception: "꾸며 주는 말을 문장의 주인공으로 오해한 오개념이에요." },
      { text: "예쁘다", explanation: "'예쁘다'는 성질이나 상태를 나타내는 서술어예요.", misconception: "성질이나 상태를 나타내는 말을 주어로 착각한 오개념이에요." },
      { text: "열쇠를", explanation: "'열쇠를'은 찾는 대상이 되는 목적어예요.", misconception: "동작의 대상인 목적어를 주어로 잘못 고른 오개념이에요." },
      { text: "조용히", explanation: "'조용히'는 행동하는 태도를 꾸며 주는 말(부사어)이에요.", misconception: "서술어를 꾸며 주는 말을 주어로 잘못 고른 오개념이에요." },
      { text: "운동장에서", explanation: "'운동장에서'는 행동이 일어나는 장소를 나타내는 말이에요.", misconception: "장소를 나타내는 말을 문장의 주어로 오해한 오개념이에요." },
      { text: "어제", explanation: "'어제'는 일이 일어난 때를 나타내는 시간 표현이에요.", misconception: "시간을 나타내는 말을 주어로 착각한 오개념이에요." },
    ],
  },
  // 유형 2: 문장 속 진짜 주어 찾기 (문장 맨 앞 장소·시간 부사어 및 목적어 함정 극복)
  {
    prompt: "문장 앞의 장소나 때를 나타내는 말에 속지 않고, 문장의 진짜 주인공인 [주어] 카드를 고르세요.",
    correct: [
      { text: "다람쥐가", explanation: "'숲속에서 다람쥐가 도토리를 줍는다'에서 행동의 주인공인 주어예요." },
      { text: "해바라기가", explanation: "'화단에 해바라기가 활짝 피었다'에서 피어난 주인공인 주어예요." },
      { text: "친구가", explanation: "'교실에서 친구가 책을 읽는다'에서 책을 읽는 주인공인 주어예요." },
      { text: "봄비가", explanation: "'밤새 봄비가 메마른 땅을 적셨다'에서 땅을 적신 주인공인 주어예요." },
      { text: "지호가", explanation: "'운동장에서 지호가 공을 찼다'에서 공을 찬 주인공인 주어예요." },
      { text: "달님이", explanation: "'어두운 밤하늘에 달님이 밝게 떠올랐다'에서 떠오른 주인공인 주어예요." },
    ],
    wrong: [
      { text: "숲속에서", explanation: "문장 앞머리에 오지만 일어난 장소를 나타내는 부사어예요.", misconception: "문장 맨 앞에 온다고 해서 무조건 주어로 착각한 오개념이에요." },
      { text: "어제", explanation: "일이 일어난 때를 나타내는 시간 표현이에요.", misconception: "문장 시작 부분의 시간 표현을 주어로 오해한 오개념이에요." },
      { text: "도토리를", explanation: "줍는 동작의 대상이 되는 목적어예요.", misconception: "'을/를'이 붙는 목적어를 주어로 착각한 오개념이에요." },
      { text: "활짝", explanation: "피어난 모습을 실감 나게 꾸며 주는 말(부사어)이에요.", misconception: "동작이나 상태를 꾸며 주는 말을 주어로 잘못 고른 오개념이에요." },
      { text: "교실에서", explanation: "행동이 일어나는 장소를 나타내는 부사어예요.", misconception: "장소를 나타내는 말을 문장의 주인으로 혼동한 오개념이에요." },
      { text: "밤새", explanation: "밤이 지나는 동안을 나타내는 시간 표현이에요.", misconception: "문장 앞의 시간 표현을 주어로 착각한 오개념이에요." },
    ],
  },
  // 유형 3: 웃어른을 공경하여 높이는 올바른 주어 표현 ('~께서')
  {
    prompt: "웃어른을 문장의 주인공으로 정중하게 높여 나타낸 [올바른 주어] 카드를 고르세요.",
    correct: [
      { text: "할머니께서", explanation: "웃어른인 할머니를 정중하게 높여 '께서'를 붙였어요." },
      { text: "선생님께서", explanation: "존경하는 선생님 뒤에 높임말인 '께서'가 바르게 붙었어요." },
      { text: "어머니께서", explanation: "웃어른인 어머니께 '께서'를 붙여 공경을 표현했어요." },
      { text: "교장선생님께서", explanation: "학교의 웃어른이신 교장선생님 뒤에 '께서'가 올바르게 쓰였어요." },
      { text: "아버지께서", explanation: "가정의 웃어른이신 아버지께 '께서'를 붙여 바르게 높였어요." },
      { text: "할아버지께서", explanation: "웃어른인 할아버지께 높임의 말 '께서'가 자연스럽게 붙었어요." },
    ],
    wrong: [
      { text: "친구께서", explanation: "친구는 또래이므로 '께서'를 쓰지 않고 '친구가'라고 해요.", misconception: "동급의 또래 친구에게 지나친 높임 표현인 '께서'를 잘못 쓴 오개념이에요." },
      { text: "동생께서", explanation: "동생은 아랫사람이므로 '께서' 대신 '동생이'라고 해야 맞아요.", misconception: "아랫사람에게 높임말 '께서'를 잘못 붙인 오개념이에요." },
      { text: "토끼께서", explanation: "동물에게는 높임말 '께서'를 쓰지 않고 '토끼가'라고 해요.", misconception: "동물에게 사람 웃어른 높임말을 잘못 적용한 오개념이에요." },
      { text: "짝꿍께서", explanation: "짝꿍은 또래 친구이므로 '짝꿍이'라고 해야 자연스러워요.", misconception: "친구 사이의 호칭에 어울리지 않는 높임말을 쓴 오개념이에요." },
      { text: "강아지께서", explanation: "반려동물에게는 웃어른 높임말 '께서'를 붙이지 않아요.", misconception: "동물에게 공경 표현을 잘못 쓴 오개념이에요." },
    ],
  },
  // 유형 4: 빈칸에 들어갈 가장 알맞은 주어 고르기
  {
    prompt: "'숲속의 ( ___ ) 맑은 목소리로 지저귑니다.' 빈칸에 들어갈 알맞은 주어를 고르세요.",
    correct: [
      { text: "종달새가", explanation: "종달새는 맑은 목소리로 지저귀는 알맞은 주어예요." },
      { text: "참새들이", explanation: "참새들은 짹짹 지저귀는 행동을 하는 올바른 주어예요." },
      { text: "산새가", explanation: "산새는 숲속에서 아름답게 노래하는 알맞은 주어예요." },
      { text: "꾀꼬리가", explanation: "꾀꼬리는 맑고 고운 소리로 지저귀는 올바른 주어예요." },
      { text: "파랑새가", explanation: "파랑새는 숲속을 날아다니며 지저귀는 알맞은 주어예요." },
    ],
    wrong: [
      { text: "돌멩이가", explanation: "돌멩이는 생물이 아니므로 소리 내어 지저귈 수 없어요.", misconception: "서술어의 동작('지저귑니다')을 할 수 없는 무생물을 주어로 고른 오개념이에요." },
      { text: "자동차가", explanation: "자동차는 숲속에서 새처럼 지저귀지 않아요.", misconception: "문맥상 서술어와 호응하지 않는 엉뚱한 주어를 고른 오개념이에요." },
      { text: "모자가", explanation: "모자는 물건이므로 지저귀는 행동의 주어가 될 수 없어요.", misconception: "문맥과 어울리지 않는 사물을 주어로 착각한 오개념이에요." },
      { text: "의자가", explanation: "의자는 앉는 가구이므로 지저귀는 주어가 될 수 없어요.", misconception: "서술어의 동작 주체를 고려하지 않은 오개념이에요." },
      { text: "연필이", explanation: "연필은 글씨를 쓰는 도구라 지저귈 수 없어요.", misconception: "서술어의 성격과 맞지 않는 주어를 고른 오개념이에요." },
    ],
  },
  // 유형 5: 주어가 온전하게 들어 있는 바른 문장 카드
  {
    prompt: "문장의 주인공인 [주어가 바르게 들어 있는] 온전한 문장 카드를 고르세요.",
    correct: [
      { text: "친구가 지도를 펼쳤다.", explanation: "'친구가'라는 주어가 명확하게 들어 있는 온전한 문장이에요." },
      { text: "기사가 앞장서서 걸어갔다.", explanation: "'기사가'라는 주인공 주어가 뚜렷한 올바른 문장이에요." },
      { text: "내가 마법 지팡이를 들었다.", explanation: "'내가'라는 주어가 갖추어진 완성된 문장이에요." },
      { text: "글별이가 환하게 웃었다.", explanation: "'글별이가'라는 주어가 행동을 나타내는 바른 문장이에요." },
      { text: "봄비가 조용히 내린다.", explanation: "'봄비가'라는 주어가 분명한 자연스러운 문장이에요." },
    ],
    wrong: [
      { text: "지도를 활짝 펼쳤다.", explanation: "누가 지도를 펼쳤는지 주인공(주어)이 빠져 있어요.", misconception: "주어가 누락되어 누구의 행동인지 알 수 없는 미완성 문장이에요." },
      { text: "앞장서서 씩씩하게 걸어갔다.", explanation: "누가 걸어갔는지 주어가 누락된 불완전한 문장이에요.", misconception: "주어 없이 서술어만 쓰여 문맥이 불분명한 문장이에요." },
      { text: "마법 지팡이를 꼭 쥐었다.", explanation: "누가 쥐었는지 나타내는 주어가 빠져 있어요.", misconception: "동작의 주체인 주어가 생략된 문장을 고른 오개념이에요." },
      { text: "환하게 방긋 웃었다.", explanation: "누가 웃었는지 주어가 없어 온전하지 않아요.", misconception: "서술어만 있고 문장의 주인이 없는 문장이에요." },
      { text: "조용히 땅을 적시며 내린다.", explanation: "무엇이 내리는지 주어가 빠져 있어 불완전해요.", misconception: "주어 성분이 누락된 비문이에요." },
    ],
  },
  // 유형 6: 주어의 특징에 대한 바른 설명 고르기
  {
    prompt: "문장에서 주인공 역할을 하는 [주어]에 대한 설명으로 올바른 것을 고르세요.",
    correct: [
      { text: "문장에서 '누가' 또는 '무엇이'에 해당해요.", explanation: "주어는 동작이나 상태의 주체인 '누가/무엇이'를 나타내요." },
      { text: "문장에서 일어나는 일의 주인공 역할을 해요.", explanation: "주어는 문장 전체를 이끄는 중심 주인공이에요." },
      { text: "웃어른을 높일 때는 뒤에 '~께서'를 붙여요.", explanation: "웃어른에게는 '이/가' 대신 존경의 뜻을 담아 '~께서'를 써요." },
      { text: "문맥이나 대조에 따라 뒤에 '~은/는'이 붙기도 해요.", explanation: "대상을 강조하거나 다른 것과 견줄 때는 '은/는'을 붙여요." },
      { text: "서술어가 누구의 행동인지 밝혀 주는 바탕이에요.", explanation: "주어가 있어야 서술어가 누구를 설명하는지 알 수 있어요." },
      { text: "받침이 있으면 '이', 없으면 '가'가 자연스럽게 어울려요.", explanation: "앞말의 받침 유무에 따라 발음하기 편한 '이'나 '가'가 짝을 이뤄요." },
    ],
    wrong: [
      { text: "문장의 맨 끝에 와서 말을 맺어 줘요.", explanation: "문장 맨 끝에서 말을 맺는 것은 '서술어'의 역할이에요.", misconception: "서술어의 특징을 주어의 특징으로 혼동한 오개념이에요." },
      { text: "동작의 대상이 되며 항상 '을/를'이 붙어요.", explanation: "동작의 대상이 되고 '을/를'이 붙는 것은 '목적어'예요.", misconception: "목적어의 정의를 주어와 착각한 오개념이에요." },
      { text: "문장에서 어떠한 경우에도 절대로 생략할 수 없어요.", explanation: "우리말에서는 말하는 이와 듣는 이가 누군지 알 때 주어를 자연스럽게 생략해요.", misconception: "우리말 문장의 유연한 특성을 오해한 오개념이에요." },
      { text: "항상 움직임이나 동작 그 자체만 나타내요.", explanation: "주어는 인물이나 사물의 이름이지 동작 자체가 아니에요.", misconception: "움직임을 나타내는 서술어(동사)와 주어를 혼동한 오개념이에요." },
      { text: "동물이나 사물에게도 항상 '~께서'를 붙여야 해요.", explanation: "'~께서'는 오직 사람 웃어른을 높일 때만 쓰는 특별한 말이에요.", misconception: "높임 표현의 적용 대상을 잘못 알고 있는 오개념이에요." },
    ],
  },
];

// ==================== STAGE 2: 서술어의 빙하 (보스: 꽁꽁깨비) ====================
const stage2Templates: QuestionTemplate[] = [
  // 유형 1: 주어의 움직임/동작을 나타내는 '어찌하다' 서술어 기본형 카드
  {
    prompt: "주어의 [움직임이나 동작(어찌하다)]을 나타내는 서술어 기본형 카드를 고르세요.",
    correct: [
      { text: "달리다", explanation: "'달리다'는 발로 힘차게 뛰는 움직임(어찌하다)의 기본형이에요." },
      { text: "걷다", explanation: "'걷다'는 발을 번갈아 디디며 나아가는 동작(어찌하다)의 기본형이에요." },
      { text: "날다", explanation: "'날다'는 날개로 공중을 이동하는 움직임(어찌하다)의 기본형이에요." },
      { text: "헤엄치다", explanation: "'헤엄치다'는 물속에서 나아가는 움직임(어찌하다)의 기본형이에요." },
      { text: "웃다", explanation: "'웃다'는 기쁨을 표정이나 소리로 짓는 행동(어찌하다)의 기본형이에요." },
      { text: "노래하다", explanation: "'노래하다'는 목소리로 곡조를 부르는 행동(어찌하다)의 기본형이에요." },
      { text: "뛰다", explanation: "'뛰다'는 바닥을 차고 위로 솟구치는 움직임(어찌하다)의 기본형이에요." },
      { text: "춤추다", explanation: "'춤추다'는 몸을 율동에 맞춰 움직이는 동작(어찌하다)의 기본형이에요." },
    ],
    wrong: [
      { text: "푸르다", explanation: "'푸르다'는 색깔의 성질이나 상태(어떠하다)를 나타내는 형용사예요.", misconception: "성질이나 상태를 나타내는 형용사를 동작으로 혼동한 오개념이에요." },
      { text: "높다", explanation: "'높다'는 공간적 위치의 상태(어떠하다)를 나타내는 말이에요.", misconception: "상태를 나타내는 말을 움직임으로 오인한 오개념이에요." },
      { text: "예쁘다", explanation: "'예쁘다'는 모습이 보기에 좋은 상태(어떠하다)예요.", misconception: "상태 서술어를 동작 서술어로 착각한 오개념이에요." },
      { text: "학생이다", explanation: "'학생이다'는 신분이나 정체(무엇이다)를 밝히는 서술어예요.", misconception: "신분이나 정체 서술어를 동작 서술어로 오해한 오개념이에요." },
      { text: "의사이다", explanation: "'의사이다'는 직업과 신분(무엇이다)을 나타내는 서술어예요.", misconception: "정체 서술어를 동작으로 착각한 오개념이에요." },
      { text: "조용하다", explanation: "'조용하다'는 소리가 없는 고요한 상태(어떠하다)예요.", misconception: "성질/상태를 동작으로 혼동한 오개념이에요." },
      { text: "맑다", explanation: "'맑다'는 깨끗하고 청명한 상태(어떠하다)를 나타내는 말이에요.", misconception: "상태 서술어를 움직임으로 오해한 오개념이에요." },
    ],
  },
  // 유형 2: 주어의 성질이나 모양, 상태를 나타내는 '어떠하다' 서술어 기본형 카드
  {
    prompt: "대상의 [성질이나 모양, 상태(어떠하다)]를 나타내는 서술어 기본형 카드를 고르세요.",
    correct: [
      { text: "맑다", explanation: "'맑다'는 물이나 날씨가 깨끗한 상태(어떠하다)의 기본형이에요." },
      { text: "푸르다", explanation: "'푸르다'는 빛깔의 성질(어떠하다)을 나타내는 기본형이에요." },
      { text: "밝다", explanation: "'밝다'는 빛이 환한 상태(어떠하다)의 기본형이에요." },
      { text: "눈부시다", explanation: "'눈부시다'는 빛이 강렬한 감각적 상태(어떠하다)의 기본형이에요." },
      { text: "높다", explanation: "'높다'는 위치의 높낮이 상태(어떠하다)의 기본형이에요." },
      { text: "아름답다", explanation: "'아름답다'는 모습이 보기 좋은 상태(어떠하다)의 기본형이에요." },
      { text: "조용하다", explanation: "'조용하다'는 주변이 고요한 상태(어떠하다)의 기본형이에요." },
      { text: "따뜻하다", explanation: "'따뜻하다'는 온도의 포근한 상태(어떠하다)의 기본형이에요." },
    ],
    wrong: [
      { text: "달리다", explanation: "'달리다'는 발로 뛰는 움직임(어찌하다)이지 상태가 아니에요.", misconception: "동작 서술어를 상태 서술어로 오해한 오개념이에요." },
      { text: "헤엄치다", explanation: "'헤엄치다'는 물속에서 나아가는 동작(어찌하다)이에요.", misconception: "움직임을 나타내는 말을 성질/상태로 착각한 오개념이에요." },
      { text: "날다", explanation: "'날다'는 하늘을 나는 움직임(어찌하다)이에요.", misconception: "비행 동작을 상태로 오인한 오개념이에요." },
      { text: "학생이다", explanation: "'학생이다'는 신분과 정체(무엇이다)를 밝히는 말이에요.", misconception: "정체 서술어를 상태 서술어로 착각한 오개념이에요." },
      { text: "기사이다", explanation: "'기사이다'는 인물의 신분(무엇이다)이지 성질이 아니에요.", misconception: "정체 서술어를 상태 서술어로 혼동한 오개념이에요." },
      { text: "노래하다", explanation: "'노래하다'는 목소리를 내는 행위(어찌하다)예요.", misconception: "행동 서술어를 상태 서술어로 오해한 오개념이에요." },
      { text: "웃다", explanation: "'웃다'는 감정을 표현하는 동작(어찌하다)이에요.", misconception: "동작 서술어를 상태로 혼동한 오개념이에요." },
    ],
  },
  // 유형 3: 대상의 이름이나 신분, 정체를 나타내는 '무엇이다' 서술어 카드
  {
    prompt: "대상의 [이름이나 신분, 정체(무엇이다)]를 밝히는 서술어 카드를 고르세요.",
    correct: [
      { text: "학생이다", explanation: "'학생이다'는 배움을 얻는 신분과 자격(무엇이다)을 밝히는 서술어예요." },
      { text: "의사이다", explanation: "'의사이다'는 인물의 직업과 신분(무엇이다)을 나타내는 서술어예요." },
      { text: "나무이다", explanation: "'나무이다'는 식물의 이름과 정체(무엇이다)를 밝히는 서술어예요." },
      { text: "보석이다", explanation: "'보석이다'는 물건의 이름과 정체(무엇이다)를 나타내는 서술어예요." },
      { text: "친구이다", explanation: "'친구이다'는 인물 간의 관계와 정체(무엇이다)를 밝히는 서술어예요." },
      { text: "영웅이다", explanation: "'영웅이다'는 훌륭한 사람의 자격(무엇이다)을 나타내는 서술어예요." },
      { text: "기사이다", explanation: "'기사이다'는 인물의 신분과 직업(무엇이다)을 밝히는 서술어예요." },
      { text: "요괴이다", explanation: "'요괴이다'는 상대의 정체와 이름(무엇이다)을 밝히는 서술어예요." },
    ],
    wrong: [
      { text: "달리다", explanation: "'달리다'는 발로 뛰는 움직임(어찌하다)이지 정체가 아니에요.", misconception: "동작 서술어를 정체 서술어로 혼동한 오개념이에요." },
      { text: "맑다", explanation: "'맑다'는 깨끗한 성질이나 상태(어떠하다)예요.", misconception: "상태 서술어를 정체 서술어로 착각한 오개념이에요." },
      { text: "날다", explanation: "'날다'는 공중을 나는 동작(어찌하다)이에요.", misconception: "동작을 정체로 오인한 오개념이에요." },
      { text: "아름답다", explanation: "'아름답다'는 모양의 성질이나 상태(어떠하다)예요.", misconception: "성질을 나타내는 형용사를 정체로 오해한 오개념이에요." },
      { text: "푸르다", explanation: "'푸르다'는 색깔의 성질(어떠하다)이에요.", misconception: "빛깔 상태말을 정체 서술어로 혼동한 오개념이에요." },
      { text: "노래하다", explanation: "'노래하다'는 곡조를 부르는 행동(어찌하다)이에요.", misconception: "동작 서술어를 정체로 착각한 오개념이에요." },
      { text: "웃다", explanation: "'웃다'는 기쁨을 나타내는 동작(어찌하다)이에요.", misconception: "행동 서술어를 정체 서술어로 오해한 오개념이에요." },
    ],
  },
  // 유형 4: 주어 [새하얀 눈이]와 자연스럽게 어울리는 서술어 카드 (보편적 자연물 호응)
  {
    prompt: "주어 [새하얀 눈이]와 자연스럽게 어울리는 서술어 카드를 고르세요.",
    correct: [
      { text: "소복이 내린다", explanation: "눈은 하늘에서 아래로 부드럽게 내리므로 꼭 맞아요." },
      { text: "가지 위에 쌓인다", explanation: "눈은 바닥이나 가지 위에 차곡차곡 쌓이므로 자연스러워요." },
      { text: "햇살에 녹는다", explanation: "따스한 햇살을 받으면 눈이 녹아 물이 되므로 꼭 맞는 서술어예요." },
      { text: "바람에 흩날린다", explanation: "가벼운 눈송이가 바람을 타고 날리는 모습이 잘 어울려요." },
      { text: "참 아름답다", explanation: "눈이 내린 모습이 예쁘고 고운 상태를 나타내요." },
      { text: "사뿐히 내려앉는다", explanation: "눈이 땅에 조용하고 가볍게 닿는 모습을 실감 나게 나타내요." },
      { text: "은빛으로 빛난다", explanation: "눈이 햇빛을 받아 반짝이는 상태를 자연스럽게 표현했어요." },
    ],
    wrong: [
      { text: "마당을 달린다", explanation: "눈은 발이 없어 달릴 수 없어요.", misconception: "주어의 물리적 특성을 무시한 동작 서술어 오류예요." },
      { text: "멍멍 크게 짖는다", explanation: "눈은 소리를 내어 짖는 동물이 아니에요.", misconception: "동물의 소리 동작을 눈에 잘못 결합한 호응 오류예요." },
      { text: "물속에서 헤엄친다", explanation: "눈은 물속에서 헤엄치지 않고 녹아버려요.", misconception: "생물의 고유 행동을 무생물에 적용한 오개념이에요." },
      { text: "교실에서 책을 읽는다", explanation: "눈은 글을 읽을 수 있는 인물이 아니에요.", misconception: "사람의 지적 행위를 사물 주어에 잘못 쓴 오개념이에요." },
      { text: "밥을 맛있게 먹는다", explanation: "눈은 음식을 섭취하는 생물이 아니에요.", misconception: "생명체의 식사 행동을 사물에 잘못 붙인 호응 오류예요." },
      { text: "골짜기를 울부짖는다", explanation: "맹수가 포효하는 소리는 조용한 눈과 어울리지 않아요.", misconception: "주어의 분위기와 정반대되는 서술어를 고른 오개념이에요." },
    ],
  },
  // 유형 5: 주어 [하늘의 새가]와 자연스럽게 어울리는 서술어 카드 (보편적 동물 호응)
  {
    prompt: "주어 [하늘의 새가]와 자연스럽게 어울리는 서술어 카드를 고르세요.",
    correct: [
      { text: "하늘을 날아간다", explanation: "새는 날개로 하늘을 날아가므로 가장 자연스러운 서술어예요." },
      { text: "맑게 지저귄다", explanation: "새가 목소리로 지저귀는 소리 동작이 꼭 맞아요." },
      { text: "아름답게 노래한다", explanation: "숲속에서 새가 맑은 소리로 노래하는 모습이 잘 어울려요." },
      { text: "모이를 쪼아 먹는다", explanation: "새가 부리로 먹이를 쪼는 행동이 자연스러워요." },
      { text: "힘차게 날갯짓한다", explanation: "공중을 날기 위해 날개를 움직이는 새의 동작에 꼭 맞아요." },
      { text: "나뭇가지에 앉는다", explanation: "새가 발로 가지를 쥐고 앉는 동작이 자연스러워요." },
      { text: "포근한 둥지를 튼다", explanation: "새가 깃들 자리를 만드는 고유한 행동 서술어예요." },
    ],
    wrong: [
      { text: "꽃봉오리가 피어난다", explanation: "피어나는 것은 식물의 꽃이나 잎에 쓰는 서술어예요.", misconception: "식물의 성장 서술어를 동물 주어에 잘못 연결한 호응 오류예요." },
      { text: "시냇물이 졸졸 흐른다", explanation: "흐르는 것은 액체나 물에 쓰는 서술어예요.", misconception: "자연물의 상태를 동물에 잘못 결합한 오개념이에요." },
      { text: "바람이 세차게 분다", explanation: "부는 것은 공기 흐름인 바람에 쓰는 말이에요.", misconception: "기상 현상 서술어를 조류에 잘못 짝지은 오개념이에요." },
      { text: "우물물이 매우 깊다", explanation: "깊은 것은 공간이나 물의 상태이지 새의 행동이 아니에요.", misconception: "장소의 상태 형용사를 동물 주어에 잘못 연결한 오류예요." },
      { text: "눈이 하얗게 녹아내린다", explanation: "녹아내리는 것은 얼음이나 눈에 쓰는 표현이에요.", misconception: "온도 변화 서술어를 동물에 잘못 적용한 오개념이에요." },
      { text: "사과가 빨갛게 익어간다", explanation: "익어가는 것은 나무의 열매에 쓰는 서술어예요.", misconception: "식물 결실 서술어를 동물에 잘못 쓴 오개념이에요." },
    ],
  },
  // 유형 6: 주어 [봄꽃이]와 자연스럽게 어울리는 서술어 카드 (보편적 식물 호응)
  {
    prompt: "주어 [봄꽃이]와 자연스럽게 어울리는 서술어 카드를 고르세요.",
    correct: [
      { text: "활짝 피어난다", explanation: "꽃은 봉오리가 벌어지며 피어나므로 가장 알맞은 서술어예요." },
      { text: "은은하게 향기롭다", explanation: "꽃에서 좋은 냄새가 풍기는 상태를 자연스럽게 나타내요." },
      { text: "참 아름답다", explanation: "꽃의 모습과 빛깔이 보기 좋은 상태를 나타내요." },
      { text: "작은 봉오리를 맺는다", explanation: "꽃이 피기 전에 봉오리가 생기는 식물의 변화예요." },
      { text: "따스한 햇살을 받는다", explanation: "식물이 자라며 빛을 흡수하는 자연스러운 호응이에요." },
      { text: "가을바람에 시든다", explanation: "시간이 지나 꽃이 생명을 다하는 식물의 자연스러운 변화예요." },
      { text: "고운 꽃잎을 틔운다", explanation: "꽃이 잎을 펼쳐내는 모습을 실감 나게 표현했어요." },
    ],
    wrong: [
      { text: "물속을 쌩쌩 헤엄친다", explanation: "헤엄치는 것은 물고기나 사람의 이동 동작이에요.", misconception: "동물의 수중 동작을 식물 꽃에 잘못 결합한 호응 오류예요." },
      { text: "도둑을 보고 짖는다", explanation: "짖는 것은 개나 맹수가 소리 내는 동작이에요.", misconception: "동물의 경계 행동을 식물에 잘못 연결한 오개념이에요." },
      { text: "두 발로 힘차게 달린다", explanation: "꽃은 발이 없어 달릴 수 없어요.", misconception: "사람이나 동물의 보행 질주를 식물에 잘못 적용한 오개념이에요." },
      { text: "하늘 높이 날아간다", explanation: "꽃은 땅에 뿌리를 내리고 있어 날아갈 수 없어요.", misconception: "조류의 비행 동작을 식물에 잘못 쓴 오개념이에요." },
      { text: "밤에 쿨쿨 잠을 잔다", explanation: "꽃은 이불을 덮고 수면을 취하지 않아요.", misconception: "동물의 수면 행동을 식물 꽃에 잘못 연결한 호응 오류예요." },
      { text: "말을 조리 있게 한다", explanation: "꽃은 언어를 구사하는 사람이 아니에요.", misconception: "인간의 언어 행위를 식물 주어에 잘못 쓴 오개념이에요." },
    ],
  },
  // 유형 7: 주어 [시원한 바람이]와 자연스럽게 어울리는 서술어 카드 (보편적 자연현상 호응)
  {
    prompt: "주어 [시원한 바람이]와 자연스럽게 어울리는 서술어 카드를 고르세요.",
    correct: [
      { text: "솔솔 불어온다", explanation: "바람은 공기가 부드럽게 움직이는 것이므로 꼭 맞아요." },
      { text: "살갗에 시원하다", explanation: "바람이 피부에 닿을 때 상쾌한 감각 상태를 잘 나타내요." },
      { text: "나뭇잎을 흔든다", explanation: "바람이 불어 나뭇잎을 찰랑이게 하는 움직임이 꼭 어울려요." },
      { text: "소리 없이 스쳐간다", explanation: "바람이 곁을 빠르게 지나가는 모습을 자연스럽게 나타내요." },
      { text: "세차게 불어닥친다", explanation: "바람의 세력이 강해지는 움직임을 정확히 나타내요." },
      { text: "온몸을 포근히 감싼다", explanation: "부드러운 바람이 주위를 둘러싸는 느낌을 잘 나타내요." },
      { text: "골짜기를 지나간다", explanation: "바람이 길을 따라 이동하는 자연스러운 호응이에요." },
    ],
    wrong: [
      { text: "밥을 맛있게 먹는다", explanation: "바람은 음식을 먹는 생명체가 아니에요.", misconception: "동물의 식사 행위를 자연현상에 잘못 연결한 호응 오류예요." },
      { text: "교실에서 책을 읽는다", explanation: "바람은 책을 읽는 사람이 아니에요.", misconception: "사람의 학습 행동을 바람 주어에 잘못 붙인 오개념이에요." },
      { text: "도둑을 보고 짖는다", explanation: "짖는 것은 개나 맹수의 행동이에요.", misconception: "동물의 방어 행동을 공기의 흐름에 잘못 결합한 오개념이에요." },
      { text: "이불을 덮고 잔다", explanation: "바람은 누워서 잠을 자지 않아요.", misconception: "생물의 수면 행동을 바람에 잘못 적용한 오개념이에요." },
      { text: "물속에서 헤엄친다", explanation: "헤엄치는 것은 수중 생물의 동작이에요.", misconception: "물속 동작을 바람에 잘못 연결한 오개념이에요." },
      { text: "새처럼 지저귄다", explanation: "지저귀는 것은 새가 소리 내는 동작이에요.", misconception: "조류의 소리 서술어를 바람에 잘못 쓴 오개념이에요." },
    ],
  },
  // 유형 8: 문장의 끝에서 주어를 풀이하는 서술어 카드 고르기 (문장 성분 판별형)
  {
    prompt: "문장의 끝에서 주어의 행동이나 상태를 풀이하는 [서술어] 낱말 카드를 고르세요.",
    correct: [
      { text: "건넌다", explanation: "'건넌다'는 발로 이동하는 행동을 나타내며 문장을 끝맺는 서술어예요." },
      { text: "녹아내린다", explanation: "'녹아내린다'는 얼음의 변화를 나타내며 문장을 끝맺는 서술어예요." },
      { text: "반짝인다", explanation: "'반짝인다'는 빛나는 상태를 나타내며 문장을 끝맺는 서술어예요." },
      { text: "기사이다", explanation: "'기사이다'는 신분과 정체를 밝혀 주며 문장을 끝맺는 서술어예요." },
      { text: "솟아오른다", explanation: "'솟아오른다'는 위로 움직이는 동작을 나타내며 문장을 끝맺는 서술어예요." },
      { text: "피어난다", explanation: "'피어난다'는 꽃이 벌어지는 움직임을 나타내며 문장을 끝맺는 서술어예요." },
      { text: "휘몰아친다", explanation: "'휘몰아친다'는 세찬 움직임을 나타내며 문장을 끝맺는 서술어예요." },
      { text: "걸어간다", explanation: "'걸어간다'는 발걸음 동작을 나타내며 문장을 끝맺는 서술어예요." },
    ],
    wrong: [
      { text: "동생이", explanation: "'동생이'는 행동의 주인공인 '주어'예요.", misconception: "문장의 주인공인 주어를 서술어로 착각한 오개념이에요." },
      { text: "호수를", explanation: "'호수를'은 건너는 대상이 되는 '목적어'예요.", misconception: "'을/를'이 붙는 목적어를 서술어로 오해한 오개념이에요." },
      { text: "조심스럽게", explanation: "'조심스럽게'는 행동하는 모습을 꾸며 주는 '부사어'예요.", misconception: "서술어를 꾸며 주는 부사어를 서술어로 잘못 고른 오개념이에요." },
      { text: "얼어붙은", explanation: "'얼어붙은'은 뒤의 명사를 꾸며 주는 말(관형어)이에요.", misconception: "대상을 수식하는 말을 문장을 끝맺는 서술어로 착각한 오개념이에요." },
      { text: "협곡에서", explanation: "'협곡에서'는 행동이 일어나는 장소를 나타내는 '부사어'예요.", misconception: "장소를 나타내는 말을 서술어로 오인한 오개념이에요." },
      { text: "친구가", explanation: "'친구가'는 문장의 주인공인 '주어'예요.", misconception: "주어를 서술어로 혼동한 오개념이에요." },
      { text: "단단한", explanation: "'단단한'은 방패나 바위를 꾸며 주는 말(관형어)이에요.", misconception: "수식어를 문장을 끝맺는 서술어로 착각한 오개념이에요." },
    ],
  },
  // 유형 9: 서술어를 꾸며 주는 말에 속지 않고 진짜 서술어 찾기
  {
    prompt: "다음 낱말들 중 [서술어]를 고르세요.",
    correct: [
      { text: "달려간다", explanation: "'달려간다'는 문장의 맨 끝에서 동작을 끝맺는 진짜 서술어예요." },
      { text: "피어났다", explanation: "'피어났다'는 꽃의 변화를 끝맺는 온전한 서술어예요." },
      { text: "불어온다", explanation: "'불어온다'는 바람의 움직임을 끝맺는 진짜 서술어예요." },
      { text: "녹아내린다", explanation: "'녹아내린다'는 얼음의 상태 변화를 나타내는 참된 서술어예요." },
      { text: "빛난다", explanation: "'빛난다'는 보석의 상태를 나타내며 문장을 끝맺는 서술어예요." },
      { text: "솟아오른다", explanation: "'솟아오른다'는 해의 움직임을 끝맺는 진짜 서술어예요." },
      { text: "지저귄다", explanation: "'지저귄다'는 새의 소리 동작을 나타내는 진짜 서술어예요." },
      { text: "걸어간다", explanation: "'걸어간다'는 인물의 보행을 끝맺는 진짜 서술어예요." },
    ],
    wrong: [
      { text: "조심스럽게", explanation: "'조심스럽게'는 걷는 모습을 꾸며 주는 말이에요.", misconception: "서술어를 꾸며 주는 말을 서술어로 착각한 오개념이에요." },
      { text: "쌩쌩", explanation: "'쌩쌩'은 바람 부는 소리/모양을 흉내 내는 꾸며 주는 말이에요.", misconception: "흉내 내는 꾸밈말을 서술어로 오해한 오개념이에요." },
      { text: "소복소복", explanation: "'소복소복'은 눈이 쌓이는 모습을 흉내 내는 꾸며 주는 말이에요.", misconception: "동작을 꾸미는 모양말을 서술어로 착각한 오개념이에요." },
      { text: "활짝", explanation: "'활짝'은 피어나는 모습을 자세히 꾸며 주는 말이에요.", misconception: "꾸며 주는 말을 문장의 서술어로 혼동한 오개념이에요." },
      { text: "펄펄", explanation: "'펄펄'은 눈이나 김이 날리는 모양을 흉내 내는 꾸며 주는 말이에요.", misconception: "꾸며 주는 말을 문장을 끝맺는 서술어로 오인한 오개념이에요." },
      { text: "반짝반짝", explanation: "'반짝반짝'은 빛나는 모양을 흉내 내는 꾸며 주는 말이에요.", misconception: "모양 흉내말을 서술어로 잘못 고른 오개념이에요." },
      { text: "사뿐히", explanation: "'사뿐히'는 걷거나 내려앉는 태도를 꾸며 주는 말이에요.", misconception: "동작을 꾸며 주는 말을 서술어로 착각한 오개념이에요." },
    ],
  },
  // 유형 10: 주어와 어울리는 서술어 기본형(-다) 짝꿍 카드
  {
    prompt: "주어와 의미상 [가장 자연스럽게 어울리는 서술어 기본형] 짝꿍 카드를 고르세요.",
    correct: [
      { text: "바람이 → 불다", explanation: "바람은 공기가 움직이는 것이므로 '불다'와 자연스럽게 어울려요." },
      { text: "시냇물이 → 흐르다", explanation: "물은 낮은 곳으로 흐르므로 '흐르다'와 꼭 맞아요." },
      { text: "꽃이 → 피다", explanation: "꽃은 봉오리가 벌어지므로 '피다'와 호응해요." },
      { text: "새가 → 날다", explanation: "새는 날개로 하늘을 이동하므로 '날다'와 호응해요." },
      { text: "해가 → 뜨다", explanation: "해는 아침에 동쪽에서 솟아오르므로 '뜨다'와 어울려요." },
      { text: "눈이 → 내리다", explanation: "눈은 하늘에서 아래로 떨어지므로 '내리다'와 꼭 맞아요." },
      { text: "달이 → 차오르다", explanation: "달은 모양이 둥글게 변하므로 '차오르다'와 잘 어울려요." },
      { text: "강물이 → 얼다", explanation: "추운 겨울에 액체 물이 고체로 굳으므로 '얼다'와 호응해요." },
    ],
    wrong: [
      { text: "바람이 → 짖다", explanation: "짖는 것은 개나 짐승이 하는 소리라 바람과 어울리지 않아요.", misconception: "주어의 성격에 맞지 않는 엉뚱한 서술어를 짝지은 오개념이에요." },
      { text: "시냇물이 → 날아가다", explanation: "시냇물은 하늘을 날 수 없으므로 호응이 어색해요.", misconception: "주어의 물리적 특성을 무시한 서술어 짝꿍이에요." },
      { text: "꽃이 → 헤엄치다", explanation: "꽃은 물속에서 헤엄치지 않아요.", misconception: "생물체의 고유 행동과 맞지 않는 서술어를 고른 오개념이에요." },
      { text: "새가 → 피어나다", explanation: "피어나는 것은 식물의 꽃이나 싹에 쓰는 서술어예요.", misconception: "식물에 쓰는 서술어를 동물 주어에 잘못 연결한 오개념이에요." },
      { text: "해가 → 흐르다", explanation: "흐르는 것은 물이나 액체에 쓰는 서술어예요.", misconception: "액체에 쓰는 표현을 해에 잘못 적용한 오개념이에요." },
      { text: "눈이 → 춤추다", explanation: "춤추는 것은 신체 팔다리를 흔드는 행동이에요.", misconception: "사람의 춤 동작을 눈에 결합한 호응 오류예요." },
      { text: "달이 → 솟구치다", explanation: "솟구치는 것은 분수나 기운이며 달에 어울리지 않아요.", misconception: "서술어의 성격과 주어가 맞지 않는 오개념이에요." },
    ],
  },
  // 유형 11: 서술어의 세 가지 종류가 올바르게 분류된 카드
  {
    prompt: "서술어의 세 가지 종류(동작·상태·정체)가 [올바르게 연결된] 카드를 고르세요.",
    correct: [
      { text: "나비가 날다 → 동작(어찌하다)", explanation: "'날다'는 날갯짓하는 움직임(어찌하다)이 맞아요." },
      { text: "하늘이 맑다 → 상태(어떠하다)", explanation: "'맑다'는 날씨의 성질이나 상태(어떠하다)가 맞아요." },
      { text: "민수는 기사이다 → 정체(무엇이다)", explanation: "'기사이다'는 신분과 자격(무엇이다)이 맞아요." },
      { text: "토끼가 뛰다 → 동작(어찌하다)", explanation: "'뛰다'는 깡총거리는 움직임(어찌하다)이 맞아요." },
      { text: "얼음이 차갑다 → 상태(어떠하다)", explanation: "'차갑다'는 빙하의 감각적 성질이나 상태(어떠하다)가 맞아요." },
      { text: "지호는 탐험가이다 → 정체(무엇이다)", explanation: "'탐험가이다'는 인물의 직업과 정체(무엇이다)가 맞아요." },
      { text: "별이 빛나다 → 상태(어떠하다)", explanation: "'빛나다'는 환하게 반짝이는 빛의 상태(어떠하다)가 맞아요." },
      { text: "말이 달리다 → 동작(어찌하다)", explanation: "'달리다'는 네 발로 뛰는 힘찬 움직임(어찌하다)이 맞아요." },
    ],
    wrong: [
      { text: "나비가 날다 → 상태(어떠하다)", explanation: "'날다'는 상태가 아니라 몸의 움직임(어찌하다)이에요.", misconception: "동작 서술어를 상태로 잘못 분류한 오개념이에요." },
      { text: "하늘이 맑다 → 동작(어찌하다)", explanation: "'맑다'는 움직임이 아니라 빛깔과 청명함의 성질(어떠하다)이에요.", misconception: "성질이나 상태를 동작으로 오해한 오개념이에요." },
      { text: "민수는 기사이다 → 동작(어찌하다)", explanation: "'기사이다'는 움직임이 아니라 인물의 신분(무엇이다)이에요.", misconception: "신분/정체 서술어를 동작으로 착각한 오개념이에요." },
      { text: "토끼가 뛰다 → 정체(무엇이다)", explanation: "'뛰다'는 정체가 아니라 다리로 뛰는 움직임(어찌하다)이에요.", misconception: "동작 서술어를 정체 서술어로 혼동한 오개념이에요." },
      { text: "얼음이 차갑다 → 정체(무엇이다)", explanation: "'차갑다'는 정체가 아니라 온도의 감각적 상태(어떠하다)예요.", misconception: "상태 서술어를 정체 서술어로 오인한 오개념이에요." },
      { text: "지호는 탐험가이다 → 상태(어떠하다)", explanation: "'탐험가이다'는 성질이나 상태가 아니라 인물의 정체예요.", misconception: "정체 서술어를 상태로 오인한 오개념이에요." },
      { text: "말이 달리다 → 정체(무엇이다)", explanation: "'달리다'는 정체가 아니라 동물의 빠른 움직임이에요.", misconception: "동작 서술어를 정체로 혼동한 오개념이에요." },
    ],
  },
  // 유형 12: 문장에서 주어를 풀이하는 서술어의 개념과 특징에 대한 바른 설명 카드
  {
    prompt: "문장에서 주어를 풀이하는 [서술어의 성질과 특징]에 대한 바른 설명 카드를 고르세요.",
    correct: [
      { text: "문장의 맨 끝에서 주어를 풀이해요.", explanation: "서술어는 보통 문장 끝에 놓여 앞선 주어의 성질이나 동작을 마무리해요." },
      { text: "주어의 움직임, 성질, 상태, 정체를 나타내요.", explanation: "서술어는 '어찌하다, 어떠하다, 무엇이다'로 다양하게 나타나요." },
      { text: "국어사전에는 '-다'로 끝나는 기본형으로 실려요.", explanation: "활용형이 아닌 국어사전의 으뜸꼴(기본형)은 '-다'로 끝나요." },
      { text: "문맥이나 시간에 따라 끝 어미가 다양하게 바뀌어요.", explanation: "'먹다'가 '먹는다, 먹었다, 먹겠다'처럼 어미가 변화해요." },
      { text: "주어가 누구인지에 따라 어울리는 말이 서로 달라요.", explanation: "주어의 물리적 성격과 품격에 맞는 호응 서술어를 써야 해요." },
      { text: "문장에서 말을 온전하게 끝맺는 핵심 성분이에요.", explanation: "서술어가 없으면 문장의 뜻이 완성되지 못해요." },
      { text: "동작을 나타내는 동사와 상태를 나타내는 형용사가 있어요.", explanation: "서술어의 대표 품사로 동사와 형용사가 핵심을 이뤄요." },
    ],
    wrong: [
      { text: "문장에서 '누가/무엇이'에 해당하는 주인공이에요.", explanation: "'누가/무엇이'는 문장의 '주어'를 나타내요.", misconception: "주어의 정의를 서술어로 착각한 오개념이에요." },
      { text: "서술어 동작의 대상이 되며 항상 '을/를'이 붙어요.", explanation: "동작의 대상이 되고 '을/를'이 붙는 것은 '목적어'예요.", misconception: "목적어의 개념을 서술어와 혼동한 오개념이에요." },
      { text: "국어사전에는 항상 '-ㄴ다' 활용형으로만 실려요.", explanation: "국어사전에는 활용형이 아닌 '-다' 기본형으로 실려요.", misconception: "사전 표제어와 활용형 어미를 혼동한 오개념이에요." },
      { text: "문장의 맨 앞머리에서 항상 처음 시작해요.", explanation: "문장 맨 앞에서 시작하는 것은 주로 주어나 꾸며 주는 말이에요.", misconception: "우리말 어순에서 서술어의 위치(끝머리)를 모르는 오개념이에요." },
      { text: "오직 움직임만 나타내며 상태는 나타낼 수 없어요.", explanation: "형용사처럼 상태나 성질을 나타내는 서술어도 아주 많아요.", misconception: "서술어의 범위를 동사 하나로 제한한 오개념이에요." },
      { text: "다른 낱말 바로 앞에 놓여 대상을 전문으로 꾸며 줘요.", explanation: "뒤의 말을 꾸며 주는 것은 꾸밈말이에요.", misconception: "꾸며 주는 말의 역할을 서술어로 오해한 오개념이에요." },
      { text: "한 문장에 서술어가 절대로 들어갈 수 없어요.", explanation: "서술어는 문장을 성립시키는 필수 뼈대 성분이에요.", misconception: "문장 성분의 기초를 부정하는 오개념이에요." },
    ],
  },
];

// ==================== STAGE 3: 목적어의 탑 (보스: 뚝딱깨비) ====================
const stage3Templates: QuestionTemplate[] = [
  // 유형 1: 문장에서 서술어의 대상이 되는 '목적어(무엇을/누구를)' 찾기
  {
    prompt: "다음 중 목적어 카드를 고르세요.",
    correct: [
      { text: "열쇠를", explanation: "'열쇠를'은 찾는 동작의 대상이 되는 목적어예요." },
      { text: "책을", explanation: "'책을'은 읽는 동작의 대상이 되는 목적어예요." },
      { text: "사과를", explanation: "'사과를'은 먹는 동작의 대상이 되는 목적어예요." },
      { text: "보물상자를", explanation: "'보물상자를'은 여는 동작의 대상이 되는 목적어예요." },
      { text: "편지를", explanation: "'편지를'은 쓰는 동작의 대상이 되는 목적어예요." },
      { text: "지도를", explanation: "'지도를'은 펼치는 동작의 대상이 되는 목적어예요." },
      { text: "친구를", explanation: "'친구를'은 만나는 대상이 되는 목적어예요." },
      { text: "운동화를", explanation: "'운동화를'은 신는 동작의 대상이 되는 목적어예요." },
    ],
    wrong: [
      { text: "용사가", explanation: "'용사가'는 행동의 주체인 주인공(주어)이에요.", misconception: "문장의 주인공인 주어를 목적어로 혼동한 오개념이에요." },
      { text: "찾았다", explanation: "'찾았다'는 행동이나 동작을 나타내는 서술어예요.", misconception: "동작 자체인 서술어를 목적어로 착각한 오개념이에요." },
      { text: "반짝반짝", explanation: "'반짝반짝'은 상태나 모양을 흉내 내는 꾸며 주는 말이에요.", misconception: "서술어를 꾸며 주는 부사어를 목적어로 오해한 오개념이에요." },
      { text: "거대한", explanation: "'거대한'은 뒤의 말을 꾸며 주는 꾸밈말이에요.", misconception: "꾸며 주는 말을 목적어로 잘못 고른 오개념이에요." },
      { text: "높은", explanation: "'높은'은 사물의 모양이나 상태를 꾸며 주는 말이에요.", misconception: "수식어를 목적어로 착각한 오개념이에요." },
      { text: "달린다", explanation: "'달린다'는 동작을 나타내며 문장을 끝맺는 서술어예요.", misconception: "서술어를 목적어로 착각한 오개념이에요." },
      { text: "친구는", explanation: "'친구는'은 문장의 주인공인 주어예요.", misconception: "주어를 목적어로 혼동한 오개념이에요." },
    ],
  },
  // 유형 2: 문장 속에서 동작의 대상인 [목적어]가 바르게 짚어진 카드 고르기
  {
    prompt: "[목적어]가 올바르게 괄호로 표시된 것을 고르세요.",
    correct: [
      { text: "아이가 [사과를] 맛있게 먹는다.", explanation: "'먹는다' 동작의 대상인 '사과를'이 목적어로 바르게 짚어졌어요." },
      { text: "내가 도서관에서 [동화책을] 읽었다.", explanation: "'읽었다' 동작의 대상인 '동화책을'이 목적어로 정확해요." },
      { text: "탐험가가 커다란 [보물상자를] 열었다.", explanation: "'열었다' 동작의 대상인 '보물상자를'이 목적어예요." },
      { text: "친구들이 운동장에서 [축구를] 했다.", explanation: "'했다' 동작의 대상인 '축구를'이 목적어로 바르게 짚어졌어요." },
      { text: "동생이 시원한 [우유를] 마셨다.", explanation: "'마셨다' 동작의 대상인 '우유를'이 목적어로 꼭 맞아요." },
      { text: "친구가 비밀 [지도를] 넓게 펼쳤다.", explanation: "'펼쳤다' 동작의 대상인 '지도를'이 목적어로 올바라요." },
      { text: "우리는 따뜻한 [장갑을] 꼈다.", explanation: "'꼈다' 동작의 대상인 '장갑을'이 목적어로 정확해요." },
    ],
    wrong: [
      { text: "아이가 [맛있게] 사과를 먹는다.", explanation: "'맛있게'는 어떻게 먹는지 방법을 꾸며 주는 말이에요.", misconception: "서술어를 꾸며 주는 말을 목적어로 착각한 오개념이에요." },
      { text: "[탐험가가] 커다란 보물상자를 열었다.", explanation: "'탐험가가'는 행동의 주인공인 '주어'예요.", misconception: "문장의 주어를 목적어로 잘못 짚은 오개념이에요." },
      { text: "내가 도서관에서 동화책을 [읽었다].", explanation: "'읽었다'는 문장의 끝에서 행동을 나타내는 '서술어'예요.", misconception: "서술어를 목적어로 오해한 오개념이에요." },
      { text: "친구들이 [운동장에서] 축구를 했다.", explanation: "'운동장에서'는 행동이 일어난 장소를 나타내는 말이에요.", misconception: "장소를 나타내는 말을 목적어로 착각한 오개념이에요." },
      { text: "동생이 [시원한] 우유를 마셨다.", explanation: "'시원한'은 우유의 상태를 꾸며 주는 말이에요.", misconception: "꾸며 주는 말을 목적어로 잘못 고른 오개념이에요." },
      { text: "친구가 [넓게] 비밀 지도를 펼쳤다.", explanation: "'넓게'는 펼치는 모양을 꾸며 주는 말이에요.", misconception: "꾸밈말을 목적어로 오인한 오개념이에요." },
    ],
  },
  // 유형 3: 서술어와 그 동작의 대상이 되는 [목적어 짝]이 바르게 연결된 카드
  {
    prompt: "서술어와 어울리는 [목적어 짝]이 바르게 연결된 것을 고르세요.",
    correct: [
      { text: "책을 → 읽는다", explanation: "책은 읽는 동작의 대상이 되는 알맞은 목적어예요." },
      { text: "열쇠를 → 찾았다", explanation: "열쇠는 찾는 동작의 대상이 되는 자연스러운 목적어예요." },
      { text: "밥을 → 먹는다", explanation: "밥은 먹는 행위의 대상이 되는 올바른 목적어예요." },
      { text: "편지를 → 쓴다", explanation: "편지는 정성껏 쓰는 대상이 되는 바른 목적어예요." },
      { text: "그림을 → 그린다", explanation: "그림은 붓이나 펜으로 그리는 대상이 되는 목적어예요." },
      { text: "신발을 → 신는다", explanation: "신발은 발에 착용하는 동작의 대상이 되는 목적어예요." },
      { text: "노래를 → 부른다", explanation: "노래는 목소리로 가창하는 대상이 되는 목적어예요." },
    ],
    wrong: [
      { text: "책을 → 솟구친다", explanation: "솟구치는 것은 물이나 기운이며 책을 대상으로 삼지 않아요.", misconception: "목적어가 필요 없는 자동사에 목적어를 잘못 짝지은 오개념이에요." },
      { text: "밥을 → 날아간다", explanation: "날아가는 동작에는 밥을 목적어로 둘 수 없어요.", misconception: "서술어의 성격과 맞지 않는 엉뚱한 대상을 연결한 오개념이에요." },
      { text: "열쇠를 → 짖는다", explanation: "짖는 것은 소리 내는 것이라 열쇠와 호응하지 않아요.", misconception: "동작 대상이 될 수 없는 서술어와 짝지은 오개념이에요." },
      { text: "편지를 → 헤엄친다", explanation: "헤엄치는 것은 몸으로 물속을 가르는 동작이에요.", misconception: "문맥상 결코 어울릴 수 없는 목적어 짝꿍이에요." },
      { text: "그림을 → 잠잔다", explanation: "잠자는 것은 주어의 행위이지 대상을 가질 수 없어요.", misconception: "목적어를 취할 수 없는 서술어에 목적어를 붙인 오개념이에요." },
      { text: "신발을 → 피어난다", explanation: "피어나는 것은 꽃이나 싹에 쓰는 서술어예요.", misconception: "사물의 특성과 맞지 않는 서술어를 짝지은 오개념이에요." },
    ],
  },
  // 유형 4: 행동의 대상(목적어)이 꼭 있어야 뜻이 완전해지는 [서술어] 고르기
  {
    prompt: "행동의 대상(목적어)이 꼭 있어야 뜻이 완전해지는 [서술어] 카드를 고르세요.",
    correct: [
      { text: "먹다", explanation: "'무엇을 먹는지' 대상(음식 등)이 꼭 있어야 뜻이 완전해져요." },
      { text: "읽다", explanation: "'무엇을 읽는지' 대상(책, 글 등)이 반드시 필요한 서술어예요." },
      { text: "열다", explanation: "'무엇을 여는지' 대상(문, 상자 등)이 꼭 필요한 서술어예요." },
      { text: "만들다", explanation: "'무엇을 만드는지' 대상(로봇, 음식 등)이 반드시 있어야 해요." },
      { text: "찾다", explanation: "'무엇을/누구를 찾는지' 대상이 꼭 있어야 문장이 완성돼요." },
      { text: "신다", explanation: "'무엇을 신는지' 대상(양말, 신발 등)이 반드시 필요해요." },
      { text: "잡다", explanation: "'무엇을/누구를 잡는지' 대상이 꼭 필요한 서술어예요." },
    ],
    wrong: [
      { text: "웃다", explanation: "'웃다'는 주어 스스로 웃는 행동이라 목적어가 없어도 문장이 완성돼요.", misconception: "목적어 없이도 온전한 서술어를 목적어 필수 서술어로 착각한 오개념이에요." },
      { text: "잠자다", explanation: "'잠자다'는 주어의 상태나 행위로 목적어가 필요 없어요.", misconception: "주어 혼자서 완성하는 서술어를 오해한 오개념이에요." },
      { text: "피어나다", explanation: "'꽃이 피어난다'처럼 주어만으로 뜻이 온전히 완성돼요.", misconception: "자연스러운 주어-서술어 문장에 목적어가 필요하다고 오인한 오류예요." },
      { text: "날아가다", explanation: "'새가 날아간다'처럼 대상을 필요로 하지 않는 서술어예요.", misconception: "이동 서술어에 목적어가 필수적이라고 착각한 오개념이에요." },
      { text: "울다", explanation: "'아이가 운다'처럼 주어 혼자서 동작을 완결할 수 있어요.", misconception: "목적어가 필요 없는 서술어를 잘못 고른 오개념이에요." },
      { text: "달리다", explanation: "'말이 달린다'처럼 대상 없이도 뜻이 온전하게 통해요.", misconception: "동작 서술어는 모두 목적어가 필요하다고 오해한 오개념이에요." },
    ],
  },
  // 유형 5: 목적어가 없어도 주어의 행동·상태만으로 [뜻이 온전하게 완성된] 문장 고르기
  {
    prompt: "다음 문장 중 목적어가 없어도 뜻이 통하는 문장을 고르세요.",
    correct: [
      { text: "봄꽃이 활짝 피어났다.", explanation: "주어(봄꽃이)와 서술어(피어났다)만으로 뜻이 온전하고 완벽해요." },
      { text: "시원한 바람이 솔솔 분다.", explanation: "바람이 부는 것은 목적어가 없어도 자연스럽게 완성돼요." },
      { text: "새들이 하늘 높이 날아간다.", explanation: "새의 비행 동작은 대상 없이도 문장이 온전해요." },
      { text: "아침 해가 동쪽에서 솟아오른다.", explanation: "해가 뜨는 움직임은 목적어 없이 뜻이 명확해요." },
      { text: "시냇물이 맑고 졸졸 흐른다.", explanation: "물이 흐르는 현상은 주어와 서술어만으로 온전해요." },
      { text: "달콤한 과일이 빨갛게 익었다.", explanation: "과일의 익은 상태는 목적어가 필요 없어요." },
    ],
    wrong: [
      { text: "친구가 두 손으로 번쩍 들었다.", explanation: "'무엇을' 들었는지 목적어가 빠져 뜻이 불완전해요.", misconception: "목적어가 꼭 필요한 서술어인데 목적어가 누락된 불완전 문장이에요." },
      { text: "지호가 도서관에서 열심히 읽었다.", explanation: "'무엇을' 읽었는지 책이나 글 같은 목적어가 빠졌어요.", misconception: "필수 성분인 목적어가 누락되어 뜻이 통하지 않는 문장이에요." },
      { text: "민수가 방에서 정성껏 만들었다.", explanation: "'무엇을' 만들었는지 대상 목적어가 없어 불완전해요.", misconception: "서술어의 대상을 빠뜨려 미완성인 문장이에요." },
      { text: "동생이 꿀꺽꿀꺽 맛있게 마셨다.", explanation: "'무엇을' 마셨는지 음료나 물 같은 목적어가 빠졌어요.", misconception: "목적어가 꼭 있어야 완성되는 문장의 결함을 놓친 오개념이에요." },
      { text: "친구가 성문을 조심스럽게.", explanation: "어떻게 했는지 끝맺는 서술어가 빠져 있어요.", misconception: "서술어가 누락된 비문을 고른 오개념이에요." },
    ],
  },
  // 유형 6: [주어 - 목적어 - 서술어] 3성분이 온전히 갖추어진 바른 문장
  {
    prompt: "[주어 - 목적어 - 서술어] 세 성분이 [모두 온전하게 갖추어진] 문장 카드를 고르세요.",
    correct: [
      { text: "내가 보물상자를 열었다.", explanation: "내가(주어) + 보물상자를(목적어) + 열었다(서술어)가 완벽해요." },
      { text: "기사가 단단한 방패를 들었다.", explanation: "기사가(주어) + 방패를(목적어) + 들었다(서술어)가 모두 갖추어졌어요." },
      { text: "용사가 신비한 주문을 외웠다.", explanation: "용사가(주어) + 주문을(목적어) + 외웠다(서술어)가 온전해요." },
      { text: "아이가 맛있는 사과를 먹는다.", explanation: "아이가(주어) + 사과를(목적어) + 먹는다(서술어)가 온전한 구조예요." },
      { text: "학생이 동화책을 읽는다.", explanation: "학생이(주어) + 동화책을(목적어) + 읽는다(서술어)가 온전해요." },
      { text: "동생이 새 운동화를 신었다.", explanation: "동생이(주어) + 운동화를(목적어) + 신었다(서술어)가 완벽해요." },
    ],
    wrong: [
      { text: "보물상자를 활짝 열었다.", explanation: "누가 열었는지 주인공인 '주어'가 빠져 있어요.", misconception: "주어가 누락되어 3대 성분을 채우지 못한 불완전 문장이에요." },
      { text: "기사가 씩씩하게 들었다.", explanation: "무엇을 들었는지 동작의 대상인 '목적어'가 빠져 있어요.", misconception: "필수 성분인 목적어가 누락된 불완전 문장이에요." },
      { text: "용사가 신비한 주문을.", explanation: "어떻게 했는지 행동을 끝맺는 '서술어'가 빠져 있어요.", misconception: "서술어가 누락되어 문장이 성립하지 않은 비문이에요." },
      { text: "아이가 사과를.", explanation: "사과를 어떻게 했는지 서술어가 없어요.", misconception: "서술어가 빠져 문장의 의미를 알 수 없는 미완성 문장이에요." },
      { text: "재미있게 동화책을 읽는다.", explanation: "누가 읽는지 '주어'가 빠져 있어요.", misconception: "주어가 누락된 문장을 고른 오개념이에요." },
      { text: "새 운동화를 가지런히 신었다.", explanation: "누가 신었는지 '주어'가 생략되어 있어요.", misconception: "주어 성분이 누락된 불완전 문장이에요." },
    ],
  },
  // 유형 7: 문장의 성분 중 [목적어의 성질과 특징]에 대한 바른 설명 카드
  {
    prompt: "문장의 성분 중 [목적어의 성질과 특징]에 대한 올바른 설명 카드를 고르세요.",
    correct: [
      { text: "서술어 동작의 대상이 되는 문장 성분이에요.", explanation: "목적어는 서술어가 나타내는 행위의 '대상'이에요." },
      { text: "문장에서 '누구를' 또는 '무엇을'에 해당해요.", explanation: "목적어는 어떤 대상을 가리키는지 묻는 질문에 답해요." },
      { text: "보통 [주어]와 [서술어] 사이에 위치해요.", explanation: "우리말의 기본 뼈대 어순은 [주어 - 목적어 - 서술어]예요." },
      { text: "'먹다', '찾다'처럼 대상을 필요로 하는 서술어와 짝을 이뤄요.", explanation: "대상이 꼭 있어야 하는 서술어에는 목적어가 짝꿍으로 와요." },
      { text: "낱말 뒤에 주로 '을'이나 '를'이 붙어 대상임을 나타내요.", explanation: "'을/를'이 붙어 문장 안에서 동작의 대상 역할을 해요." },
      { text: "서술어가 나타내는 움직임이 미치는 대상을 뚜렷이 밝혀 줘요.", explanation: "목적어는 서술어의 동작이 도달하는 목표 대상을 가리켜요." },
    ],
    wrong: [
      { text: "문장에서 '누가/무엇이'에 해당하는 주인공이에요.", explanation: "'누가/무엇이'는 문장의 '주어'를 뜻해요.", misconception: "주어의 정의를 목적어의 정의로 혼동한 오개념이에요." },
      { text: "문장의 맨 끝에 와서 동작이나 상태를 마무리해요.", explanation: "문장 맨 끝에서 말을 맺는 것은 '서술어'예요.", misconception: "서술어의 성격을 목적어로 착각한 오개념이에요." },
      { text: "모든 문장에 목적어가 반드시 들어가야만 해요.", explanation: "'새가 난다'처럼 목적어가 필요 없는 문장도 아주 많아요.", misconception: "모든 문장에 목적어가 필수적이라고 오해한 오개념이에요." },
      { text: "문장에서 '어찌하다', '어떠하다'로 풀이하는 말이에요.", explanation: "'어찌하다, 어떠하다'로 풀이하는 것은 서술어예요.", misconception: "서술어의 성격을 목적어로 혼동한 오개념이에요." },
      { text: "낱말 뒤에 항상 '이/가'나 '께서'가 붙어요.", explanation: "'이/가'나 '께서'는 주어에 붙는 말이에요.", misconception: "주어 표지를 목적어 표지로 착각한 오개념이에요." },
      { text: "다른 낱말 앞에 놓여 뒤의 말만 꾸며 주는 꾸밈말이에요.", explanation: "다른 말을 꾸며 주는 성분은 꾸밈말(부사어, 관형어)이에요.", misconception: "수식어의 개념과 목적어를 혼동한 오개념이에요." },
    ],
  },
  // 유형 8: 문맥과 서술어에 어울리는 [목적어가 알맞게 쓰인] 문장 카드 고르기
  {
    prompt: "문맥과 서술어의 뜻에 어울리는 [목적어가 바르게 쓰인] 문장 카드를 고르세요.",
    correct: [
      { text: "내가 목이 말라 시원한 물을 마셨다.", explanation: "'마셨다' 동작에 꼭 맞는 대상인 '물을'이 바르게 쓰였어요." },
      { text: "내가 고마운 친구에게 편지를 썼다.", explanation: "'썼다' 동작에 자연스러운 대상인 '편지를'이 올바라요." },
      { text: "기사가 닫힌 커다란 성문을 힘껏 밀었다.", explanation: "'밀었다' 동작에 어울리는 대상인 '성문을'이 꼭 맞아요." },
      { text: "동생이 도화지에 크레파스로 그림을 그렸다.", explanation: "'그렸다' 동작에 알맞은 대상인 '그림을'이 자연스러워요." },
      { text: "선생님께서 학생들에게 좋은 책을 추천하셨다.", explanation: "'추천하셨다'에 호응하는 대상인 '책을'이 바르게 쓰였어요." },
      { text: "형이 밖으로 나가기 전에 운동화를 신었다.", explanation: "'신었다' 동작에 적합한 대상인 '운동화를'이 꼭 어울려요." },
    ],
    wrong: [
      { text: "내가 목이 말라 시원한 책을 마셨다.", explanation: "책은 읽는 대상이지 마실 수 있는 대상이 아니에요.", misconception: "서술어의 동작과 전혀 맞지 않는 엉뚱한 목적어를 쓴 호응 오류예요." },
      { text: "내가 고마운 친구에게 운동화를 썼다.", explanation: "운동화는 신는 대상이지 쓰는 대상이 아니에요.", misconception: "서술어와 목적어의 호응 관계가 깨진 문장이에요." },
      { text: "기사가 닫힌 성문을 맛있게 먹었다.", explanation: "성문은 여닫는 대상이지 먹을 수 있는 대상이 아니에요.", misconception: "사물의 특성을 무시한 목적어 결합 오류예요." },
      { text: "동생이 도화지에 편지를 신었다.", explanation: "편지는 읽거나 쓰는 것이지 발에 신는 것이 아니에요.", misconception: "행위와 대상의 조화가 맞지 않는 비문이에요." },
      { text: "선생님께서 학생들에게 그림을 춤추셨다.", explanation: "춤추는 것은 주어의 행동이지 그림을 대상으로 삼지 않아요.", misconception: "대상이 필요 없는 서술어에 억지로 목적어를 연결한 오개념이에요." },
      { text: "형이 나가기 전에 맛있는 사과를 신었다.", explanation: "사과는 먹는 과일이지 발에 착용할 수 없어요.", misconception: "목적어의 성격과 서술어가 어긋난 호응 오류예요." },
    ],
  },
];

// ==================== STAGE 4: 시간과 높임의 신전 (보스: 째깍깨비) ====================
const stage4Templates: QuestionTemplate[] = [
  // 유형 1: '과거' 시간 낱말과 서술어가 올바르게 호응된 문장
  {
    prompt: "'과거' 시간 낱말과 서술어가 [올바르게 호응된] 문장 카드를 고르세요.",
    correct: [
      { text: "어제 친구와 공원에서 즐겁게 놀았다.", explanation: "'어제'라는 과거 시간에 과거 서술어(~았다)가 꼭 맞게 호응해요." },
      { text: "지난주에 가족과 함께 박물관에 다녀왔다.", explanation: "'지난주'라는 과거 시간에 '~다녀왔다'가 올바르게 짝을 이뤄요." },
      { text: "옛날에 마음씨 착한 나무꾼이 살았다.", explanation: "'옛날'이라는 과거 시간에 '~살았다'가 자연스럽게 호응해요." },
      { text: "아까 점심을 맛있게 먹었다.", explanation: "'아까'라는 과거 시간에 '~먹었다'가 올바르게 결합했어요." },
      { text: "작년에 제주도로 신나는 여행을 갔다.", explanation: "'작년'이라는 과거 시간에 '~갔다'가 정확히 호응해요." },
    ],
    wrong: [
      { text: "어제 친구와 공원에서 놀 것이다.", explanation: "'어제'는 과거인데 '놀 것이다'라는 미래 서술어를 써서 어색해요.", misconception: "과거 시간 낱말에 미래 서술어를 잘못 호응시킨 오개념이에요." },
      { text: "지난주에 가족과 함께 박물관에 간다.", explanation: "'지난주'는 과거인데 현재형 '간다'를 써서 맞지 않아요.", misconception: "과거 시간에 현재형 서술어를 쓴 오개념이에요." },
      { text: "옛날에 마음씨 착한 나무꾼이 살겠다.", explanation: "'옛날'에는 과거형(~살았다)이 와야지 미래 의지(~살겠다)는 어색해요.", misconception: "과거와 미래 표현을 혼동한 오개념이에요." },
      { text: "아까 점심을 맛있게 먹을 것이다.", explanation: "'아까'는 지나간 시간이므로 '먹을 것이다'와 호응할 수 없어요.", misconception: "지나간 시간에 미래 서술어를 붙인 오개념이에요." },
      { text: "작년에 제주도로 여행을 가겠다.", explanation: "'작년'은 과거인데 미래형 '가겠다'를 써서 시제가 충돌해요.", misconception: "과거 낱말과 미래 서술어의 충돌을 인지하지 못한 오개념이에요." },
    ],
  },
  // 유형 2: '미래' 시간 낱말과 서술어가 올바르게 호응된 문장
  {
    prompt: "'미래' 시간 낱말과 서술어가 [올바르게 호응된] 문장 카드를 고르세요.",
    correct: [
      { text: "내일 친구들과 소풍을 갈 것이다.", explanation: "'내일'이라는 미래 시간에 미래 서술어(~ㄹ 것이다)가 잘 어울려요." },
      { text: "다음 주에 새 자전거를 탈 예정이다.", explanation: "'다음 주'라는 다가올 시간에 미래 표현(~예정이다)이 꼭 맞아요." },
      { text: "앞으로 바른말을 열심히 쓰겠다.", explanation: "'앞으로'라는 미래 시간에 의지/미래 서술어(~쓰겠다)가 호응해요." },
      { text: "곧 신비한 보물 문이 열릴 것이다.", explanation: "'곧'이라는 다가올 시간에 미래 서술어가 올바르게 결합했어요." },
      { text: "내년에 우리는 5학년이 된다.", explanation: "'내년'이라는 미래 일에 적합한 미래 예측 호응 문장이에요." },
    ],
    wrong: [
      { text: "내일 친구들과 소풍을 갔다.", explanation: "'내일'은 오지 않은 미래인데 과거형 '갔다'를 써서 모순이에요.", misconception: "미래 시간 낱말에 과거형 서술어를 쓴 치명적 시제 오류예요." },
      { text: "다음 주에 새 자전거를 탔다.", explanation: "'다음 주'는 미래인데 과거형 '탔다'를 써서 시제가 어긋나요.", misconception: "미래 낱말과 과거 서술어를 혼동한 오개념이에요." },
      { text: "앞으로 바른말을 열심히 썼다.", explanation: "'앞으로'는 다가올 미래인데 과거형 '썼다'는 어색해요.", misconception: "앞으로 일어날 일에 과거 서술어를 붙인 오개념이에요." },
      { text: "곧 신비한 보물 문이 열렸다.", explanation: "'곧'은 가까운 미래인데 '열렸다'는 이미 끝난 과거예요.", misconception: "다가올 시간에 완료된 과거 서술어를 연결한 오개념이에요." },
      { text: "내년에 우리는 5학년이 되었다.", explanation: "'내년'은 미래인데 이미 되었다는 과거형은 맞지 않아요.", misconception: "미래 사건에 과거 서술어를 쓴 오개념이에요." },
    ],
  },
  // 유형 3: 웃어른을 높이는 [특별한 높임 낱말] 짝꿍
  {
    prompt: "웃어른을 공경하며 높여 부르는 [특별한 높임 낱말] 짝꿍 카드를 고르세요.",
    correct: [
      { text: "밥 → 진지", explanation: "웃어른께 드리는 밥은 '진지'라고 높여 불러요." },
      { text: "나이 → 연세", explanation: "웃어른의 나이는 '연세'라고 높여 불러요." },
      { text: "집 → 댁", explanation: "웃어른의 집은 '댁'이라고 정중히 높여 불러요." },
      { text: "이름 → 성함", explanation: "웃어른의 성함은 '이름' 대신 '성함'이라고 높여요." },
      { text: "말 → 말씀", explanation: "웃어른이 하시는 말씀이나 올리는 말은 '말씀'이에요." },
      { text: "생일 → 생신", explanation: "웃어른의 생일은 '생신'이라고 높여 불러요." },
    ],
    wrong: [
      { text: "밥 → 식사", explanation: "'식사'는 일반 한자어일 뿐 웃어른을 특별히 높이는 낱말이 아니에요.", misconception: "일반 명사와 고유한 높임 특수 어휘를 혼동한 오개념이에요." },
      { text: "나이 → 세월", explanation: "'세월'은 흘러가는 시간을 뜻하며 나이의 높임말이 아니에요.", misconception: "단어의 의미를 잘못 파악한 오개념이에요." },
      { text: "집 → 별장", explanation: "'별장'은 휴양용 집이지 집의 높임말이 아니에요.", misconception: "건물의 종류와 높임 어휘를 혼동한 오개념이에요." },
      { text: "이름 → 명함", explanation: "'명함'은 이름과 연락처가 적힌 종이 카드예요.", misconception: "도구의 명칭을 높임말로 착각한 오개념이에요." },
      { text: "생일 → 잔치", explanation: "'잔치'는 파티나 행사이지 생일의 높임말이 아니에요.", misconception: "행사의 명칭과 높임말을 오해한 오개념이에요." },
    ],
  },
  // 유형 4: 웃어른의 행동을 높이는 [특별한 서술어] 짝꿍
  {
    prompt: "웃어른의 행동이나 상태를 높이는 [특별한 서술어] 짝꿍 카드를 고르세요.",
    correct: [
      { text: "먹다 → 잡수시다", explanation: "웃어른께서 식사하실 때는 '잡수시다' 또는 '드시다'를 써요." },
      { text: "자다 → 주무시다", explanation: "웃어른께서 잠을 청하실 때는 '주무시다'를 써요." },
      { text: "아프다 → 편찮으시다", explanation: "웃어른의 몸이 아프실 때는 '편찮으시다'를 써요." },
      { text: "주다 → 드리다", explanation: "웃어른께 물건을 건넬 때는 '드리다'를 써요." },
      { text: "묻다 → 여쭙다", explanation: "웃어른께 궁금한 것을 여쭤볼 때는 '여쭙다'를 써요." },
      { text: "보다/만나다 → 뵙다", explanation: "웃어른을 찾아뵙고 만날 때는 '뵙다'를 써요." },
    ],
    wrong: [
      { text: "먹다 → 마시다", explanation: "'마시다'는 음료를 들이켜는 동작이지 높임말이 아니에요.", misconception: "다른 동작을 높임말로 잘못 알고 있는 오개념이에요." },
      { text: "자다 → 쉬다", explanation: "'쉬다'는 휴식을 취하는 일반 동사이지 자다의 높임말이 아니에요.", misconception: "일반 휴식 동사를 높임 어휘로 오해한 오개념이에요." },
      { text: "아프다 → 괴롭다", explanation: "'괴롭다'는 고통스러운 심리 상태이지 아프다의 높임말이 아니에요.", misconception: "감정 형용사를 높임 어휘로 착각한 오개념이에요." },
      { text: "주다 → 바치다", explanation: "'바치다'는 제물이나 충성을 바칠 때 쓰며 일상 높임말이 아니에요.", misconception: "특수한 어휘를 일상 공경 높임말로 혼동한 오개념이에요." },
      { text: "묻다 → 대답하다", explanation: "'대답하다'는 묻는 말에 답하는 것이라 정반대예요.", misconception: "반대말을 높임말로 착각한 오개념이에요." },
    ],
  },
  // 유형 5: 높임의 대상과 서술어가 바르게 호응된 완성 문장
  {
    prompt: "높임의 대상과 높임 표현이 [올바르게 호응된] 완성 문장 카드를 고르세요.",
    correct: [
      { text: "할머니께서 진지를 맛있게 잡수신다.", explanation: "'께서', '진지', '잡수신다'가 삼박자로 완벽하게 높여졌어요." },
      { text: "선생님께서 교실 안으로 들어가신다.", explanation: "'께서'와 높임의 뜻을 더하는 '-시-'가 알맞게 호응해요." },
      { text: "아버지께서 피곤하셔서 일찍 주무신다.", explanation: "'께서'와 '주무신다'가 자연스럽게 어우러진 바른 문장이에요." },
      { text: "어머니께 예쁜 꽃다발을 드렸다.", explanation: "높임의 대상(어머니께)과 '드렸다'가 바르게 호응해요." },
      { text: "할아버지의 성함을 정중하게 여쭈었다.", explanation: "'성함'과 '여쭈었다'를 사용하여 예의 바르게 표현했어요." },
    ],
    wrong: [
      { text: "할머니께서 밥을 맛있게 먹는다.", explanation: "웃어른께 '밥을 먹는다'라고 낮춤말을 써서 어색해요.", misconception: "웃어른 주어에 특별 높임말을 쓰지 않고 낮춘 오개념이에요." },
      { text: "선생님께서 교실 안으로 들어간다.", explanation: "'께서'를 쓰고도 서술어에 '-시-'를 넣지 않아 높임이 어색해요.", misconception: "주어와 서술어의 높임이 일치하지 않는 오개념이에요." },
      { text: "아버지께서 피곤하셔서 일찍 잔다.", explanation: "'잔다' 대신 높임말인 '주무신다'를 써야 맞아요.", misconception: "웃어른의 행위에 일반 낮춤 동사를 쓴 오개념이에요." },
      { text: "어머니께 예쁜 꽃다발을 주었다.", explanation: "웃어른께 건넬 때는 '주었다'가 아니라 '드렸다'를 써야 해요.", misconception: "웃어른께 드리는 높임말을 놓친 오개념이에요." },
      { text: "할아버지의 이름을 정중하게 물었다.", explanation: "'이름' 대신 '성함', '물었다' 대신 '여쭈었다'가 맞아요.", misconception: "높임의 대상에게 예사말을 잘못 사용한 오개념이에요." },
    ],
  },
  // 유형 6: 시간과 높임의 규칙에 대한 바른 설명 고르기
  {
    prompt: "시간과 높임의 호응 규칙에 대한 설명으로 [올바른 것]을 고르세요.",
    correct: [
      { text: "시간을 나타내는 말과 서술어 끝의 시제는 짝이 맞아야 해요.", explanation: "과거·현재·미래는 서술어의 어미와 호응해야 자연스러워요." },
      { text: "웃어른을 주어로 삼을 때는 '이/가' 대신 '께서'를 써요.", explanation: "'께서'는 웃어른을 공경하여 높이는 대표적인 표현이에요." },
      { text: "서술어에 '-시-'를 넣으면 행동하는 분을 높일 수 있어요.", explanation: "'-시-'는 말하는 이가 행동하는 분을 공경하여 높일 때 넣는 말이에요." },
      { text: "과거의 일을 나타낼 때는 서술어에 '-았/었-'을 써요.", explanation: "'-았/었-'은 지나간 과거의 사건을 나타내는 핵심 표현이에요." },
      { text: "자신을 낮추고 웃어른을 높일 때는 '나' 대신 '저'를 써요.", explanation: "웃어른 앞에서는 자신을 '저'라고 낮추어 공경을 표현해요." },
    ],
    wrong: [
      { text: "어제 일어난 일 뒤에는 항상 미래형 서술어를 써요.", explanation: "어제는 과거이므로 과거형 서술어를 써야 맞아요.", misconception: "과거 시제와 미래 시제를 거꾸로 기억한 오개념이에요." },
      { text: "자신의 이름을 말할 때 '저의 성함은~'이라고 해요.", explanation: "성함은 남을 높이는 말이므로 자신에게 쓰면 안 돼요.", misconception: "자신을 스스로 높이는 잘못된 높임법 오개념이에요." },
      { text: "친구에게 말할 때도 '진지 잡수셨니?'라고 해야 해요.", explanation: "친구 사이에는 친근한 평어('밥 먹었니?')를 써요.", misconception: "동급의 친구에게 지나친 높임말을 적용한 오개념이에요." },
      { text: "과거와 현재, 미래는 서술어 모양이 항상 같아요.", explanation: "시간에 따라 서술어 어미의 형태가 뚜렷하게 달라져요.", misconception: "시간 표현에 따른 어미 변화 규칙을 모르는 오개념이에요." },
      { text: "높임말은 오직 서술어에만 붙일 수 있어요.", explanation: "'진지', '연세'처럼 명사 자체에도 높임말이 존재해요.", misconception: "명사 높임 어휘의 존재를 간과한 오개념이에요." },
    ],
  },
];

// ==================== STAGE 5: 혼돈의 성 (보스: 뒤죽박죽 대마왕) ====================
// 핵심 1: 부정하는 말(전혀, 결코, 별로)과 부정 서술어의 호응
const stage5TplNegative: QuestionTemplate = {
  prompt: "부정 낱말(전혀, 결코, 별로)과 부정 서술어가 [올바르게 어울린] 문장 카드를 고르세요.",
  correct: [
    { text: "우리는 어둠이 전혀 두렵지 않았다.", explanation: "'전혀' 뒤에 부정 서술어(~않았다)가 꼭 맞게 어울려요." },
    { text: "우리는 결코 포기하지 않을 것이다.", explanation: "'결코' 뒤에 부정 서술어(~않을 것이다)가 굳건히 호응해요." },
    { text: "오늘은 바람이 별로 불지 않는다.", explanation: "'별로' 뒤에 부정 서술어(~않는다)가 자연스럽게 연결돼요." },
    { text: "그 소문은 결코 사실이 아니다.", explanation: "'결코' 뒤에 부정 서술어(~아니다)가 바르게 쓰였어요." },
    { text: "이 문제는 도무지 이해할 수 없다.", explanation: "'도무지' 뒤에 부정 서술어(~없다)가 정확히 호응해요." },
  ],
  wrong: [
    { text: "우리는 어둠이 전혀 두려웠다.", explanation: "'전혀' 뒤에는 긍정이 아닌 부정 서술어가 와야 해요.", misconception: "'전혀' 뒤에 긍정 서술어를 잘못 연결한 대표적 호응 오류예요." },
    { text: "우리는 결코 쉽게 포기할 것이다.", explanation: "'결코' 뒤에는 반드시 부정 표현이 이어져야 자연스러워요.", misconception: "'결코'가 부정 서술어와 짝을 이룬다는 규칙을 놓친 오개념이에요." },
    { text: "오늘은 바람이 별로 많이 분다.", explanation: "'별로' 뒤에는 '불지 않는다'처럼 부정이 와야 해요.", misconception: "'별로' 뒤에 긍정 서술어를 쓴 어색한 문장이에요." },
    { text: "그 소문은 결코 사실이다.", explanation: "'결코'는 부정과 호응하므로 '사실이 아니다'가 맞아요.", misconception: "'결코'의 부정 호응 관계를 무시한 오개념이에요." },
    { text: "이 문제는 도무지 쉽게 풀린다.", explanation: "'도무지' 뒤에는 부정 표현(~풀리지 않는다)이 와야 해요.", misconception: "'도무지'의 부정 호응 특성을 혼동한 오개념이에요." },
  ],
};

// 핵심 2: 이유나 까닭을 나타내는 말(왜냐하면 ~ 때문이다)의 호응
const stage5TplCause: QuestionTemplate = {
  prompt: "까닭을 나타내는 말(왜냐하면 ~ 때문이다)의 [호응]이 바른 문장을 고르세요.",
  correct: [
    { text: "내가 기쁜 까닭은 약속을 지켰기 때문이다.", explanation: "'까닭은'으로 시작하여 '~때문이다'로 완벽하게 짝을 맺었어요." },
    { text: "친구가 늦은 이유는 길을 잃었기 때문이다.", explanation: "'이유는'으로 시작하여 '~때문이다'로 바르게 호응해요." },
    { text: "우리가 승리했다. 왜냐하면 힘을 모았기 때문이다.", explanation: "'왜냐하면' 뒤에 이유를 밝히는 '~때문이다'가 바르게 왔어요." },
    { text: "소풍이 연기된 까닭은 폭우가 쏟아졌기 때문이다.", explanation: "'까닭은'과 '~때문이다'가 자연스럽게 연결된 문장이에요." },
    { text: "글별이가 웃은 이유는 마법이 풀렸기 때문이다.", explanation: "'이유는'과 '~때문이다'가 명확하게 짝을 이루고 있어요." },
    { text: "꽃들이 활짝 피어났다. 왜냐하면 따뜻한 봄이 찾아왔기 때문이다.", explanation: "'왜냐하면'과 끝맺는 말 '~때문이다'가 꼭 맞게 어울려요." },
    { text: "민수가 옷을 두껍게 입었다. 왜냐하면 찬 바람이 불기 때문이다.", explanation: "'왜냐하면' 뒤에 까닭을 밝히는 '~때문이다'가 자연스럽게 호응해요." },
    { text: "도서관에서는 조용히 해야 한다. 왜냐하면 다른 사람이 책을 읽기 때문이다.", explanation: "'왜냐하면'과 종결 표현 '~때문이다'가 올바른 짝을 이뤘어요." },
    { text: "우리가 우산을 챙긴 까닭은 오후에 비가 오기 때문이다.", explanation: "'까닭은'으로 시작하여 끝에 '~때문이다'로 정확하게 맺었어요." },
    { text: "글별이가 방패를 높이 들었다. 왜냐하면 어둠의 마법을 막아야 하기 때문이다.", explanation: "'왜냐하면' 뒤에 행동의 이유인 '~때문이다'가 바르게 결합했어요." },
  ],
  wrong: [
    { text: "내가 기쁜 까닭은 약속을 지켰다.", explanation: "'까닭은' 뒤에는 반드시 '~때문이다'로 끝맺어야 자연스러워요.", misconception: "원인 명사 뒤에 서술어 호응(~때문이다)을 누락한 오개념이에요." },
    { text: "친구가 늦은 이유는 길을 잃어버렸다.", explanation: "'이유는'으로 시작했으면 '~때문이다'로 받아 주어야 해요.", misconception: "주어부의 '이유는'과 종결 서술어가 불일치한 오개념이에요." },
    { text: "우리가 승리했다. 왜냐하면 힘을 모았다.", explanation: "'왜냐하면' 뒤에는 '~때문이다'가 붙어야 호응이 완성돼요.", misconception: "'왜냐하면'과 결합하는 종결 호응 어구를 빠뜨린 오개념이에요." },
    { text: "소풍이 연기된 까닭은 폭우가 쏟아졌다.", explanation: "'까닭은'에 호응하는 '~때문이다'가 빠져 말이 끊겨요.", misconception: "까닭을 나타내는 호응 관계를 끝맺지 못한 비문이에요." },
    { text: "글별이가 웃은 이유는 마법이 풀려서 신났다.", explanation: "'이유는'에 호응하지 않고 엉뚱하게 감정으로 끝맺었어요.", misconception: "주어부 '이유는'에 엉뚱한 서술어를 연결한 호응 오류예요." },
    { text: "꽃들이 활짝 피어났다. 왜냐하면 따뜻한 봄이 찾아왔다.", explanation: "'왜냐하면'으로 까닭을 밝힐 때는 끝을 '~때문이다'로 맺어야 해요.", misconception: "'왜냐하면'에 호응하는 종결 어미 누락 오류예요." },
    { text: "민수가 옷을 두껍게 입었다. 왜냐하면 찬 바람이 분다.", explanation: "'왜냐하면' 뒤에는 이유를 나타내는 '~때문이다'가 와야 해요.", misconception: "이유를 나타내는 호응 표현을 끝맺지 않은 오개념이에요." },
    { text: "도서관에서는 조용히 해야 한다. 왜냐하면 다른 사람이 책을 읽는다.", explanation: "까닭을 설명하는 '왜냐하면' 뒤에는 '~때문이다'로 호응해야 해요.", misconception: "'왜냐하면' 뒤에 일반 종결 서술어를 쓴 호응 오류예요." },
    { text: "우리가 우산을 챙긴 까닭은 오후에 비가 온다.", explanation: "'까닭은'으로 시작하는 문장은 반드시 끝에 '~때문이다'가 와야 해요.", misconception: "'까닭은'과 서술어 종결 표현의 호응 불일치예요." },
    { text: "글별이가 방패를 높이 들었다. 왜냐하면 어둠의 마법을 막아야 한다.", explanation: "'왜냐하면' 뒤에 이유 종결 표현인 '~때문이다'가 빠져 있어요.", misconception: "까닭 접속 표현의 호응 어구를 생략한 비문이에요." },
  ],
};

// 핵심 3: 주어와 서술어가 자연스럽게 호응된 완성 문장
const stage5TplSubjectPredicate: QuestionTemplate = {
  prompt: "주어와 서술어의 뜻이 [자연스럽고 바르게 호응된] 문장 카드를 고르세요.",
  correct: [
    { text: "나의 꿈은 훌륭한 문장 기사가 되는 것이다.", explanation: "주어 '꿈은'과 서술어 '~되는 것이다'가 완벽하게 호응해요." },
    { text: "내가 하고 싶은 말은 서로 배려하자는 것이다.", explanation: "주어 '말은'과 서술어 '~하자는 것이다'가 자연스러워요." },
    { text: "새들의 노랫소리가 숲속에 아름답게 울려 퍼진다.", explanation: "주어 '노랫소리가'와 서술어 '울려 퍼진다'가 꼭 어울려요." },
    { text: "우리의 소원은 잃어버린 보물을 모두 찾는 것이다.", explanation: "주어 '소원은'과 서술어 '~찾는 것이다'가 잘 맞아요." },
    { text: "우리가 지킬 약속은 바른 문장을 사용하는 것이다.", explanation: "주어 '약속은'과 서술어 '~사용하는 것이다'가 매끄러워요." },
  ],
  wrong: [
    { text: "나의 꿈은 훌륭한 문장 기사로 자랐다.", explanation: "꿈이 자란 것이 아니라 기사가 '되는 것'이어야 맞아요.", misconception: "주어 '꿈은'과 서술어 '자랐다'가 어울리지 않는 주술 불일치예요." },
    { text: "내가 하고 싶은 말은 서로 배려했다.", explanation: "말이 배려한 것이 아니라 '배려하자는 것이다'로 맺어야 해요.", misconception: "주어 '말은'과 과거 서술어의 주술 호응 오류예요." },
    { text: "새들의 노랫소리가 숲속에서 춤춘다.", explanation: "소리가 춤추는 것이 아니라 소리는 '울려 퍼져야' 자연스러워요.", misconception: "주어의 속성과 서술어의 행동이 어긋난 호응 오류예요." },
    { text: "우리의 소원은 보물을 모두 찾았다.", explanation: "소원이 찾은 것이 아니라 '찾는 것이다'가 맞아요.", misconception: "주어 '소원은'과 서술어의 호응 불일치 오개념이에요." },
    { text: "우리가 지킬 약속은 바른말을 사용했다.", explanation: "약속이 사용한 것이 아니라 '사용하는 것이다'로 맺어야 해요.", misconception: "주어 '약속은'과 서술어 형태의 불일치 오개념이에요." },
  ],
};

// 핵심 4: 주어, 목적어, 서술어가 모두 갖추어진 온전한 문장
const stage5TplCompleteSentence: QuestionTemplate = {
  prompt: "주어, 목적어, 서술어가 [모두 갖추어진] 문장 카드를 고르세요.",
  correct: [
    { text: "용감한 기사들이 힘을 합쳐 평화를 되찾았다.", explanation: "주어(기사들이), 목적어(평화를), 서술어(되찾았다)가 모두 갖추어졌어요." },
    { text: "글별이가 친구들에게 고마운 마음을 전했다.", explanation: "주어(글별이가), 목적어(마음을), 서술어(전했다)가 모두 갖추어졌어요." },
    { text: "탐험가가 신비한 보물상자를 활짝 열었다.", explanation: "주어(탐험가가), 목적어(보물상자를), 서술어(열었다)가 모두 갖추어졌어요." },
    { text: "우리는 올바른 문장으로 세상을 구했다.", explanation: "주어(우리는), 목적어(세상을), 서술어(구했다)가 모두 갖추어졌어요." },
    { text: "아이가 달콤한 사과를 맛있게 먹었다.", explanation: "주어(아이가), 목적어(사과를), 서술어(먹었다)가 모두 갖추어졌어요." },
  ],
  wrong: [
    { text: "힘을 합쳐 평화를 되찾았다.", explanation: "누가 평화를 되찾았는지 '주어'가 빠져 있어 불완전해요.", misconception: "필수 성분인 주어가 누락된 문장이에요." },
    { text: "글별이가 고마운 마음을.", explanation: "마음을 어떻게 했는지 끝맺는 '서술어'가 빠져 있어요.", misconception: "서술어가 누락되어 문장이 성립하지 않은 비문이에요." },
    { text: "탐험가가 활짝 열었다.", explanation: "무엇을 열었는지 대상인 '목적어'가 빠져 있어요.", misconception: "동작의 대상인 목적어가 누락된 문장이에요." },
    { text: "우리는 평화로운 세상을.", explanation: "세상을 어떻게 했는지 끝맺는 '서술어'가 빠져 있어요.", misconception: "서술어가 누락된 불완전한 문장이에요." },
    { text: "아이가 맛있게 먹었다.", explanation: "무엇을 먹었는지 대상인 '목적어'가 빠져 있어요.", misconception: "동작의 대상인 목적어가 누락된 문장이에요." },
  ],
};

const stage5Templates: QuestionTemplate[] = [
  stage5TplNegative,
  stage5TplCause,
  stage5TplSubjectPredicate,
  stage5TplCompleteSentence,
];

// 스테이지 5(대마왕 결전) 3라운드 이후: 스테이지 5 핵심 + 1~4 핵심 총결산 종합 풀
const stage5ComprehensiveReviewPool: QuestionTemplate[] = [
  stage5TplNegative,
  stage5TplCause,
  stage5TplSubjectPredicate,
  stage5TplCompleteSentence,
  stage1Templates[0], // 주어 낱말 카드 찾기
  stage1Templates[4], // 온전한 주어가 들어있는 문장
  stage2Templates[0], // 서술어 동작(어찌하다) 기본형
  stage2Templates[5], // 주어와 자연스럽게 어울리는 서술어 기본형
  stage3Templates[0], // 목적어 낱말 카드 찾기
  stage3Templates[2], // 서술어와 어울리는 목적어 연결
  stage3Templates[5], // 주어-목적어-서술어 온전한 3성분 문장
  stage4Templates[0], // 과거 시간 낱말과 서술어 호응
  stage4Templates[1], // 미래 시간 낱말과 서술어 호응
  stage4Templates[4], // 높임 대상과 높임 서술어 호응
];

export function generateQuiz(stageId: StageId, round: number, session = "sentence-v1", _rangeScale = 1): Quiz {
  const rng = makePrng(seedForQuiz(stageId, round, session));
  let tpl: QuestionTemplate;

  if (stageId === 5) {
    // 스테이지 5: 1~2라운드는 부정 호응과 까닭(인과) 호응이 번갈아 출제
    if (round === 1) {
      tpl = stage5TplNegative;
    } else if (round === 2) {
      tpl = stage5TplCause;
    } else {
      // 3라운드 이후: 1~4 스테이지 핵심 개념과 5 스테이지 호응이 통합된 종합 풀에서 출제
      const baseShift = int(rng, 0, stage5ComprehensiveReviewPool.length - 1);
      const templateIndex = (round - 3 + baseShift) % stage5ComprehensiveReviewPool.length;
      tpl = stage5ComprehensiveReviewPool[templateIndex];
    }
  } else {
    let templateList: QuestionTemplate[];
    if (stageId === 1) templateList = stage1Templates;
    else if (stageId === 2) templateList = stage2Templates;
    else if (stageId === 3) templateList = stage3Templates;
    else templateList = stage4Templates;

    // 라운드마다 서로 다른 문제 유형이 다채롭게 순환되도록 템플릿 인덱스 계산
    const baseShift = int(rng, 0, templateList.length - 1);
    const templateIndex = (round - 1 + baseShift) % templateList.length;
    tpl = templateList[templateIndex];
  }

  const correctShuffled = shuffle(rng, tpl.correct);
  const wrongShuffled = shuffle(rng, tpl.wrong);

  const selectedCorrect = correctShuffled.slice(0, 3).map((item) => ({
    text: item.text,
    symbol: item.symbol,
    isCorrect: true,
    explanation: item.explanation,
  }));
  const selectedWrong = wrongShuffled.slice(0, 2).map((item) => ({
    text: item.text,
    symbol: item.symbol,
    isCorrect: false,
    explanation: item.explanation,
    misconception: item.misconception,
  }));

  const rows = [...selectedCorrect, ...selectedWrong];
  const difficulty: Difficulty = round <= 2 ? "EASY" : round <= 5 ? "NORMAL" : "HARD";
  return finalize(stageId, round, tpl.prompt, difficulty, rows, rng, tpl.referenceNote);
}

export function generateStageQuiz(stageId: StageId, round: number, session = "sentence-v1", rangeScale = 1): Quiz {
  const quiz = generateQuiz(stageId, round, session, rangeScale);
  return stageId === 5 ? { ...quiz, id: `stage-5-round-${round}`, stageId: 5 } : quiz;
}
