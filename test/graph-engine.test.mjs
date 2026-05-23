import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildKnowledgeGraph,
  buildMindMapTree,
  getConceptNeighborhood,
} from "../src/graph-engine.mjs";

const subjects = [
  {
    id: "s1",
    shortTitle: "科目一",
    title: "法规",
    chapters: [
      { id: "c1", title: "第一章", focus: "基础" },
      { id: "c2", title: "第二章", focus: "进阶" },
    ],
  },
];

const concepts = [
  {
    id: "market",
    subjectId: "s1",
    chapterId: "c1",
    title: "金融市场",
    summary: "资金交易场所。",
    detail: "容易与金融服务机构混淆。",
    traps: ["金融市场等同于金融服务机构。"],
  },
  {
    id: "institution",
    subjectId: "s1",
    chapterId: "c1",
    title: "金融服务机构",
    summary: "提供金融服务的组织。",
    detail: "不是交易场所。",
    traps: [],
  },
  {
    id: "nav",
    subjectId: "s1",
    chapterId: "c2",
    title: "基金份额净值",
    summary: "资产净值除以总份额。",
    detail: "用于估值。",
    traps: [],
  },
];

const questions = [
  {
    id: "q1",
    subjectId: "s1",
    chapterId: "c1",
    conceptIds: ["market", "institution"],
  },
];

describe("graph engine", () => {
  it("builds subject, chapter, and concept containment edges", () => {
    const graph = buildKnowledgeGraph(subjects, concepts, questions);

    assert.ok(graph.nodes.some((node) => node.id === "subject:s1" && node.type === "subject"));
    assert.ok(graph.edges.some((edge) => edge.from === "subject:s1" && edge.to === "chapter:c1" && edge.type === "contains"));
    assert.ok(graph.edges.some((edge) => edge.from === "chapter:c1" && edge.to === "concept:market" && edge.type === "contains"));
  });

  it("adds relation edges from shared questions and concept text", () => {
    const graph = buildKnowledgeGraph(subjects, concepts, questions);

    assert.ok(graph.edges.some((edge) => edge.type === "tested-together" && edge.from === "concept:market" && edge.to === "concept:institution"));
    assert.ok(graph.edges.some((edge) => edge.type === "confuses-with" && edge.from === "concept:market" && edge.to === "concept:institution"));
  });

  it("returns a bounded neighborhood around a concept", () => {
    const graph = buildKnowledgeGraph(subjects, concepts, questions);
    const neighborhood = getConceptNeighborhood(graph, "market", { depth: 1 });

    assert.ok(neighborhood.nodes.some((node) => node.id === "concept:market"));
    assert.ok(neighborhood.nodes.some((node) => node.id === "concept:institution"));
    assert.ok(neighborhood.nodes.some((node) => node.id === "chapter:c1"));
    assert.ok(!neighborhood.nodes.some((node) => node.id === "concept:nav"));
  });

  it("builds a subject-chapter-concept mind map tree", () => {
    const tree = buildMindMapTree(subjects, concepts);

    assert.equal(tree.children[0].children[0].children[0].label, "金融市场");
  });
});
