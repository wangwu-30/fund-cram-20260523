export function buildPracticeSet(questions, options = {}) {
  const {
    subjectId = "all",
    chapterId = "all",
    count = 20,
    weakConcepts = [],
    mode = "chapter",
  } = options;

  const weakSet = new Set(weakConcepts);
  const filtered = questions.filter((question) => {
    const subjectMatch = subjectId === "all" || question.subjectId === subjectId;
    const chapterMatch = chapterId === "all" || question.chapterId === chapterId;
    return subjectMatch && chapterMatch;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aWeak = a.conceptIds?.some((id) => weakSet.has(id)) ? 1 : 0;
    const bWeak = b.conceptIds?.some((id) => weakSet.has(id)) ? 1 : 0;
    if (aWeak !== bWeak) return bWeak - aWeak;
    if (mode === "mock") return stableHash(a.id) - stableHash(b.id);
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    return stableHash(a.id) - stableHash(b.id);
  });

  return sorted.slice(0, Math.max(1, Number(count) || 20));
}

export function gradeSession(questions, answers = {}) {
  let correct = 0;
  const wrongQuestionIds = [];
  const weakConcepts = {};

  for (const question of questions) {
    if (answers[question.id] === question.answer) {
      correct += 1;
      continue;
    }

    wrongQuestionIds.push(question.id);
    for (const conceptId of question.conceptIds || []) {
      weakConcepts[conceptId] = (weakConcepts[conceptId] || 0) + 1;
    }
  }

  const total = questions.length;
  return {
    correct,
    total,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    wrongQuestionIds,
    weakConcepts,
  };
}

export function searchConcepts(concepts, query, options = {}) {
  const limit = options.limit ?? 6;
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  return concepts
    .map((concept) => {
      const fields = [
        concept.title,
        ...(concept.aliases || []),
        concept.summary,
        concept.detail,
        concept.example,
        concept.formula,
      ]
        .filter(Boolean)
        .join(" ");
      const normalizedFields = normalizeText(fields);
      const exactTitle = normalizeText(concept.title) === normalizedQuery ? 40 : 0;
      const normalizedTitle = normalizeText(concept.title);
      const titleHit = normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle) ? 36 : 0;
      const aliasHit = (concept.aliases || []).some((alias) =>
        normalizeText(alias).includes(normalizedQuery) || normalizedQuery.includes(normalizeText(alias)),
      )
        ? 20
        : 0;
      const fieldHit = normalizedFields.includes(normalizedQuery) ? 12 : 0;
      const tokenScore = queryTokens(normalizedQuery).reduce((score, token) => {
        return score + (normalizedFields.includes(token) ? Math.min(token.length, 8) : 0);
      }, 0);

      return {
        concept,
        score: exactTitle + titleHit + aliasHit + fieldHit + tokenScore,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.concept.title.localeCompare(b.concept.title, "zh-Hans-CN"))
    .slice(0, limit)
    .map((item) => item.concept);
}

export function explainQuestion(question, concepts, userMessage = "") {
  const directConcepts = concepts.filter((concept) => question.conceptIds?.includes(concept.id));
  const searchedConcepts = searchConcepts([...directConcepts, ...concepts], userMessage, { limit: 4 });
  const relatedConcepts = uniqueById(searchedConcepts.length > 0 ? searchedConcepts : directConcepts).slice(0, 4);
  const focus = relatedConcepts[0] || directConcepts[0];

  const answer = [
    focus ? `先抓关键词：${focus.title}。${focus.summary}` : "先回到题干关键词，再定位到对应知识点。",
    question?.explanation ? `本题题解：${question.explanation}` : "",
    focus?.detail ? `展开理解：${focus.detail}` : "",
    focus?.formula ? `公式/口径：${focus.formula}` : "",
    focus?.example ? `记忆例子：${focus.example}` : "",
    focus?.traps?.length ? `常见干扰：${focus.traps[0]}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { answer, relatedConcepts };
}

export function generateQuestions(concepts, seedQuestions = []) {
  const generated = [];

  for (const concept of concepts) {
    const baseOptions = ensureThreeTraps(concept);
    generated.push(makeQuestion(concept, "definition", baseOptions));
    generated.push(makeQuestion(concept, "trap", rotate(baseOptions, 1)));
    generated.push(makeQuestion(concept, "scenario", rotate(baseOptions, 2)));
    generated.push(makeQuestion(concept, "boundary", rotate(baseOptions, 3)));
    generated.push(makeQuestion(concept, "exam", rotate(baseOptions, 1).reverse()));
  }

  return [...seedQuestions, ...generated].map((question, index) => ({
    ...question,
    order: index + 1,
  }));
}

export function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[，。、“”‘’；：？！（）()【】[\]《》<>|/\\,.;:?!\s]+/g, "");
}

function makeQuestion(concept, variant, traps) {
  const correct = buildCorrectOption(concept, variant);
  const optionSet = [correct, ...traps].slice(0, 4);
  const answer = stableHash(`${concept.id}-${variant}`) % 4;
  const options = placeAnswer(optionSet, answer);

  return {
    id: `${concept.id}-${variant}`,
    subjectId: concept.subjectId,
    chapterId: concept.chapterId,
    conceptIds: [concept.id],
    difficulty: concept.difficulty || (variant === "definition" ? 1 : variant === "trap" || variant === "boundary" ? 2 : 3),
    type: "单选题",
    stem: buildStem(concept, variant),
    options,
    answer,
    explanation: buildExplanation(concept, variant),
  };
}

function buildStem(concept, variant) {
  if (variant === "definition") return `关于“${concept.title}”，下列说法最准确的是？`;
  if (variant === "trap") return `备考易错点：“${concept.title}”应优先抓住哪一层含义？`;
  if (variant === "boundary") return `下列哪项最能排除对“${concept.title}”的常见误解？`;
  if (variant === "exam") return `围绕“${concept.title}”这一考点，考试中应选择哪项判断？`;
  if (concept.scenario) return concept.scenario;
  const alias = concept.aliases?.[0] || concept.title;
  return `题干出现“${alias}”时，最可能考查的是下列哪项？`;
}

function buildCorrectOption(concept, variant) {
  if (variant === "definition" || variant === "scenario") return concept.summary;
  if (variant === "trap") return buildKeyPoint(concept);
  if (variant === "boundary") return concept.detail || concept.summary;
  if (variant === "exam") return concept.example ? `${concept.title}的记忆抓手：${concept.example}` : buildKeyPoint(concept);
  return concept.summary;
}

function buildKeyPoint(concept) {
  if (concept.keyPoint) return concept.keyPoint;
  if (concept.formula) return `${concept.title}的核心口径是：${concept.formula}`;
  return `${concept.title}的考试重点是先判断定义边界，再排除把它和相邻概念混同的选项。`;
}

function buildExplanation(concept, variant) {
  const lines = [
    `${concept.title}：${concept.summary}`,
    concept.detail,
    variant !== "definition" && concept.traps?.length ? `本题干扰项通常会把它误说成：${concept.traps[0]}` : "",
    concept.example ? `可这样记：${concept.example}` : "",
  ];
  return lines.filter(Boolean).join(" ");
}

function ensureThreeTraps(concept) {
  const generic = [
    `它只表示收益保证，风险由管理人承担。`,
    `它只适用于私募基金，不涉及公募基金。`,
    `它属于投资者自由约定事项，监管和自律规则通常不介入。`,
  ];
  return [...(concept.traps || []), ...generic].slice(0, 3);
}

function placeAnswer(options, answerIndex) {
  const correct = options[0];
  const wrong = options.slice(1);
  const placed = [...wrong];
  placed.splice(answerIndex, 0, correct);
  return placed.slice(0, 4);
}

function rotate(values, offset) {
  return values.map((_, index) => values[(index + offset) % values.length]);
}

function uniqueById(values) {
  const seen = new Set();
  return values.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function queryTokens(value) {
  const cleaned = normalizeText(value);
  if (!cleaned) return [];
  const tokens = new Set([cleaned]);
  const stopTokens = new Set(["什么", "怎么", "为何", "为什么", "如何", "解释", "请问", "这个", "一下", "区别", "原因"]);
  for (let size = 2; size <= Math.min(6, cleaned.length); size += 1) {
    for (let index = 0; index <= cleaned.length - size; index += 1) {
      const token = cleaned.slice(index, index + size);
      if (!stopTokens.has(token)) tokens.add(token);
    }
  }
  return [...tokens];
}

function stableHash(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}
