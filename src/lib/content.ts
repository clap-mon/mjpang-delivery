export type StageId = 1 | 2 | 3 | 4 | 5;
export type Speaker = "글별이" | "소리별" | "주인공" | "보스";

export type DialogueChoice = {
  text: string;
  correct: boolean;
  feedback: string;
  icon?: string;
};

export type DialogueMultiOption = {
  id: string;
  text: string;
  isAnswer: boolean;
  explanation: string;
  icon?: string;
  icons?: string[];
  cardImage?: string;
  measureImage?: string;
  timeBadge?: string;
};

export type DialogueMultiCheck = {
  instruction: string;
  options: DialogueMultiOption[];
  successFeedback: string;
};

export type DialogueVisualItem = {
  src: string;
  title: string;
  beats?: number;
  beatsLabel?: string;
  gridBlocks?: number;
  tag?: string;
  desc?: string;
};

export type GrammarConceptCard = {
  title: string;
  badge: string;
  icon: string;
  colorTheme: "rose" | "emerald" | "sky" | "amber" | "purple";
  timeKeywords?: string;
  verbEndings: string;
  goodExample?: string;
  badExample?: string;
  pairLabel1?: string;
  pairLabel2?: string;
  pairDivider?: string;
  goodBadge?: string;
  badBadge?: string;
};

export type GuideSideWings = {
  leftTitle: string;
  leftBadge: string;
  leftIcon: string;
  leftItems: { normal: string; honorific: string }[];
  rightTitle: string;
  rightBadge: string;
  rightIcon: string;
  rightItems: { normal: string; honorific: string }[];
};

export type DialogueVisual = {
  type: "symbol" | "diagram" | "compare" | "grammar-table" | "guide-wings";
  src?: string;
  title?: string;
  caption?: string;
  items?: DialogueVisualItem[];
  grammarTable?: {
    title: string;
    subtitle?: string;
    cards: GrammarConceptCard[];
  };
  guideWings?: GuideSideWings;
};

export type FillBlankSlot = {
  text: string;
  isSlot?: boolean;
  icon?: string;
};

export type FillBlankOption = {
  id: string;
  text: string;
  icon?: string;
  isAnswer: boolean;
  explanation: string;
};

export type FillBlankTask = {
  type: "fill-blank";
  instruction: string;
  equation: FillBlankSlot[];
  options: FillBlankOption[];
  successFeedback: string;
};

export type MatchPairItem = {
  id: string;
  text: string;
  icon?: string;
  emoji?: string;
  badge?: string;
  subText?: string;
  matchId: string;
};

export type MatchPairsTask = {
  type: "match-pairs";
  instruction: string;
  leftItems: MatchPairItem[];
  rightItems: MatchPairItem[];
  successFeedback: string;
  leftTitle?: string;
  rightTitle?: string;
  anchorSide?: "left" | "right";
};

export type OrderSequenceItem = {
  id: string;
  text: string;
  icon?: string;
  order: number;
};

export type OrderSequenceTask = {
  type: "order-sequence";
  instruction: string;
  items: OrderSequenceItem[];
  successFeedback: string;
  allowedOrders?: number[][];
};

export type InteractiveTask = FillBlankTask | MatchPairsTask | OrderSequenceTask;

export type DialogueNode = {
  speaker: Speaker;
  text: string;
  prompt?: string;
  sentence?: string;
  choices?: DialogueChoice[];
  multiCheck?: DialogueMultiCheck;
  task?: InteractiveTask;
  visual?: DialogueVisual;
};

export type Stage = {
  id: StageId;
  title: string;
  shortTitle: string;
  concept: string;
  mission: string;
  bossName: string;
  bossTitle: string;
  bossShortName: string;
  color: string;
  background: string;
  bossImage: string;
  dialogue: DialogueNode[];
};

const choice = (
  correctText: string,
  wrong: string[],
  feedback: string,
  wrongFeedback: string,
  icons?: { correctIcon?: string; wrongIcons?: string[] },
): DialogueChoice[] => {
  const choices: DialogueChoice[] = [
    { text: correctText, correct: true, feedback, icon: icons?.correctIcon },
    ...wrong.map((text, i) => ({
      text,
      correct: false,
      feedback: wrongFeedback,
      icon: icons?.wrongIcons?.[i],
    })),
  ];
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  return choices;
};

const multiCheck = (options: DialogueMultiOption[], successFeedback: string, instruction = "조건에 맞는 보기를 모두 고르세요."): DialogueMultiCheck => {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return { instruction, options: shuffled, successFeedback };
};

const matchPair = (
  pairs: { left: string; right: string; emoji?: string }[],
  successFeedback: string,
  instruction = "알맞은 짝을 찾아 연결하세요.",
  leftTitle?: string,
  rightTitle?: string,
  anchorSide: "left" | "right" = "left",
): MatchPairsTask => {
  const leftItems: MatchPairItem[] = pairs.map((p, i) => ({
    id: `pair-${i}`,
    text: p.left,
    emoji: p.emoji,
    matchId: `pair-${i}`,
  }));
  const rightItems: MatchPairItem[] = pairs.map((p, i) => ({
    id: `right-${i}`,
    text: p.right,
    emoji: p.emoji,
    matchId: `pair-${i}`,
  }));
  for (let index = rightItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [rightItems[index], rightItems[swapIndex]] = [rightItems[swapIndex], rightItems[index]];
  }
  return {
    type: "match-pairs",
    instruction,
    leftItems,
    rightItems,
    successFeedback,
    leftTitle,
    rightTitle,
    anchorSide,
  };
};

const sentenceChoice = (
  tokens: { text: string; isAnswer: boolean }[],
  feedback: string,
  wrongFeedback: string,
): DialogueChoice[] => {
  return tokens.map((token) => ({
    text: token.text,
    correct: token.isAnswer,
    feedback: token.isAnswer ? feedback : wrongFeedback,
  }));
};

const orderSeq = (
  items: string[],
  successFeedback: string,
  instruction = "낱말 카드를 알맞은 순서대로 정렬하세요.",
  allowedOrders?: number[][],
): OrderSequenceTask => {
  const sequenceItems: OrderSequenceItem[] = items.map((text, i) => ({
    id: `item-${i}`,
    text,
    order: i + 1,
  }));
  return {
    type: "order-sequence",
    instruction,
    items: sequenceItems,
    successFeedback,
    allowedOrders,
  };
};

const stage2PredicateTable = {
  title: "❄️ 주어를 설명하는 서술어 3총사",
  subtitle: "주어가 '어찌하는지', '어떠한지', '무엇인지' 세 가지 모습으로 풀이해요!",
  cards: [
    {
      title: "1. 어찌하다 (동작)",
      badge: "움직임",
      icon: "⚡",
      colorTheme: "rose" as const,
      pairLabel2: "💡 대표 낱말",
      verbEndings: "달린다 · 춤춘다 · 날아간다 · 노래한다",
      goodExample: "내가 앞장서서 힘차게 달린다.",
      badExample: "내가 앞장서서 힘차게 차갑다.",
      goodBadge: "바른 문장",
      badBadge: "어색한 문장",
    },
    {
      title: "2. 어떠하다 (상태)",
      badge: "성질과 상태",
      icon: "❄️",
      colorTheme: "sky" as const,
      pairLabel2: "💡 대표 낱말",
      verbEndings: "차갑다 · 맑다 · 눈부시다 · 예쁘다",
      goodExample: "빙하의 얼음이 매우 차갑다.",
      badExample: "빙하의 얼음이 매우 친절하다.",
      goodBadge: "바른 문장",
      badBadge: "어색한 문장",
    },
    {
      title: "3. 무엇이다 (정체)",
      badge: "이름과 정체",
      icon: "🏰",
      colorTheme: "purple" as const,
      pairLabel2: "💡 대표 낱말",
      verbEndings: "학생이다 · 요괴이다 · 기사이다",
      goodExample: "꽁꽁깨비는 얼음 계곡의 요괴이다.",
      badExample: "꽁꽁깨비는 얼음 계곡의 달콤하다.",
      goodBadge: "바른 문장",
      badBadge: "어색한 문장",
    },
  ],
};

export const stages: Stage[] = [
  {
    id: 1,
    title: "안개 언덕의 표지판, 사라진 주어",
    shortTitle: "문장의 주인 [주어]",
    concept: "주어의 개념(누가/무엇이)과 주어를 나타내는 말(이/가, 은/는, 께서)",
    mission: "문장의 주인공인 주어를 훔쳐 세상을 혼란에 빠뜨린 그림자 요괴 헛깨비를 물리치고 바른 문장을 세우세요.",
    bossName: "그림자 요괴 헛깨비",
    bossTitle: "안개의 방랑자",
    bossShortName: "헛깨비",
    color: "#8e44ad",
    background: "/story-backgrounds/stage-1-subject-hill.webp",
    bossImage: "/characters/boss-stage-1-shadow.webp",
    dialogue: [
      {
        speaker: "주인공",
        text: "주어의 숲 안개 언덕의 길 안내 표지판들이 전부 엉망이 되었어! '하늘을 훨훨 난다!', '쌩쌩 달린다!'처럼 행동만 둥둥 떠 있고, 정작 '누가', '무엇이' 그런다는 건지 문장의 주인공이 싹 지워져 있잖아! 내 단단한 연필과 국어사전 방패로 문장의 주인을 똑똑히 세워주마!",
      },
      {
        speaker: "보스",
        text: "크히히! 내가 문장의 주인공인 '주어'를 모조리 지워버렸지! 주인이 없는 말은 그림자 요괴 헛깨비의 안개 속에 흩어질 뿐이야! 길을 찾고 싶으면 어디 주어가 뭔지 맞춰보시지!",
      },
      {
        speaker: "글별이",
        text: "수호자님! '주어'는 문장에서 동작이나 상태의 주인이 되는 말로, '누가' 또는 '무엇이'에 해당해요! 문장이 바로 서려면 반드시 주어가 든든하게 자리 잡아야 한답니다!",
      },
      {
        speaker: "주인공",
        text: "'누가'와 '무엇이'는 어떻게 다른 거야, 글별아?",
      },
      {
        speaker: "글별이",
        text: "'누가'는 사람이나 동물처럼 살아 움직이는 주인공을 가리키고(예: '다람쥐가', '토끼는'), '무엇이'는 사물이나 자연처럼 모습을 띤 주인공을 가리켜요(예: '비행기가', '바람이')!",
      },
      {
        speaker: "주인공",
        text: "아하! '다람쥐가'에서 '다람쥐', '자동차가'에서 '자동차' 뒤에 붙은 '~가'나 '~이'도 주어를 밝혀주는 단짝이구나!",
        visual: {
          type: "grammar-table",
          grammarTable: {
            title: "🌱 문장의 주인공 '주어'와 단짝 짝꿍",
            subtitle: "문장의 주인공(누가/무엇이)을 먼저 찾고, 어울리는 단짝을 붙여요!",
            cards: [
              {
                title: "1. 문장의 주인공 [주어]",
                badge: "누가 / 무엇이",
                icon: "👑",
                colorTheme: "amber",
                timeKeywords: "누가 (사람·동물) · 무엇이 (사물·자연)",
                verbEndings: "친구가, 다람쥐가 · 봄비가, 자동차가",
                goodExample: "다람쥐가 도토리를 맛있게 먹는다.",
                badExample: "도토리를 맛있게 먹는다. (누가 빠짐)",
                pairLabel1: "👑 주어의 두 얼굴",
                pairLabel2: "💡 주인공 단어 예시",
                pairDivider: "➔ 문장의 주인공 ➔",
                goodBadge: "바른 문장",
                badBadge: "어색한 문장",
              },
              {
                title: "2. 주어의 단짝 [이 / 가]",
                badge: "소리 짝꿍",
                icon: "🌱",
                colorTheme: "emerald",
                timeKeywords: "받침 있음 ➔ 이  /  받침 없음 ➔ 가",
                verbEndings: "선생님이, 구름이  /  나비가, 친구가",
                goodExample: "구름이 하늘에 둥실 떠 있다.",
                badExample: "구름가 하늘에 둥실 떠 있다.",
                pairLabel1: "🔤 받침 소리 규칙",
                pairLabel2: "🔗 올바른 결합",
                pairDivider: "➔ 주어 결합 ➔",
                goodBadge: "바른 표현",
                badBadge: "틀린 표현",
              },
              {
                title: "3. 특별한 짝꿍 [은/는 · 께서]",
                badge: "강조 / 높임",
                icon: "✨",
                colorTheme: "sky",
                timeKeywords: "강조·비교 ➔ 은/는  /  웃어른 높임 ➔ 께서",
                verbEndings: "바람은, 토끼는  /  선생님께서, 할머니께서",
                goodExample: "선생님께서 환하게 웃으신다.",
                badExample: "선생님가 환하게 웃으신다.",
                pairLabel1: "✨ 특별한 쓰임 규칙",
                pairLabel2: "🔗 올바른 결합",
                pairDivider: "➔ 주어 결합 ➔",
                goodBadge: "바른 표현",
                badBadge: "틀린 표현",
              },
            ],
          },
        },
      },
      {
        speaker: "글별이",
        text: "맞아요! 주어 뒤에는 주로 도움말인 '~이/가', '~은/는'이 붙어 문장의 주인을 또렷하게 나타내 준답니다! 자, 헛깨비의 결계를 풀 첫 번째 시험이에요! 중앙 화면의 문장을 살펴보고, 동작의 진짜 주인인 '주어'를 찾아 터치해 보세요!",
        prompt: "다음 문장에서 동작의 주인인 [주어]를 찾아 선택하세요.",
        sentence: "귀여운 다람쥐가 도토리를 맛있게 먹는다.",
        choices: sentenceChoice(
          [
            { text: "귀여운", isAnswer: false },
            { text: "다람쥐가", isAnswer: true },
            { text: "도토리를", isAnswer: false },
            { text: "맛있게", isAnswer: false },
          ],
          "정답이에요! '누가' 도토리를 먹는지 동작의 주인인 '다람쥐가'가 바로 이 문장의 주어랍니다!",
          "다시 찾아보세요! '누가' 먹고 있는지 문장의 진짜 주인공을 찾아야 해요.",
        ),
      },
      {
        speaker: "주인공",
        text: "도토리를 먹는 주인공인 '다람쥐가'를 찾았어! 다음 빈칸은 내가 채워볼게!",
      },
      {
        speaker: "글별이",
        text: "멋져요! 이번에는 헛깨비가 훔쳐 달아난 빈칸 슬롯에 '무엇이' 달리는지 알맞은 주어 카드를 끼워 넣어볼까요?",
        task: {
          type: "fill-blank",
          instruction: "빈칸에 들어갈 알맞은 주어 카드를 선택하세요.",
          equation: [
            { text: "", isSlot: true },
            { text: "바람을 가르며 힘차게 달린다." },
          ],
          options: [
            {
              id: "opt-1",
              text: "자동차가",
              isAnswer: true,
              explanation: "정답! '자동차가 달린다'처럼 '무엇이' 달리는지 사물 주어를 채워 온전한 문장이 되었어요!",
            },
            {
              id: "opt-2",
              text: "어제는",
              isAnswer: false,
              explanation: "'어제는'은 시간을 나타내는 말이에요! '누가/무엇이' 달리는지 주어가 필요해요.",
            },
            {
              id: "opt-3",
              text: "빠르게",
              isAnswer: false,
              explanation: "'빠르게'는 달리는 모양을 꾸며주는 말이에요. 문장의 주인공이 아니에요.",
            },
            {
              id: "opt-4",
              text: "도로에서",
              isAnswer: false,
              explanation: "'도로에서'는 장소를 나타내는 말이에요. 주어가 아니에요.",
            },
          ],
          successFeedback: "완벽해요! '자동차가'가 들어가 온전한 주어 문장이 완성되었습니다!",
        },
      },
      {
        speaker: "글별이",
        text: "훌륭해요! 이제 헛깨비가 뒤섞어놓은 주어의 단짝들을 맞춰볼까요? 왼쪽 주어에 꼭 어울리는 올바른 동작을 찾아 연결해 보세요!",
        task: matchPair(
          [
            { left: "토끼가", right: "깡충깡충 달린다" },
            { left: "바람이", right: "쌩쌩 분다" },
            { left: "물고기가", right: "씽씽 헤엄친다" },
            { left: "개나리가", right: "활짝 피었다" },
          ],
          "대단해요! 주어(토끼가, 바람이, 물고기가, 개나리가)와 어울리는 바른 동작을 완벽하게 연결하셨어요!",
          "주어에 어울리는 올바른 동작 카드를 연결하세요.",
          "주어 선택",
          "어울리는 동작",
        ),
      },
      {
        speaker: "주인공",
        text: "'누가'와 '무엇이' 짝꿍을 모두 찾았어! 헛깨비, 이제 뒤죽박죽 흩어진 문장을 제대로 세워주마!",
      },
      {
        speaker: "글별이",
        text: "좋아요! 마지막으로 흩어진 낱말 카드를 차례대로 모아 온전한 주어 문장 기차를 완성해 보세요!",
        task: orderSeq(
          ["꿀벌이", "꽃밭에서", "날아다닌다."],
          "문장 완성! 주어 '꿀벌이'가 이끄는 온전한 문장 기차가 훌륭하게 완성되었어요!",
          "낱말 카드를 알맞은 순서대로 정렬하여 바른 문장을 완성하세요.",
        ),
      },
      {
        speaker: "보스",
        text: "으악! '누가'와 '무엇이'를 저렇게 똑똑하게 찾아내다니... 내 안개 결계가 걷히고 있어! 하지만 얼음 협곡에서는 어림없다!",
      },
    ],
  },
  {
    id: 2,
    title: "침묵의 얼음 협곡, 굳어버린 서술어",
    shortTitle: "동작과 상태를 나타내는 말 [서술어]",
    concept: "서술어의 3총사(어찌하다[동작], 어떠하다[상태/성질], 무엇이다[정체/이름])",
    mission: "문장을 끝맺는 서술어를 얼려버린 얼음 요괴 꽁꽁깨비를 무찌르고 말의 생명력을 되찾으세요.",
    bossName: "얼음 요괴 꽁꽁깨비",
    bossTitle: "침묵의 지배자",
    bossShortName: "꽁꽁깨비",
    color: "#2980b9",
    background: "/story-backgrounds/stage-2-predicate-valley.webp",
    bossImage: "/characters/boss-stage-2-glacio.webp",
    dialogue: [
      {
        speaker: "주인공",
        text: "서술어의 빙하 협곡에 사는 동물들이 전부 얼어붙어 있어! '사자가...', '바위가...'까지만 나오고 뒤에 말이 끊겨서 도대체 무슨 일이 일어났는지 모르겠어!",
      },
      {
        speaker: "보스",
        text: "후후후... 나는 얼음 요괴 꽁꽁깨비! 문장의 끝을 맺고 주인공의 행동과 모습을 나타내는 '서술어'를 꽁꽁 얼려버렸다! 끝맺음 없는 문장은 영원히 침묵할 뿐!",
      },
      {
        speaker: "글별이",
        text: "수호자님! 문장이 완성되려면 주어가 '어찌하는지', '어떠한지', '무엇인지' 설명해 주는 '서술어'가 꼭 있어야 해요!",
      },
      {
        speaker: "주인공",
        text: "어찌하다, 어떠하다, 무엇이다? 서술어가 세 종류나 있는 거야?",
      },
      {
        speaker: "글별이",
        text: "네! 서술어 3총사예요! ① '달린다/먹는다'처럼 동작을 나타내는 '어찌하다',\n② '맑다/예쁘다'처럼 성질이나 상태를 나타내는 '어떠하다', ③ '학생이다/수호자다'처럼 정체를 밝히는 '무엇이다'가 있답니다!",
        visual: {
          type: "grammar-table",
          grammarTable: stage2PredicateTable,
        },
      },
      {
        speaker: "주인공",
        text: "아하! 동작만 서술어인 줄 알았는데, '꽃이 아름답다(어떠하다)'나 '민우는 학생이다(무엇이다)'도 문장을 끝맺는 서술어였구나!",
        visual: {
          type: "grammar-table",
          grammarTable: stage2PredicateTable,
        },
      },
      {
        speaker: "글별이",
        text: "정확해요! 그럼 꽁꽁깨비의 얼음을 깰 첫 번째 서술어를 찾아볼까요? 중앙 화면의 문장에서 별빛의 동작과 모습을 끝맺어주는 '서술어'를 찾아보세요!",
        prompt: "다음 문장에서 주인공의 동작이나 상태를 끝맺는 [서술어]를 선택하세요.",
        sentence: "밤하늘의 별빛이 보석처럼 영롱하게 빛난다.",
        choices: sentenceChoice(
          [
            { text: "밤하늘의", isAnswer: false },
            { text: "별빛이", isAnswer: false },
            { text: "보석처럼", isAnswer: false },
            { text: "빛난다", isAnswer: true },
          ],
          "정답이에요! 별빛이 '어찌하는지' 문장의 끝에서 설명해 주는 '빛난다'가 바로 서술어랍니다!",
          "다시 확인해 보세요! 문장의 맨 끝에서 주인공의 동작이나 상태를 끝맺는 말을 찾아야 해요.",
        ),
      },
      {
        speaker: "주인공",
        text: "별빛이 어떻게 하는지 끝맺는 말 '빛난다'를 찾았어! 다음 얼음 조각도 깨뜨려 볼게!",
      },
      {
        speaker: "글별이",
        text: "좋아요! 이번에는 얼어붙은 서술어 슬롯에 사자의 힘찬 동작을 나타내는 '어찌하다' 카드를 채워보세요!",
        task: {
          type: "fill-blank",
          instruction: "문맥에 어울리는 알맞은 서술어 카드를 선택하세요.",
          equation: [
            { text: "사자가 넓은 초원을 힘차게" },
            { text: "", isSlot: true },
          ],
          options: [
            {
              id: "pred-1",
              text: "달린다.",
              isAnswer: true,
              explanation: "정답! 사자가 '어찌하는지' 동작을 끝맺어주는 서술어 '달린다'가 들어가 문장이 완성되었어요!",
            },
            {
              id: "pred-2",
              text: "노랗다.",
              isAnswer: false,
              explanation: "'노랗다'는 색깔 상태이지만, '힘차게'와 어울리지 않아요.",
            },
            {
              id: "pred-3",
              text: "낮에.",
              isAnswer: false,
              explanation: "'낮에'는 시간을 나타내는 말이지, 문장을 끝맺는 서술어가 아니에요.",
            },
            {
              id: "pred-4",
              text: "사냥꾼이다.",
              isAnswer: false,
              explanation: "'사냥꾼이다'는 무엇이다(정체)이지만, '초원을 힘차게'와 어울리지 않아요.",
            },
          ],
          successFeedback: "훌륭해요! 사자의 힘찬 동작을 나타내는 서술어 '달린다'가 완벽하게 채워졌습니다!",
        },
      },
      {
        speaker: "글별이",
        text: "대단해요! 이제 서술어 3총사의 성격을 정확히 가려낼 수 있는지, 세 가지 유형에 맞게 짝을 지어볼까요?",
        task: matchPair(
          [
            { left: "토끼가 뛴다", right: "어찌하다 (동작)" },
            { left: "하늘이 푸르다", right: "어떠하다 (상태·성질)" },
            { left: "나는 수호자다", right: "무엇이다 (정체·이름)" },
          ],
          "완벽해요! 서술어 3총사(어찌하다, 어떠하다, 무엇이다)의 역할을 명쾌하게 꿰뚫으셨군요!",
          "문장과 서술어의 유형(어찌하다/어떠하다/무엇이다)을 바르게 연결하세요.",
        ),
      },
      {
        speaker: "주인공",
        text: "동작, 상태, 정체! 서술어 3총사의 짝을 모두 맞췄어! 마지막 얼음 주문도 풀어보자!",
      },
      {
        speaker: "글별이",
        text: "좋아요! 꽁꽁깨비의 얼음 마법으로 흩어진 4개의 낱말 카드를 바른 순서로 맞춰 문장 기차를 완성해보세요!",
        task: orderSeq(
          ["사자가", "눈 덮인 협곡을", "힘차게", "달려간다."],
          "얼음 해제! 주어 '사자가'부터 서술어 '달려간다'까지 생생한 문장 기차가 완성되었어요!",
          "낱말 카드를 바른 순서로 배열하여 문장을 완성하세요.",
          [
            [1, 2, 3, 4], // 사자가 눈 덮인 협곡을 힘차게 달려간다.
            [1, 3, 2, 4], // 사자가 힘차게 눈 덮인 협곡을 달려간다.
          ],
        ),
      },
      {
        speaker: "보스",
        text: "크윽... 얼어붙었던 서술어들이 생생하게 살아 움직이다니! 하지만 장난감 공장에 가면 더 큰 곤경에 빠질 것이다!",
      },
    ],
  },
  {
    id: 3,
    title: "장난감 조립 공장, 잃어버린 목적어",
    shortTitle: "동작의 대상 [목적어]",
    concept: "목적어의 개념(누구를/무엇을)과 대상이 필요한 서술어, 문장의 짜임",
    mission: "동작의 대상인 목적어를 빼앗아 공장을 멈춘 태엽 요괴 뚝딱깨비를 물리치고 온전한 문장 기차를 조립하세요.",
    bossName: "태엽 요괴 뚝딱깨비",
    bossTitle: "부품 분해자",
    bossShortName: "뚝딱깨비",
    color: "#d35400",
    background: "/story-backgrounds/stage-3-object-factory.webp",
    bossImage: "/characters/boss-stage-3-lego.webp",
    dialogue: [
      {
        speaker: "주인공",
        text: "태엽 장난감으로 가득한 장난감 조립 공장의 기계들이 삐걱거리며 멈췄어! 로봇들이 '내가 만든다!', '친구가 먹는다!'고만 외치고 도대체 무엇을 만드는지 알 수가 없어! 내 돋보기로 숨은 목적어 낱말 카드를 꼭 찾아낼 거야!",
      },
      {
        speaker: "보스",
        text: "끼릭끼릭! 나는 태엽 요괴 뚝딱깨비! 동작이 가닿을 대상인 '목적어' 부품을 쏙 빼앗아 버렸지! '무엇을' 만드는지 모르면 평생 헛손질만 할 거다!",
      },
      {
        speaker: "글별이",
        text: "수호자님! '누가 먹는다', '누가 만든다'만 있으면 문장이 미완성이에요! 서술어의 동작이 가닿는 대상, 즉 '누구를' 또는 '무엇을'에 해당하는 말을 '목적어'라고 해요!",
      },
      {
        speaker: "주인공",
        text: "글별아, 그런데 '새가 난다'나 '꽃이 핀다'는 목적어가 없어도 문장이 자연스럽잖아?",
      },
      {
        speaker: "글별이",
        text: "정말 날카로운 관찰이에요, 수호자님! '난다', '핀다'처럼 혼자서도 충분한 서술어가 있지만, '먹다', '만들다', '읽다', '좋아하다' 같은 서술어는 반드시 대상(~을/를)이 있어야 온전한 뜻이 완성된답니다!",
      },
      {
        speaker: "주인공",
        text: "아하! 동작의 대상이 꼭 필요한 서술어에는 목적어 뒤에 '~을/를'을 붙여주어야 하는구나!",
        visual: {
          type: "grammar-table",
          grammarTable: {
            title: "🏰 동작의 대상 '목적어'와 필수 서술어",
            subtitle: "동작의 대상인 목적어(~을/를)를 밝히고, 대상이 꼭 필요한 서술어와 짝지어요!",
            cards: [
              {
                title: "1. 동작의 대상 [목적어]",
                badge: "무엇을 / 누구를",
                icon: "🎯",
                colorTheme: "amber",
                timeKeywords: "서술어 동작이 가닿는 구체적인 대상!",
                verbEndings: "책을, 사과를, 친구를, 열쇠를",
                goodExample: "내가 황금 열쇠를 찾았다.",
                badExample: "내가 찾았다. (무엇을 찾았는지 빠짐)",
                pairLabel1: "🎯 목적어의 개념",
                pairLabel2: "🔗 대표 낱말 예시",
                pairDivider: "➔ 대상 결합 ➔",
              },
              {
                title: "2. 목적어 필수 서술어",
                badge: "필수 서술어",
                icon: "⚙️",
                colorTheme: "emerald",
                timeKeywords: "대상이 없으면 무슨 말인지 알 수 없는 서술어!",
                verbEndings: "책을 읽다 · 빵을 먹다 · 문을 열다",
                goodExample: "친구가 재미있는 책을 읽는다.",
                badExample: "친구가 재미있게 읽는다. (읽는 대상이 빠짐)",
                pairLabel1: "⚙️ 서술어 성격",
                pairLabel2: "🔗 자연스러운 결합",
                pairDivider: "➔ 대상 결합 ➔",
              },
              {
                title: "3. 목적어가 없어도 되는 서술어",
                badge: "비교 탐구",
                icon: "💡",
                colorTheme: "rose",
                timeKeywords: "주어와 서술어만으로도 뜻이 완성되는 말!",
                verbEndings: "꽃이 피다 · 새가 날다 · 바람이 불다",
                goodExample: "봄꽃이 활짝 핀다. (목적어 없이도 온전함)",
                badExample: "봄꽃이 활짝 읽는다. (목적어 필요한 서술어 잘못 씀)",
                pairLabel1: "💡 알아두기 상식",
                pairLabel2: "🚂 자연스러운 문장",
                pairDivider: "➔ 주어+서술어 ➔",
              },
            ],
          },
        },
      },
      {
        speaker: "글별이",
        text: "맞아요! 그럼 뚝딱깨비의 부품 상자에서 동작의 대상이 되는 '목적어'를 찾아볼까요? 중앙 화면의 문장에서 친구가 '무엇을' 읽는지 목적어를 찾아보세요!",
        prompt: "다음 문장에서 동작이 가닿는 대상인 [목적어]를 선택하세요.",
        sentence: "친구가 도서관에서 재미있는 동화책을 열심히 읽는다.",
        choices: sentenceChoice(
          [
            { text: "친구가", isAnswer: false },
            { text: "도서관에서", isAnswer: false },
            { text: "동화책을", isAnswer: true },
            { text: "열심히", isAnswer: false },
          ],
          "정답이에요! 친구가 '무엇을' 읽는지 행위의 대상인 '동화책을'이 바로 목적어랍니다!",
          "다시 찾아보세요! 읽는 동작이 향하는 대상, '무엇을'에 해당하는 말을 찾아야 해요.",
        ),
      },
      {
        speaker: "주인공",
        text: "읽는 대상인 '동화책을' 찾아냈어! 로봇 기계에 빠진 목적어 부품도 내가 끼워 넣을게!",
      },
      {
        speaker: "글별이",
        text: "좋아요! 기계가 완성할 수 있도록 '무엇을' 조립하는지 알맞은 목적어 부품을 골라보세요!",
        task: {
          type: "fill-blank",
          instruction: "문장의 흐름에 알맞은 목적어 부품을 선택하세요.",
          equation: [
            { text: "기술자가 공장에서" },
            { text: "", isSlot: true },
            { text: "만들었다." },
          ],
          options: [
            {
              id: "obj-1",
              text: "우주선을",
              isAnswer: true,
              explanation: "정답! '무엇을' 만들었는지 대상인 '우주선을'이 들어가 온전한 문장이 되었어요!",
            },
            {
              id: "obj-2",
              text: "우주선이",
              isAnswer: false,
              explanation: "'우주선이'는 주어를 나타내는 말이에요! 만드는 대상이므로 '우주선을'이 와야 해요.",
            },
            {
              id: "obj-3",
              text: "어제부터",
              isAnswer: false,
              explanation: "'어제부터'는 시간을 나타내는 말이지 목적어가 아니에요.",
            },
            {
              id: "obj-4",
              text: "공장에서",
              isAnswer: false,
              explanation: "'공장에서'는 장소를 나타내는 말이에요.",
            },
          ],
          successFeedback: "정답입니다! '우주선을' 목적어 부품이 장착되어 멋진 완성 문장이 되었습니다!",
        },
      },
      {
        speaker: "글별이",
        text: "완벽해요! 이번에는 서술어와 찰떡궁합인 목적어 짝꿍을 바르게 연결해 볼까요? '무엇을' 하는지 생각해 보세요!",
        task: matchPair(
          [
            { left: "사과를", right: "맛있게 먹는다" },
            { left: "영화를", right: "극장에서 본다" },
            { left: "노래를", right: "친구들과 부른다" },
            { left: "운동화를", right: "발에 신는다" },
          ],
          "대단해요! 서술어에 알맞은 목적어 짝꿍을 완벽하게 연결하셨어요!",
          "목적어와 가장 자연스럽게 어울리는 서술어 짝을 연결하세요.",
          "목적어",
          "서술어",
          "right",
        ),
      },
      {
        speaker: "주인공",
        text: "사과를 먹고, 영화를 보고, 노래를 부른다! 목적어와 서술어가 딱 맞아떨어졌어!",
      },
      {
        speaker: "글별이",
        text: "멋져요! 이제 [주어] - [목적어] - [서술어]가 차례대로 이어지는 3단 문장 기차를 완성해 장난감 공장을 완전히 가동해 봐요!",
        task: orderSeq(
          ["내가", "열쇠를", "찾았다."],
          "기차 출발! 주어(내가) - 목적어(열쇠를) - 서술어(찾았다) 3단 기차가 완벽하게 조립되었어요!",
          "3단 문장 기차(주어-목적어-서술어) 순서에 맞게 카드를 정렬하세요.",
        ),
      },
      {
        speaker: "보스",
        text: "끼긱... 삐리릭! 내 목적어 분해 장치가 망가지다니! 하지만 시계탑 정원의 시간과 높임의 시험은 결코 넘지 못할 것이다!",
      },
    ],
  },
  {
    id: 4,
    title: "시간의 정원과 높임의 탑, 뒤틀린 호응",
    shortTitle: "시간과 높임의 저울 [호응]",
    concept: "시간의 호응(과거·현재·미래)과 높임의 호응(주어 '께서' ↔ 서술어 '-(으)시-', 높임 낱말)",
    mission: "시간의 화살과 높임의 저울을 비틀어놓은 시계 요괴 째깍깨비를 정화하고 바른 호응을 세우세요.",
    bossName: "시계 요괴 째깍깨비",
    bossTitle: "시간의 왜곡자",
    bossShortName: "째깍깨비",
    color: "#16a085",
    background: "/story-backgrounds/stage-4-time-garden.webp",
    bossImage: "/characters/boss-stage-4-chrono.webp",
    dialogue: [
      {
        speaker: "주인공",
        text: "시간과 높임의 신전 시계들이 거꾸로 돌고 신전 지킴이들 말도 너무 이상해! '어제 먹을 것이다'라거나 '할머니가 밥을 먹는다'라니, 말이 하나도 안 맞잖아!",
      },
      {
        speaker: "보스",
        text: "째깍째깍! 나는 시계 요괴 째깍깨비! 시간의 화살과 높임의 저울을 비틀어놓았지! 앞말과 뒷말의 균형이 깨지면 문장은 한순간에 무너진다!",
      },
      {
        speaker: "글별이",
        text: "수호자님! 문장에서 앞말과 뒷말이 자연스럽게 짝을 이루는 것을 '호응'이라고 해요! 째깍깨비가 '시간의 호응'과 '높임의 호응'을 어지럽혀 놓았어요!",
      },
      {
        speaker: "주인공",
        text: "시간의 호응은 어제(과거-했다), 오늘(현재-한다), 내일(미래-하겠다)처럼 시간을 맞추는 거지? 그럼 높임의 호응은 어떻게 맞춰야 해?",
        visual: {
          type: "grammar-table",
          grammarTable: {
            title: "⏱️ 시간의 호응 (과거 ➔ 현재 ➔ 미래)",
            subtitle: "시간을 나타내는 말과 어울리는 서술어의 형태는 반드시 호응이 이루어져야 해요!",
            cards: [
              {
                title: "과거",
                badge: "이미 일어난 일",
                icon: "⏮️",
                colorTheme: "rose",
                timeKeywords: "어제, 지난주, 아까, 옛날에",
                verbEndings: "~았/었다, ~했다",
                goodExample: "어제 사과를 맛있게 먹었다.",
                badExample: "어제 사과를 먹을 것이다.",
              },
              {
                title: "현재",
                badge: "지금 일어나는 일",
                icon: "▶️",
                colorTheme: "emerald",
                timeKeywords: "오늘, 지금, 요즘, 매일",
                verbEndings: "~ㄴ/는다, ~하고 있다, ~다",
                goodExample: "지금 책을 재미있게 읽는다.",
                badExample: "지금 책을 다 읽었다.",
              },
              {
                title: "미래",
                badge: "앞으로 일어날 일",
                icon: "⏭️",
                colorTheme: "sky",
                timeKeywords: "내일, 다음 주, 곧, 앞으로",
                verbEndings: "~하겠다, ~(으)ㄹ 것이다",
                goodExample: "내일 푸른 바다로 떠날 것이다.",
                badExample: "내일 푸른 바다로 떠났다.",
              },
            ],
          },
        },
      },
      {
        speaker: "글별이",
        text: "웃어른에게 말할 때는 '누가' 뒤에 '~께서'를 붙이고, 끝말에 '-(으)시-'를 넣어 정중하게 올려주면 돼요!",
        visual: {
          type: "grammar-table",
          grammarTable: {
            title: "👑 웃어른을 높이는 방법",
            cards: [
              {
                title: "1. 주어 높이기",
                badge: "~이/가 ➔ ~께서",
                icon: "👑",
                colorTheme: "rose",
                timeKeywords: "선생님이, 할머니가, 아버지가",
                verbEndings: "선생님께서, 할머니께서, 아버지께서",
                goodExample: "선생님께서 교실로 오셨다.",
                badExample: "선생님이 교실로 왔다.",
                pairLabel1: "보통 표현",
                pairLabel2: "👑 높임 짝꿍",
                pairDivider: "➔ 높여 부르기 ➔",
              },
              {
                title: "2. 특별한 높임말",
                badge: "낱말 바꾸기",
                icon: "✨",
                colorTheme: "amber",
                timeKeywords: "밥, 나이, 말, 집, 이름",
                verbEndings: "진지, 연세, 말씀, 댁, 성함",
                goodExample: "할머니께서 진지를 드신다.",
                badExample: "할머니가 밥을 먹는다.",
                pairLabel1: "보통 낱말",
                pairLabel2: "✨ 특별한 높임말",
                pairDivider: "➔ 높여 부르기 ➔",
              },
              {
                title: "3. 서술어 높이기",
                badge: "-(으)시- & 특수 서술어",
                icon: "🪄",
                colorTheme: "sky",
                timeKeywords: "가다, 먹다, 자다, 있다",
                verbEndings: "가시다, 잡수시다, 주무시다, 계시다",
                goodExample: "할아버지께서 방에 계신다.",
                badExample: "할아버지가 방에 있다.",
                pairLabel1: "보통 행동",
                pairLabel2: "🪄 높임 서술어",
                pairDivider: "➔ 높여 부르기 ➔",
              },
            ],
          },
        },
      },
      {
        speaker: "주인공",
        text: "아하! 그럼 낱말 자체를 높여 부르는 말도 있어, 글별아?",
      },
      {
        speaker: "글별이",
        text: "네! '밥'은 '진지', '먹다'는 '잡수시다', '자다'는 '주무시다'처럼, 우리말의 특별한 높임말을 써야 해요!",
        visual: {
          type: "guide-wings",
          guideWings: {
            leftTitle: "특별한 높임 낱말",
            leftBadge: "이름 바꾸기",
            leftIcon: "✨",
            leftItems: [
              { normal: "밥", honorific: "진지" },
              { normal: "나이", honorific: "연세" },
              { normal: "말", honorific: "말씀" },
              { normal: "집", honorific: "댁" },
              { normal: "이름", honorific: "성함" },
            ],
            rightTitle: "특별한 높임 서술어",
            rightBadge: "행동 바꾸기",
            rightIcon: "🪄",
            rightItems: [
              { normal: "먹다", honorific: "잡수시다 / 드시다" },
              { normal: "자다", honorific: "주무시다" },
              { normal: "있다", honorific: "계시다" },
              { normal: "아프다", honorific: "편찮으시다" },
              { normal: "주다", honorific: "드리다" },
            ],
          },
        },
      },
      {
        speaker: "주인공",
        text: "우와! '할머니가 밥을 먹는다'가 아니라, '할머니께서 진지를 잡수신다'로 마법처럼 싹 바뀌는구나!",
      },
      {
        speaker: "글별이",
        text: "정확해요! 그럼 뒤틀린 시계탑에서 높임의 호응이 완벽하게 이루어진 바른 문장을 찾아보세요!",
        prompt: "주어(~께서)와 서술어(-(으)시-)의 [높임 호응]이 올바른 문장을 고르세요.",
        sentence: "웃어른을 공경하는 마음을 바르게 표현한 문장은 무엇일까요?",
        choices: choice(
          "선생님께서 교실로 걸어오셨다.",
          [
            "선생님이 교실로 걸어왔다.",
            "선생님께서 교실로 걸어왔다.",
            "선생님이 교실로 걸어오셨다.",
          ],
          "정답이에요! 주어에 높임말 '~께서'가 오고, 서술어에도 높임의 뜻을 더하는 '-시-(오셨다)'가 완벽하게 호응을 이루었어요!",
          "주어와 서술어를 잘 살펴보세요! 웃어른 주어 '~께서'와 높임 서술어 '-(으)시-'가 한 세트로 짝을 이루어야 해요.",
        ),
      },
      {
        speaker: "주인공",
        text: "주어에 붙은 '~께서'와 서술어 '오셨다'가 딱 맞았어! 다음 빈칸 슬롯도 내가 맞춰볼게!",
      },
      {
        speaker: "글별이",
        text: "멋져요! 이번에는 웃어른을 공경하는 마음을 담아, 주어와 서술어에 알맞은 높임 카드를 골라보세요!",
        task: {
          type: "fill-blank",
          instruction: "문맥에 맞는 올바른 높임 표현을 선택하세요.",
          equation: [
            { text: "할머니" },
            { text: "", isSlot: true },
            { text: "따뜻한 안방에서 편안히" },
            { text: "", isSlot: true },
          ],
          options: [
            {
              id: "hon-1",
              text: "께서 / 주무신다",
              isAnswer: true,
              explanation: "정답! 웃어른 주어에는 높임 조사 '께서', '자다' 대신 높임 특수어 '주무시다'가 완벽하게 호응해요!",
            },
            {
              id: "hon-2",
              text: "가 / 잔다",
              isAnswer: false,
              explanation: "웃어른께 예사말을 쓰면 높임의 호응이 깨져요.",
            },
            {
              id: "hon-3",
              text: "께서 / 잔다",
              isAnswer: false,
              explanation: "주어는 높였지만 서술어가 낮춤말이어서 반쪽짜리 호응이에요.",
            },
            {
              id: "hon-4",
              text: "가 / 주무신다",
              isAnswer: false,
              explanation: "서술어는 높였지만 주어 조사가 예사말('가')이어서 불일치해요.",
            },
          ],
          successFeedback: "훌륭해요! 주어 높임 조사('께서')와 특수 높임 서술어('주무신다')가 완벽하게 균형을 맞추었습니다!",
        },
      },
      {
        speaker: "글별이",
        text: "완벽해요! 이제 시간의 짝꿍과 높임의 짝꿍을 저울 위에 나란히 올려 균형을 맞춰볼까요?",
        task: matchPair(
          [
            { left: "어제 박물관에", right: "다녀왔다 (과거 호응)" },
            { left: "내일 친구와", right: "만날 것이다 (미래 호응)" },
            { left: "아버지께서 신문을", right: "읽으신다 (높임 호응)" },
            { left: "할아버지께서 댁에", right: "계신다 (특수 높임)" },
          ],
          "대단해요! 시간의 화살과 높임의 저울이 모두 완벽하게 수평을 이루었어요!",
          "시간 및 높임의 짝꿍이 올바르게 맺어진 쌍을 연결하세요.",
        ),
      },
      {
        speaker: "주인공",
        text: "시간의 호응과 높임의 호응 짝꿍을 모두 맞췄어! 거꾸로 가던 시계탑이 제자리를 찾고 있어!",
      },
      {
        speaker: "글별이",
        text: "마지막 관문이에요! 흩어진 시간과 서술어 카드를 순서대로 정렬해 바른 시간 호응 문장을 세워보세요!",
        task: orderSeq(
          ["우리는 내일 아침에", "모두 함께", "푸른 바다로", "떠날 것이다."],
          "시간의 시계탑 복구 완료! '내일'과 서술어 '떠날 것이다'가 완벽하게 호응을 이루었어요!",
          "시간 표현과 서술어의 호응이 어울리도록 문장을 완성하세요.",
        ),
      },
      {
        speaker: "보스",
        text: "째깍... 내 시간의 화살과 높임의 저울이 모두 바르게 정렬되다니! 하지만 말글 전당의 뒤죽박죽 대마왕님은 차원이 다르다!",
      },
    ],
  },
  {
    id: 5,
    title: "말글의 전당, 혼돈의 마지막 시험",
    shortTitle: "부정표현과 까닭표현의 호응 [호응 총결산]",
    concept: "부정하는 말(결코·전혀·별로 + ~않다)과 까닭을 나타내는 말(왜냐하면 ~ 때문이다)",
    mission: "언어의 질서를 무너뜨린 뒤죽박죽 대마왕에 맞서 호응의 완전한 결속으로 말글 세상을 구원하세요.",
    bossName: "혼돈의 군주 뒤죽박죽 대마왕",
    bossTitle: "말글 파괴자",
    bossShortName: "뒤죽박죽 대마왕",
    color: "#c0392b",
    background: "/story-backgrounds/stage-5-grammar-citadel.webp",
    bossImage: "/characters/boss-stage-5-chaos.webp",
    dialogue: [
      {
        speaker: "글별이",
        text: "수호자님, 드디어 마지막 관문이에요! 그동안 배운 내용을 모두 활용해 뒤죽박죽 대마왕을 쓰러뜨리세요!",
      },
      {
        speaker: "주인공",
        text: "혼돈의 성 어둠의 마법진이 검게 물들었어! 마왕의 주문에 '결코 포기하겠다'라거나 '왜냐하면 비가 와서 우산을 썼다'처럼 말이 앞뒤가 완전히 어긋나 있어!",
      },
      {
        speaker: "보스",
        text: "크하하하! 나는 언어의 혼돈 군주 뒤죽박죽 대마왕! 문장의 논리와 호응을 찢어놓았다! 앞뒤가 맞지 않는 말은 결코 진실의 힘을 내지 못하지!",
      },
      {
        speaker: "글별이",
        text: "수호자님! 이번에는 '부정하는 말과 어울리는 표현'과 '까닭을 나타내는 말과 어울리는 표현'이에요! 자석의 N극과 S극처럼 꼭 맞는 짝과 결합해야 한답니다!",
      },
      {
        speaker: "주인공",
        text: "자석의 극처럼 꼭 맞는 표현이라고? 어떤 것들이 있어, 글별아?",
      },
      {
        speaker: "글별이",
        text: "'결코', '전혀', '별로'처럼 부정의 뜻을 나타내는 말 뒤에는 반드시 부정하는 말('~않다', '~없다', '~못하다')이 오고, '왜냐하면'으로 이유를 시작하면 문장 끝은 반드시 '~때문이다'로 맺어야 한답니다!",
      },
      {
        speaker: "주인공",
        text: "'결코 포기하겠다'는 틀린 말이고, '결코 포기하지 않는다'가 올바른 표현이구나! '왜냐하면 ~때문이다'도 세트고!",
        visual: {
          type: "grammar-table",
          grammarTable: {
            title: "⚡ 혼돈을 물리치는 절대 호응 법칙",
            subtitle: "부정하는 말은 부정하는 서술어와! 왜냐하면은 ~때문이다와 어울려요!",
            cards: [
              {
                title: "1. 부정하는 말과 어울리는 표현",
                badge: "부정의 표현 결합",
                icon: "🧲",
                colorTheme: "purple",
                timeKeywords: "전혀, 결코, 별로, 도무지",
                verbEndings: "~않다, ~없다, ~못하다, ~아니다",
                pairLabel1: "부정하는 말",
                pairLabel2: "어울리는 서술어",
                pairDivider: "➔",
              },
              {
                title: "2. 까닭을 나타내는 말과 어울리는 표현",
                badge: "까닭과 결과 결합",
                icon: "💡",
                colorTheme: "sky",
                timeKeywords: "왜냐하면, ~까닭은, ~이유는",
                verbEndings: "~기 때문이다, ~때문이다",
                pairLabel1: "까닭을 나타내는 말",
                pairLabel2: "어울리는 서술어",
                pairDivider: "➔",
              },
            ],
          },
        },
      },
      {
        speaker: "글별이",
        text: "맞아요! 긍정과 부정이 뒤섞이거나 원인과 결과의 형식이 깨지면 문장의 힘이 사라져요! 뒤죽박죽 대마왕의 결계를 깰 첫 번째 어울리는 문장을 찾아보세요!",
        sentence: "앞말과 뒷말이 자연스럽게 어울리는 문장은 무엇일까요?",
        choices: choice(
          "나는 그 소식을 전혀 알지 못했다.",
          [
            "나는 그 소식을 전혀 알고 있었다.",
            "나는 그 소식을 결코 알고 있었다.",
            "나는 그 소식을 별로 알고 싶다.",
          ],
          "정답이에요! '전혀' 뒤에는 반드시 부정하는 서술어인 '~알지 못했다'가 자석처럼 어울려야 해요!",
          "부정하는 말 '전혀' 뒤에는 부정하는 서술어(~못했다, ~않았다)가 와야 자연스러워요.",
        ),
      },
      {
        speaker: "주인공",
        text: "'전혀' 뒤에 부정하는 말 '알지 못했다'를 찾았어! 다음 빈칸 슬롯도 알맞은 짝을 찾아 완성해 볼게!",
      },
      {
        speaker: "글별이",
        text: "좋아요! 대마왕이 어지럽힌 빈칸에 '까닭은'과 짝을 이루는 알맞은 끝말 카드를 채워보세요!",
        task: {
          type: "fill-blank",
          instruction: "까닭을 나타내는 말('까닭은')에 알맞은 끝말 카드를 선택하세요.",
          equation: [
            { text: "내가 오늘 우산을 챙긴 까닭은," },
            { text: "오후에 비가 올 예정이기" },
            { text: "", isSlot: true },
          ],
          options: [
            {
              id: "caus-1",
              text: "때문이다.",
              isAnswer: true,
              explanation: "정답! '까닭은'으로 시작하는 문장은 반드시 끝에 '~때문이다'가 호응해야 논리가 완성돼요!",
            },
            {
              id: "caus-2",
              text: "것이다.",
              isAnswer: false,
              explanation: "'것이다'는 추측이나 의지일 뿐, '까닭은'의 인과 호응 짝꿍이 아니에요.",
            },
            {
              id: "caus-3",
              text: "바람이다.",
              isAnswer: false,
              explanation: "'바람이다'는 희망이나 기대를 나타내는 말이에요.",
            },
            {
              id: "caus-4",
              text: "셈이다.",
              isAnswer: false,
              explanation: "'셈이다'는 평가를 나타내는 말이에요.",
            },
          ],
          successFeedback: "완벽합니다! '까닭은 ... 때문이다'의 올바른 표현이 완성되었습니다!",
        },
      },
      {
        speaker: "글별이",
        text: "대단해요! 이제 강력한 마법진에 부정하는 말과 까닭을 나타내는 말에 어울리는 표현을 찾아 올바르게 연결해 볼까요?",
        task: matchPair(
          [
            { left: "결코 거짓말을", right: "하지 않겠다" },
            { left: "전혀 두렵지", right: "않다" },
            { left: "왜냐하면 열심히 연습했기", right: "때문이다" },
            { left: "별로 마음에", right: "들지 않는다" },
          ],
          "놀라워요! 앞말과 어울리는 표현들이 전당의 결계를 정화하고 있어요!",
          "앞말과 자연스럽게 어울리는 표현을 찾아 연결하세요.",
        ),
      },
      {
        speaker: "주인공",
        text: "결코 하지 않겠다, 전혀 두렵지 않다, 별로 마음에 들지 않는다, 왜냐하면 ~때문이다! 마법진의 어울리는 표현들이 전부 제자리를 찾았어!",
      },
      {
        speaker: "글별이",
        text: "마지막 일격이에요! 흩어진 말글 조각들을 앞뒤가 꼭 들어맞는 바른 문장으로 완성해 뒤죽박죽 대마왕을 물리치세요!",
        task: orderSeq(
          [
            "우리가 승리할 수 있었던 까닭은,",
            "서로를 믿고",
            "끝까지 포기하지 않았기",
            "때문이다.",
          ],
          "대승리! '까닭은'과 '~때문이다'가 자연스럽게 어울려 혼돈의 어둠을 완전히 물리쳤어요!",
          "까닭을 나타내는 말('까닭은 ~ 때문이다')이 어울리도록 문장을 순서대로 완성하세요.",
        ),
      },
      {
        speaker: "보스",
        text: "크아악! 문장의 주인공(주어)과 끝맺는 말(서술어), 동작의 대상(목적어)에 이어 시간, 높임, 부정과 까닭의 호응까지 완벽하게 세우다니! 내 혼돈 마법이 전부 소멸한다!",
      },
    ],
  },
];

export type CharacterId = "bau" | "ara" | "narae";

export type Character = {
  id: CharacterId;
  name: string;
  role: string;
  meaning: string;
  image: string;
  physicalDefense: number;
  magicDefense: number;
};

export const characters: Character[] = [
  {
    id: "bau",
    name: "바우",
    role: "문장의 수호자",
    meaning: "바위처럼 단단하게 문장의 기둥과 주어를 지키는 수호자",
    image: "/characters/bau.webp",
    physicalDefense: 4,
    magicDefense: 0,
  },
  {
    id: "ara",
    name: "아라",
    role: "낱말 탐험가",
    meaning: "바다('아라')처럼 넓은 말글 세상에서 목적어를 찾는 모험가",
    image: "/characters/ara.webp",
    physicalDefense: 2,
    magicDefense: 2,
  },
  {
    id: "narae",
    name: "나래",
    role: "호응의 조율사",
    meaning: "문장에 날개('나래')를 달아주듯 짝꿍 호응을 잇는 조율사",
    image: "/characters/narae.webp",
    physicalDefense: 0,
    magicDefense: 4,
  },
];
