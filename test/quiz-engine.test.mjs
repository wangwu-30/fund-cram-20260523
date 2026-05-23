import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPracticeSet,
  gradeSession,
  searchConcepts,
  explainQuestion,
} from "../src/quiz-engine.mjs";

const questions = [
  {
    id: "q1",
    subjectId: "s1",
    chapterId: "c1",
    conceptIds: ["market"],
    difficulty: 1,
    answer: 1,
  },
  {
    id: "q2",
    subjectId: "s1",
    chapterId: "c2",
    conceptIds: ["nav"],
    difficulty: 2,
    answer: 2,
  },
  {
    id: "q3",
    subjectId: "s2",
    chapterId: "c3",
    conceptIds: ["duration"],
    difficulty: 3,
    answer: 0,
  },
];

const concepts = [
  {
    id: "market",
    title: "金融市场",
    aliases: ["市场", "资金交易"],
    summary: "金融市场是资金供求双方交易金融工具的场所和机制。",
    detail: "考试常把金融市场与金融服务机构、货币市场混淆。",
  },
  {
    id: "nav",
    title: "基金份额净值",
    aliases: ["净值", "NAV"],
    summary: "基金份额净值等于基金资产净值除以基金总份额。",
    detail: "净值反映每一份基金份额对应的资产价值。",
  },
];

describe("quiz engine", () => {
  it("filters questions by subject and chapter", () => {
    const set = buildPracticeSet(questions, {
      subjectId: "s1",
      chapterId: "c2",
      count: 10,
    });

    assert.deepEqual(
      set.map((question) => question.id),
      ["q2"],
    );
  });

  it("prioritizes weak concepts when building a practice set", () => {
    const set = buildPracticeSet(questions, {
      subjectId: "s1",
      count: 2,
      weakConcepts: ["nav"],
    });

    assert.equal(set[0].id, "q2");
  });

  it("grades answers and returns weak concept counts", () => {
    const result = gradeSession(questions, { q1: 1, q2: 0, q3: 3 });

    assert.equal(result.correct, 1);
    assert.equal(result.total, 3);
    assert.equal(result.percent, 33);
    assert.deepEqual(result.wrongQuestionIds, ["q2", "q3"]);
    assert.deepEqual(result.weakConcepts, { nav: 1, duration: 1 });
  });

  it("finds concepts by title, alias, summary, and detail", () => {
    const matches = searchConcepts(concepts, "NAV 怎么算");

    assert.equal(matches[0].id, "nav");
  });

  it("builds a follow-up explanation from a question and concept cards", () => {
    const question = {
      id: "q1",
      stem: "现代金融体系的两大运行载体是什么？",
      explanation: "金融市场和金融服务机构共同构成核心载体。",
      conceptIds: ["market"],
    };

    const reply = explainQuestion(question, concepts, "金融市场是什么意思");

    assert.match(reply.answer, /金融市场/);
    assert.equal(reply.relatedConcepts[0].id, "market");
  });
});
