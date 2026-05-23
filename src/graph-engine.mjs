import { normalizeText } from "./quiz-engine.mjs";

export function buildKnowledgeGraph(subjects, concepts, questions) {
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();
  const edgeMap = new Map();
  const questionCounts = countQuestionsByConcept(questions);

  const addNode = (node) => {
    if (nodeMap.has(node.id)) return;
    nodeMap.set(node.id, node);
    nodes.push(node);
  };

  const addEdge = (edge) => {
    const key = edge.directed === false ? edgeKeyUndirected(edge.type, edge.from, edge.to) : `${edge.type}:${edge.from}->${edge.to}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.weight = (existing.weight || 1) + (edge.weight || 1);
      existing.questionIds = [...new Set([...(existing.questionIds || []), ...(edge.questionIds || [])])];
      return;
    }
    const normalized = { weight: 1, directed: true, ...edge, id: key };
    edgeMap.set(key, normalized);
    edges.push(normalized);
  };

  for (const subject of subjects) {
    addNode({
      id: subjectNodeId(subject.id),
      type: "subject",
      label: subject.shortTitle,
      title: subject.title,
      subjectId: subject.id,
    });

    subject.chapters.forEach((chapter, index) => {
      addNode({
        id: chapterNodeId(chapter.id),
        type: "chapter",
        label: chapter.title,
        title: chapter.title,
        focus: chapter.focus,
        subjectId: subject.id,
        chapterId: chapter.id,
      });
      addEdge({
        from: subjectNodeId(subject.id),
        to: chapterNodeId(chapter.id),
        type: "contains",
        label: "包含",
      });
      const nextChapter = subject.chapters[index + 1];
      if (nextChapter) {
        addEdge({
          from: chapterNodeId(chapter.id),
          to: chapterNodeId(nextChapter.id),
          type: "learning-path",
          label: "学习顺序",
        });
      }
    });
  }

  const conceptsByChapter = groupBy(concepts, "chapterId");
  for (const concept of concepts) {
    addNode({
      id: conceptNodeId(concept.id),
      type: "concept",
      label: concept.title,
      title: concept.title,
      summary: concept.summary,
      detail: concept.detail,
      formula: concept.formula,
      traps: concept.traps || [],
      subjectId: concept.subjectId,
      chapterId: concept.chapterId,
      conceptId: concept.id,
      questionCount: questionCounts[concept.id] || 0,
    });
    addEdge({
      from: chapterNodeId(concept.chapterId),
      to: conceptNodeId(concept.id),
      type: "contains",
      label: "包含",
    });
  }

  for (const chapterConcepts of Object.values(conceptsByChapter)) {
    chapterConcepts.forEach((concept, index) => {
      const next = chapterConcepts[index + 1];
      if (next) {
        addEdge({
          from: conceptNodeId(concept.id),
          to: conceptNodeId(next.id),
          type: "learning-path",
          label: "学习顺序",
        });
      }
    });
  }

  for (const question of questions) {
    const ids = [...new Set(question.conceptIds || [])];
    for (let index = 0; index < ids.length; index += 1) {
      for (let other = index + 1; other < ids.length; other += 1) {
        addEdge({
          from: conceptNodeId(ids[index]),
          to: conceptNodeId(ids[other]),
          type: "tested-together",
          label: "同题考查",
          directed: false,
          questionIds: [question.id],
        });
      }
    }
  }

  for (const concept of concepts) {
    const text = normalizeText([
      concept.summary,
      concept.detail,
      concept.example,
      ...(concept.traps || []),
    ].join(" "));
    for (const other of concepts) {
      if (concept.id === other.id) continue;
      const otherTitle = normalizeText(other.title);
      if (otherTitle && text.includes(otherTitle)) {
        addEdge({
          from: conceptNodeId(concept.id),
          to: conceptNodeId(other.id),
          type: "confuses-with",
          label: "易混",
          directed: false,
        });
      }
    }
  }

  return { nodes, edges };
}

export function buildMindMapTree(subjects, concepts) {
  const conceptsByChapter = groupBy(concepts, "chapterId");
  return {
    id: "root",
    label: "基金从业资格",
    type: "root",
    children: subjects.map((subject) => ({
      id: subjectNodeId(subject.id),
      label: subject.title,
      type: "subject",
      subjectId: subject.id,
      children: subject.chapters.map((chapter) => ({
        id: chapterNodeId(chapter.id),
        label: chapter.title,
        type: "chapter",
        subjectId: subject.id,
        chapterId: chapter.id,
        children: (conceptsByChapter[chapter.id] || []).map((concept) => ({
          id: conceptNodeId(concept.id),
          label: concept.title,
          type: "concept",
          subjectId: concept.subjectId,
          chapterId: concept.chapterId,
          conceptId: concept.id,
        })),
      })),
    })),
  };
}

export function getConceptNeighborhood(graph, conceptId, options = {}) {
  const depth = options.depth ?? 1;
  const centerId = conceptId.startsWith("concept:") ? conceptId : conceptNodeId(conceptId);
  const adjacency = buildAdjacency(graph.edges);
  const visited = new Set([centerId]);
  let frontier = new Set([centerId]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set();
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    frontier = next;
  }

  const nodes = graph.nodes.filter((node) => visited.has(node.id));
  const edges = graph.edges.filter((edge) => visited.has(edge.from) && visited.has(edge.to));
  return { nodes, edges, centerId };
}

export function subjectNodeId(id) {
  return `subject:${id}`;
}

export function chapterNodeId(id) {
  return `chapter:${id}`;
}

export function conceptNodeId(id) {
  return `concept:${id}`;
}

function countQuestionsByConcept(questions) {
  const counts = {};
  for (const question of questions) {
    for (const conceptId of question.conceptIds || []) {
      counts[conceptId] = (counts[conceptId] || 0) + 1;
    }
  }
  return counts;
}

function buildAdjacency(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    addAdjacent(adjacency, edge.from, edge.to);
    addAdjacent(adjacency, edge.to, edge.from);
  }
  return adjacency;
}

function addAdjacent(adjacency, from, to) {
  if (!adjacency.has(from)) adjacency.set(from, new Set());
  adjacency.get(from).add(to);
}

function edgeKeyUndirected(type, from, to) {
  return `${type}:${[from, to].sort().join("<->")}`;
}

function groupBy(values, key) {
  return values.reduce((groups, value) => {
    const groupKey = value[key];
    groups[groupKey] = groups[groupKey] || [];
    groups[groupKey].push(value);
    return groups;
  }, {});
}
