import { cramPlan, concepts, examMeta, questions, subjects } from "./data.mjs";
import { buildKnowledgeGraph, buildMindMapTree, getConceptNeighborhood } from "./graph-engine.mjs";
import { importExample, postExamSummary } from "./post-exam-sources.mjs";
import { buildPracticeSet, explainQuestion, gradeSession, searchConcepts } from "./quiz-engine.mjs";

const app = document.querySelector("#app");
const storageKey = "fund-qualification-cram-v1";
const letters = ["A", "B", "C", "D"];

const state = {
  view: "framework",
  subjectId: "s1",
  chapterId: "all",
  mode: "chapter",
  count: 30,
  activeSet: [],
  currentIndex: 0,
  answers: {},
  chat: {},
  assistantQuery: "",
  assistantReply: "",
  graphConceptId: "financial-market",
  graphDepth: 1,
  progress: loadProgress(),
};

render();

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], [data-view], [data-subject], [data-chapter], [data-answer]");
  if (!target) return;

  if (target.dataset.view) {
    state.view = target.dataset.view;
    state.activeSet = state.view === "practice" || state.view === "mock" ? state.activeSet : [];
    render();
    return;
  }

  if (target.dataset.subject) {
    state.subjectId = target.dataset.subject;
    state.chapterId = "all";
    render();
    return;
  }

  if (target.dataset.chapter) {
    state.chapterId = target.dataset.chapter;
    render();
    return;
  }

  if (target.dataset.answer) {
    recordAnswer(Number(target.dataset.answer));
    render();
    return;
  }

  handleAction(target.dataset.action, target);
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-control='subject']")) {
    state.subjectId = event.target.value;
    state.chapterId = "all";
    render();
  }

  if (event.target.matches("[data-control='chapter']")) {
    state.chapterId = event.target.value;
    render();
  }

  if (event.target.matches("[data-control='mode']")) {
    state.mode = event.target.value;
  }

  if (event.target.matches("[data-control='count']")) {
    state.count = Number(event.target.value);
  }

  if (event.target.matches("[data-control='import']")) {
    importQuestions(event.target.files?.[0]);
  }
});

document.addEventListener("submit", (event) => {
  event.preventDefault();

  if (event.target.matches("[data-form='question-chat']")) {
    const input = event.target.querySelector("input");
    askCurrentQuestion(input.value.trim());
    input.value = "";
    render();
  }

  if (event.target.matches("[data-form='assistant']")) {
    const input = event.target.querySelector("input");
    state.assistantQuery = input.value.trim();
    state.assistantReply = buildGlobalReply(state.assistantQuery);
    render();
  }
});

function render() {
  const selectedSubject = getSubject(state.subjectId);
  app.innerHTML = `
    ${renderHeader()}
    <main class="shell">
      ${renderSubjectRail(selectedSubject)}
      <section class="workspace">
        ${renderCurrentView(selectedSubject)}
      </section>
    </main>
  `;
}

function renderHeader() {
  const total = getAllQuestions().length;
  const wrongCount = state.progress.wrongQuestionIds.length;
  const bookmarkCount = state.progress.bookmarks.length;
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">2026-05-23 全国统考冲刺</p>
        <h1>${examMeta.title}</h1>
        <p class="notice">${examMeta.notice}</p>
      </div>
      <div class="stats" aria-label="学习数据">
        <span><strong>${total}</strong>题</span>
        <span><strong>${concepts.length}</strong>卡</span>
        <span><strong>${wrongCount}</strong>错题</span>
        <span><strong>${bookmarkCount}</strong>收藏</span>
      </div>
      <nav class="tabs" aria-label="主功能">
        ${tab("framework", "知识框架")}
        ${tab("map", "图谱")}
        ${tab("practice", "刷题")}
        ${tab("estimate", "估分")}
        ${tab("mock", "模拟")}
        ${tab("wrong", "错题")}
        ${tab("assistant", "追问")}
      </nav>
    </header>
  `;
}

function tab(id, label) {
  return `<button class="tab ${state.view === id ? "active" : ""}" type="button" data-view="${id}">${label}</button>`;
}

function renderSubjectRail(selectedSubject) {
  return `
    <aside class="rail">
      <div class="rail-block">
        <h2>科目</h2>
        <div class="subject-list">
          ${subjects
            .map(
              (subject) => `
                <button class="subject-button ${subject.id === state.subjectId ? "active" : ""}" type="button" data-subject="${subject.id}">
                  <span>${subject.shortTitle}</span>
                  <strong>${subject.title}</strong>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="rail-block">
        <h2>章节</h2>
        <button class="chapter-button ${state.chapterId === "all" ? "active" : ""}" type="button" data-chapter="all">全部章节</button>
        ${selectedSubject.chapters
          .map(
            (chapter) => `
              <button class="chapter-button ${chapter.id === state.chapterId ? "active" : ""}" type="button" data-chapter="${chapter.id}">
                ${chapter.title}
              </button>
            `,
          )
          .join("")}
      </div>
    </aside>
  `;
}

function renderCurrentView(selectedSubject) {
  if (state.view === "map") return renderMap(selectedSubject);
  if (state.view === "practice") return renderPractice(selectedSubject);
  if (state.view === "estimate") return renderEstimate();
  if (state.view === "mock") return renderMock(selectedSubject);
  if (state.view === "wrong") return renderWrongBook();
  if (state.view === "assistant") return renderAssistant();
  return renderFramework(selectedSubject);
}

function renderFramework(selectedSubject) {
  const subjectConcepts = filterConcepts();
  const chapterMap = groupBy(subjectConcepts, "chapterId");
  return `
    <div class="view-head">
      <div>
        <p class="eyebrow">${selectedSubject.shortTitle}</p>
        <h2>${selectedSubject.title}</h2>
        <p>${selectedSubject.target}</p>
      </div>
      <button class="primary" type="button" data-action="start-practice">开始本章节练习</button>
    </div>
    <section class="rule-strip">
      ${examMeta.rules.map((rule) => `<span>${rule}</span>`).join("")}
    </section>
    <section class="cram-grid">
      ${cramPlan
        .map(
          (step) => `
            <article class="study-step">
              <h3>${step.title}</h3>
              <p>${step.detail}</p>
            </article>
          `,
        )
        .join("")}
    </section>
    <section class="knowledge-map">
      ${selectedSubject.chapters
        .filter((chapter) => state.chapterId === "all" || chapter.id === state.chapterId)
        .map((chapter) => {
          const chapterConcepts = chapterMap[chapter.id] || [];
          return `
            <article class="chapter-section">
              <div class="chapter-title">
                <h3>${chapter.title}</h3>
                <p>${chapter.focus}</p>
              </div>
              <div class="concept-grid">
                ${chapterConcepts.map(renderConceptCard).join("")}
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderConceptCard(concept) {
  const weak = state.progress.weakConcepts[concept.id] || 0;
  return `
    <article class="concept-card">
      <div class="concept-title">
        <h4>${concept.title}</h4>
        ${weak ? `<span class="pill danger">错 ${weak}</span>` : `<span class="pill">核心</span>`}
      </div>
      <p>${concept.summary}</p>
      <div class="concept-actions">
        <button class="link-button" type="button" data-action="open-map" data-concept="${concept.id}">图谱</button>
        <button class="link-button" type="button" data-action="ask-concept" data-concept="${concept.id}">追问</button>
        <button class="link-button" type="button" data-action="drill-concept" data-concept="${concept.id}">刷这个点</button>
      </div>
    </article>
  `;
}

function renderMap(selectedSubject) {
  ensureGraphConceptInSubject();
  const graph = getGraph();
  const selectedConcept = getConcept(state.graphConceptId) || concepts[0];
  const neighborhood = getConceptNeighborhood(graph, selectedConcept.id, { depth: state.graphDepth });
  const mindMap = buildMindMapTree(subjects, concepts);

  return `
    <div class="view-head">
      <div>
        <p class="eyebrow">脑图 + 图谱</p>
        <h2>${selectedSubject.title}</h2>
        <p>顶层用脑图看章节，局部用图谱看先修、易混、同题考查和错题弱点。</p>
      </div>
      <div class="actions">
        <button type="button" class="${state.graphDepth === 1 ? "active-mark" : ""}" data-action="set-graph-depth" data-depth="1">1 跳</button>
        <button type="button" class="${state.graphDepth === 2 ? "active-mark" : ""}" data-action="set-graph-depth" data-depth="2">2 跳</button>
        <button class="primary" type="button" data-action="drill-concept" data-concept="${selectedConcept.id}">刷中心点</button>
      </div>
    </div>
    <section class="map-layout">
      <div class="map-main">
        ${renderMindMap(mindMap)}
        ${renderConceptGraph(neighborhood)}
        ${renderWeakHeatmap(selectedSubject)}
      </div>
      <aside class="graph-detail">
        ${renderGraphDetail(selectedConcept, neighborhood)}
      </aside>
    </section>
  `;
}

function renderMindMap(tree) {
  const currentSubject = tree.children.find((subject) => subject.subjectId === state.subjectId) || tree.children[0];
  return `
    <section class="mindmap-panel">
      <div class="panel-title">
        <h3>顶层脑图</h3>
        <span>${currentSubject.children.length} 章</span>
      </div>
      <div class="mindmap-tree">
        <button class="mind-node subject-node" type="button" data-subject="${currentSubject.subjectId}">${currentSubject.label}</button>
        <div class="mind-branches">
          ${currentSubject.children
            .map(
              (chapter) => `
                <div class="mind-branch">
                  <button class="mind-node chapter-node ${state.chapterId === chapter.chapterId ? "active" : ""}" type="button" data-action="focus-map-chapter" data-chapter="${chapter.chapterId}">
                    ${chapter.label}
                  </button>
                  <div class="mind-leaves">
                    ${chapter.children
                      .map(
                        (concept) => `
                          <button class="mind-leaf ${state.graphConceptId === concept.conceptId ? "active" : ""}" type="button" data-action="focus-graph-concept" data-concept="${concept.conceptId}">
                            ${concept.label}
                          </button>
                        `,
                      )
                      .join("")}
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderConceptGraph(neighborhood) {
  const layout = layoutGraph(neighborhood);
  const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]));
  return `
    <section class="graph-panel">
      <div class="panel-title">
        <h3>局部知识图谱</h3>
        <span>${neighborhood.nodes.length} 节点 · ${neighborhood.edges.length} 关系</span>
      </div>
      <svg class="graph-svg" viewBox="0 0 760 500" role="img" aria-label="局部知识图谱">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z"></path>
          </marker>
        </defs>
        ${neighborhood.edges
          .map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return "";
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return `
              <g class="graph-edge ${edge.type}">
                <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" marker-end="${edge.directed === false ? "" : "url(#arrow)"}"></line>
                <text x="${midX}" y="${midY}">${edge.label}</text>
              </g>
            `;
          })
          .join("")}
        ${layout.nodes
          .map((node) => {
            const isCenter = node.id === neighborhood.centerId;
            const conceptAttr = node.type === "concept" ? `data-action="focus-graph-concept" data-concept="${node.conceptId}"` : "";
            return `
              <g class="graph-node ${node.type} ${isCenter ? "center" : ""}" ${conceptAttr} transform="translate(${node.x}, ${node.y})">
                <circle r="${nodeRadius(node)}"></circle>
                <text text-anchor="middle" y="4">${truncateLabel(node.label, isCenter ? 9 : 7)}</text>
              </g>
            `;
          })
          .join("")}
      </svg>
      <div class="legend">
        <span class="legend-item contains">包含</span>
        <span class="legend-item learning-path">学习顺序</span>
        <span class="legend-item tested-together">同题考查</span>
        <span class="legend-item confuses-with">易混</span>
      </div>
    </section>
  `;
}

function renderGraphDetail(concept, neighborhood) {
  const weak = state.progress.weakConcepts[concept.id] || 0;
  const relatedConcepts = neighborhood.nodes.filter((node) => node.type === "concept" && node.conceptId !== concept.id);
  const chapter = getSubject(concept.subjectId).chapters.find((item) => item.id === concept.chapterId);
  return `
    <div class="panel-title">
      <h3>${concept.title}</h3>
      ${weak ? `<span class="pill danger">错 ${weak}</span>` : `<span class="pill">中心点</span>`}
    </div>
    <p>${concept.summary}</p>
    <p>${concept.detail}</p>
    ${concept.formula ? `<div class="formula-box">${concept.formula}</div>` : ""}
    <div class="detail-meta">
      <span>${getSubject(concept.subjectId).shortTitle}</span>
      <span>${chapter?.title || "综合"}</span>
      <span>${getAllQuestions().filter((question) => question.conceptIds.includes(concept.id)).length} 题</span>
    </div>
    <div class="detail-actions">
      <button class="primary" type="button" data-action="drill-concept" data-concept="${concept.id}">专项刷题</button>
      <button type="button" data-action="ask-concept" data-concept="${concept.id}">追问概念</button>
    </div>
    <h4>易错边界</h4>
    <ul class="trap-list">
      ${(concept.traps || []).slice(0, 3).map((trap) => `<li>${trap}</li>`).join("")}
    </ul>
    <h4>相邻概念</h4>
    <div class="related-list">
      ${
        relatedConcepts.length
          ? relatedConcepts
              .slice(0, 10)
              .map((node) => `<button type="button" data-action="focus-graph-concept" data-concept="${node.conceptId}">${node.label}</button>`)
              .join("")
          : `<span class="empty-inline">暂无直接相邻概念</span>`
      }
    </div>
  `;
}

function renderWeakHeatmap(selectedSubject) {
  const chapterScores = selectedSubject.chapters.map((chapter) => {
    const chapterConcepts = concepts.filter((concept) => concept.chapterId === chapter.id);
    const score = chapterConcepts.reduce((sum, concept) => sum + (state.progress.weakConcepts[concept.id] || 0), 0);
    const hottest = [...chapterConcepts].sort((a, b) => (state.progress.weakConcepts[b.id] || 0) - (state.progress.weakConcepts[a.id] || 0))[0];
    return { chapter, score, hottest };
  });
  const max = Math.max(1, ...chapterScores.map((item) => item.score));

  return `
    <section class="heatmap-panel">
      <div class="panel-title">
        <h3>错题热力图</h3>
        <span>${selectedSubject.shortTitle}</span>
      </div>
      <div class="heatmap-grid">
        ${chapterScores
          .map((item) => {
            const level = Math.ceil((item.score / max) * 4);
            return `
              <button class="heat-cell heat-${level}" type="button" data-action="focus-graph-concept" data-concept="${item.hottest?.id || ""}">
                <strong>${item.chapter.title}</strong>
                <span>${item.score} 错</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderPractice(selectedSubject) {
  if (!state.activeSet.length) {
    return `
      <div class="view-head">
        <div>
          <p class="eyebrow">章节练习</p>
          <h2>${selectedSubject.title}</h2>
          <p>按章节、弱点或随机顺序刷题；答题后题解支持追问。</p>
        </div>
      </div>
      ${renderPracticeControls("start-practice")}
      ${renderImportPanel()}
    `;
  }

  return renderQuiz("practice");
}

function renderMock(selectedSubject) {
  if (!state.activeSet.length) {
    return `
      <div class="view-head">
        <div>
          <p class="eyebrow">模拟考试</p>
          <h2>${selectedSubject.title}</h2>
          <p>官方考试每科 100 道单选、120 分钟。本地题库已支持按科目抽 100 题模拟。</p>
        </div>
      </div>
      <section class="mock-actions">
        ${subjects
          .map(
            (subject) => `
              <article class="mock-card">
                <h3>${subject.shortTitle}</h3>
                <p>${subject.title}</p>
                <button class="primary" type="button" data-action="start-mock" data-subject-id="${subject.id}">抽 100 题</button>
              </article>
            `,
          )
          .join("")}
      </section>
    `;
  }

  return renderQuiz("mock");
}

function renderPracticeControls(action) {
  const selectedSubject = getSubject(state.subjectId);
  return `
    <section class="control-panel">
      <label>
        <span>科目</span>
        <select data-control="subject">
          ${subjects.map((subject) => `<option value="${subject.id}" ${subject.id === state.subjectId ? "selected" : ""}>${subject.shortTitle} ${subject.title}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>章节</span>
        <select data-control="chapter">
          <option value="all">全部章节</option>
          ${selectedSubject.chapters.map((chapter) => `<option value="${chapter.id}" ${chapter.id === state.chapterId ? "selected" : ""}>${chapter.title}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>模式</span>
        <select data-control="mode">
          <option value="chapter" ${state.mode === "chapter" ? "selected" : ""}>章节顺序</option>
          <option value="weak" ${state.mode === "weak" ? "selected" : ""}>错题弱点优先</option>
          <option value="mock" ${state.mode === "mock" ? "selected" : ""}>随机混排</option>
        </select>
      </label>
      <label>
        <span>题量</span>
        <select data-control="count">
          ${[10, 20, 30, 50, 100].map((count) => `<option value="${count}" ${count === state.count ? "selected" : ""}>${count} 题</option>`).join("")}
        </select>
      </label>
      <button class="primary" type="button" data-action="${action}">开始</button>
    </section>
  `;
}

function renderImportPanel() {
  return `
    <section class="import-panel">
      <div>
        <h3>扩展题库</h3>
        <p>可导入合规来源的 JSON 题目。字段：id、subjectId、chapterId、stem、options、answer、explanation、conceptIds。</p>
      </div>
      <label class="file-button">
        导入 JSON
        <input data-control="import" type="file" accept="application/json,.json" />
      </label>
    </section>
  `;
}

function renderEstimate() {
  return `
    <div class="view-head">
      <div>
        <p class="eyebrow">考后估分来源</p>
        <h2>已核验入口与导入方案</h2>
        <p>最后核验：${postExamSummary.checkedAt}。登录题库只保留链接和题量，不抓取账号态内容。</p>
      </div>
      <button class="primary" type="button" data-action="go-practice-import">导入题目</button>
    </div>
    <section class="source-warning">
      <strong>边界</strong>
      <p>${escapeHtml(postExamSummary.officialNotice)}</p>
    </section>
    <section class="coverage-grid">
      ${postExamSummary.subjectCoverage
        .map(
          (item) => `
            <article class="coverage-card">
              <span class="pill">${item.label}</span>
              <h3>${escapeHtml(getSubject(item.subjectId).title)}</h3>
              <p>${escapeHtml(item.status)}</p>
              <p>${escapeHtml(item.action)}</p>
            </article>
          `,
        )
        .join("")}
    </section>
    <section class="source-list">
      ${postExamSummary.sources
        .map(
          (source) => `
            <article class="source-card">
              <div>
                <span class="pill">${escapeHtml(source.type)}</span>
                <h3>${escapeHtml(source.name)}</h3>
                <p>${escapeHtml(source.coverage)}</p>
                <p class="source-status">${escapeHtml(source.status)}</p>
                <p>${escapeHtml(source.notes)}</p>
              </div>
              <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">打开</a>
            </article>
          `,
        )
        .join("")}
    </section>
    <section class="import-panel estimate-import">
      <div>
        <h3>导入格式</h3>
        <p>把你自己能合法打开的估分题按这个 JSON 数组格式保存后导入，后续就能用本工具的题解追问。</p>
      </div>
      <pre>${escapeHtml(JSON.stringify(importExample, null, 2))}</pre>
      <label class="file-button">
        导入 JSON
        <input data-control="import" type="file" accept="application/json,.json" />
      </label>
    </section>
  `;
}

function renderQuiz(kind) {
  const question = state.activeSet[state.currentIndex];
  const selectedAnswer = state.answers[question.id];
  const answered = selectedAnswer !== undefined;
  const result = gradeSession(state.activeSet.filter((item) => state.answers[item.id] !== undefined), state.answers);
  const subject = getSubject(question.subjectId);
  const chapter = subject.chapters.find((item) => item.id === question.chapterId);
  const progress = Math.round(((state.currentIndex + 1) / state.activeSet.length) * 100);

  return `
    <div class="quiz-layout">
      <section class="question-panel">
        <div class="quiz-meta">
          <span>${subject.shortTitle}</span>
          <span>${chapter?.title || "综合"}</span>
          <span>${state.currentIndex + 1}/${state.activeSet.length}</span>
          <span>已答 ${result.total}，正确 ${result.correct}</span>
        </div>
        <div class="progress-bar"><span style="width:${progress}%"></span></div>
        <h2>${escapeHtml(question.stem)}</h2>
        <div class="options">
          ${question.options
            .map((option, index) => {
              const status = answered ? (index === question.answer ? "correct" : index === selectedAnswer ? "wrong" : "muted") : "";
              return `
                <button class="option ${status}" type="button" data-answer="${index}" ${answered ? "disabled" : ""}>
                  <span>${letters[index]}</span>
                  <strong>${escapeHtml(option)}</strong>
                </button>
              `;
            })
            .join("")}
        </div>
        ${answered ? renderExplanation(question, selectedAnswer) : ""}
        <div class="quiz-nav">
          <button type="button" data-action="previous-question" ${state.currentIndex === 0 ? "disabled" : ""}>上一题</button>
          <button type="button" data-action="toggle-bookmark" class="${state.progress.bookmarks.includes(question.id) ? "active-mark" : ""}">收藏</button>
          <button type="button" data-action="next-question">${state.currentIndex === state.activeSet.length - 1 ? "交卷" : "下一题"}</button>
          <button type="button" data-action="stop-session">退出</button>
        </div>
      </section>
      <aside class="tutor-panel">
        ${renderQuestionTutor(question)}
      </aside>
    </div>
    ${kind === "mock" ? `<p class="small-note">当前为本地模拟，正式考试请以准考证与机考系统为准。</p>` : ""}
  `;
}

function renderExplanation(question, selectedAnswer) {
  const correct = selectedAnswer === question.answer;
  const related = concepts.filter((concept) => question.conceptIds.includes(concept.id));
  return `
    <section class="explanation ${correct ? "ok" : "bad"}">
      <div class="answer-line">
        <strong>${correct ? "答对" : "答错"}</strong>
        <span>正确答案：${letters[question.answer]}</span>
        <span>你的答案：${letters[selectedAnswer]}</span>
      </div>
      <p>${escapeHtml(question.explanation)}</p>
      <div class="chips">
        ${related
          .map((concept) => `<button type="button" data-action="ask-concept" data-concept="${concept.id}">${concept.title}</button>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderQuestionTutor(question) {
  const messages = state.chat[question.id] || [];
  const related = concepts.filter((concept) => question.conceptIds.includes(concept.id));
  return `
    <h3>题解追问</h3>
    <div class="chips">
      ${related.map((concept) => `<button type="button" data-action="ask-concept" data-concept="${concept.id}">${concept.title}</button>`).join("")}
      <button type="button" data-action="ask-option" data-option="A">A 为什么</button>
      <button type="button" data-action="ask-option" data-option="${letters[question.answer]}">正确项</button>
    </div>
    <div class="chat-log">
      ${
        messages.length
          ? messages.map((message) => `<div class="chat ${message.role}">${escapeHtml(message.text).replaceAll("\n", "<br>")}</div>`).join("")
          : `<div class="empty">暂无追问。</div>`
      }
    </div>
    <form class="chat-form" data-form="question-chat">
      <input name="question" autocomplete="off" placeholder="追问题解或概念" />
      <button class="primary" type="submit">发送</button>
    </form>
  `;
}

function renderWrongBook() {
  const allQuestions = getAllQuestions();
  const wrongQuestions = state.progress.wrongQuestionIds.map((id) => allQuestions.find((question) => question.id === id)).filter(Boolean);
  const bookmarked = state.progress.bookmarks.map((id) => allQuestions.find((question) => question.id === id)).filter(Boolean);
  const weak = Object.entries(state.progress.weakConcepts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, count]) => ({ concept: concepts.find((item) => item.id === id), count }))
    .filter((item) => item.concept);

  return `
    <div class="view-head">
      <div>
        <p class="eyebrow">错题与弱点</p>
        <h2>只看会丢分的地方</h2>
        <p>错题会自动沉淀到弱概念，弱点练习会优先抽这些知识点。</p>
      </div>
      <div class="actions">
        <button class="primary" type="button" data-action="redo-wrong">重做错题</button>
        <button type="button" data-action="clear-progress">清空记录</button>
      </div>
    </div>
    <section class="weak-grid">
      ${weak.length ? weak.map((item) => renderWeakConcept(item.concept, item.count)).join("") : `<div class="empty wide">还没有错题记录。</div>`}
    </section>
    <section class="question-list">
      <h3>错题</h3>
      ${wrongQuestions.length ? wrongQuestions.map(renderQuestionRow).join("") : `<div class="empty">暂无错题。</div>`}
      <h3>收藏</h3>
      ${bookmarked.length ? bookmarked.map(renderQuestionRow).join("") : `<div class="empty">暂无收藏。</div>`}
    </section>
  `;
}

function renderWeakConcept(concept, count) {
  return `
    <article class="weak-card">
      <span class="pill danger">${count} 次</span>
      <h3>${concept.title}</h3>
      <p>${concept.summary}</p>
      <button class="link-button" type="button" data-action="open-map" data-concept="${concept.id}">看图谱</button>
      <button class="link-button" type="button" data-action="drill-concept" data-concept="${concept.id}">专项刷题</button>
    </article>
  `;
}

function renderQuestionRow(question) {
  return `
    <article class="question-row">
      <div>
        <span class="pill">${getSubject(question.subjectId).shortTitle}</span>
        <h4>${escapeHtml(question.stem)}</h4>
        <p>正确答案：${letters[question.answer]} · ${escapeHtml(question.explanation)}</p>
      </div>
      <button type="button" data-action="single-question" data-question="${question.id}">重做</button>
    </article>
  `;
}

function renderAssistant() {
  const matches = state.assistantQuery ? searchConcepts(concepts, state.assistantQuery, { limit: 8 }) : [];
  return `
    <div class="view-head">
      <div>
        <p class="eyebrow">可对话题解</p>
        <h2>问概念、问公式、问为什么错</h2>
        <p>这里用本地知识卡检索回答；不会上传你的答题记录。</p>
      </div>
    </div>
    <form class="assistant-form" data-form="assistant">
      <input value="${escapeHtml(state.assistantQuery)}" name="ask" autocomplete="off" placeholder="例如：久期是什么？为什么登记备案不等于背书？" />
      <button class="primary" type="submit">追问</button>
    </form>
    ${state.assistantReply ? `<section class="assistant-answer">${escapeHtml(state.assistantReply).replaceAll("\n", "<br>")}</section>` : ""}
    <section class="concept-grid">
      ${
        matches.length
          ? matches.map(renderConceptCard).join("")
          : concepts
              .filter((concept) => concept.subjectId === state.subjectId)
              .slice(0, 12)
              .map(renderConceptCard)
              .join("")
      }
    </section>
  `;
}

function handleAction(action, target) {
  if (action === "start-practice") startPractice();
  if (action === "start-mock") startMock(target.dataset.subjectId);
  if (action === "previous-question") previousQuestion();
  if (action === "next-question") nextQuestion();
  if (action === "stop-session") stopSession();
  if (action === "toggle-bookmark") toggleBookmark();
  if (action === "clear-progress") clearProgress();
  if (action === "redo-wrong") redoWrong();
  if (action === "single-question") startSingleQuestion(target.dataset.question);
  if (action === "go-practice-import") openPracticeImport();
  if (action === "ask-concept") askConcept(target.dataset.concept);
  if (action === "drill-concept") drillConcept(target.dataset.concept);
  if (action === "ask-option") askCurrentQuestion(`${target.dataset.option} 为什么`);
  if (action === "open-map") openMap(target.dataset.concept);
  if (action === "focus-graph-concept") focusGraphConcept(target.dataset.concept);
  if (action === "focus-map-chapter") focusMapChapter(target.dataset.chapter);
  if (action === "set-graph-depth") state.graphDepth = Number(target.dataset.depth) || 1;
  render();
}

function openPracticeImport() {
  state.view = "practice";
  state.activeSet = [];
}

function startPractice() {
  const weakConcepts = state.mode === "weak" ? Object.keys(state.progress.weakConcepts) : [];
  state.activeSet = buildPracticeSet(getAllQuestions(), {
    subjectId: state.subjectId,
    chapterId: state.chapterId,
    count: state.count,
    weakConcepts,
    mode: state.mode,
  });
  resetSession();
  state.view = "practice";
}

function startMock(subjectId = state.subjectId) {
  state.subjectId = subjectId;
  state.chapterId = "all";
  state.activeSet = buildPracticeSet(getAllQuestions(), {
    subjectId,
    chapterId: "all",
    count: 100,
    weakConcepts: [],
    mode: "mock",
  });
  resetSession();
  state.view = "mock";
}

function resetSession() {
  state.currentIndex = 0;
  state.answers = {};
  state.chat = {};
}

function recordAnswer(answerIndex) {
  const question = state.activeSet[state.currentIndex];
  if (!question || state.answers[question.id] !== undefined) return;

  state.answers[question.id] = answerIndex;
  if (answerIndex !== question.answer) {
    state.progress.wrongQuestionIds = unique([question.id, ...state.progress.wrongQuestionIds]).slice(0, 300);
    for (const conceptId of question.conceptIds) {
      state.progress.weakConcepts[conceptId] = (state.progress.weakConcepts[conceptId] || 0) + 1;
    }
  }
  saveProgress();
}

function nextQuestion() {
  if (state.currentIndex < state.activeSet.length - 1) {
    state.currentIndex += 1;
    return;
  }

  const result = gradeSession(state.activeSet, state.answers);
  state.progress.sessions = [
    {
      subjectId: state.subjectId,
      date: new Date().toISOString(),
      correct: result.correct,
      total: result.total,
      percent: result.percent,
    },
    ...state.progress.sessions,
  ].slice(0, 20);
  saveProgress();
  alert(`本次得分 ${result.percent} 分：${result.correct}/${result.total}`);
}

function previousQuestion() {
  state.currentIndex = Math.max(0, state.currentIndex - 1);
}

function stopSession() {
  state.activeSet = [];
  state.answers = {};
  state.chat = {};
}

function toggleBookmark() {
  const question = state.activeSet[state.currentIndex];
  if (!question) return;
  state.progress.bookmarks = state.progress.bookmarks.includes(question.id)
    ? state.progress.bookmarks.filter((id) => id !== question.id)
    : [question.id, ...state.progress.bookmarks];
  saveProgress();
}

function redoWrong() {
  const allQuestions = getAllQuestions();
  state.activeSet = state.progress.wrongQuestionIds.map((id) => allQuestions.find((question) => question.id === id)).filter(Boolean);
  if (!state.activeSet.length) return;
  resetSession();
  state.view = "practice";
}

function startSingleQuestion(questionId) {
  const question = getAllQuestions().find((item) => item.id === questionId);
  if (!question) return;
  state.activeSet = [question];
  resetSession();
  state.view = "practice";
}

function drillConcept(conceptId) {
  const concept = getConcept(conceptId);
  if (concept) {
    state.subjectId = concept.subjectId;
    state.chapterId = concept.chapterId;
    state.graphConceptId = concept.id;
  }
  state.activeSet = getAllQuestions().filter((question) => question.conceptIds.includes(conceptId)).slice(0, 20);
  resetSession();
  state.view = "practice";
}

function openMap(conceptId) {
  focusGraphConcept(conceptId);
  state.view = "map";
}

function focusGraphConcept(conceptId) {
  const concept = getConcept(conceptId);
  if (!concept) return;
  state.graphConceptId = concept.id;
  state.subjectId = concept.subjectId;
  state.chapterId = concept.chapterId;
}

function focusMapChapter(chapterId) {
  const chapterConcept = concepts.find((concept) => concept.chapterId === chapterId);
  if (!chapterConcept) return;
  state.chapterId = chapterId;
  state.graphConceptId = chapterConcept.id;
}

function clearProgress() {
  if (!confirm("确认清空错题、收藏和模拟记录？")) return;
  state.progress = defaultProgress();
  saveProgress();
}

function askCurrentQuestion(message) {
  const question = state.activeSet[state.currentIndex];
  if (!question || !message) return;

  const optionReply = buildOptionReply(question, message);
  const reply = explainQuestion(question, concepts, message);
  const text = [optionReply, reply.answer].filter(Boolean).join("\n\n");
  state.chat[question.id] = [...(state.chat[question.id] || []), { role: "user", text: message }, { role: "assistant", text }];
}

function askConcept(conceptId) {
  const concept = concepts.find((item) => item.id === conceptId);
  if (!concept) return;

  if (state.activeSet.length) {
    const question = state.activeSet[state.currentIndex];
    const text = `${concept.title}\n\n${concept.summary}\n\n${concept.detail}${concept.formula ? `\n\n公式：${concept.formula}` : ""}\n\n易错：${concept.traps?.[0] || "注意相邻概念边界。"}`;
    state.chat[question.id] = [...(state.chat[question.id] || []), { role: "user", text: `解释 ${concept.title}` }, { role: "assistant", text }];
    return;
  }

  state.view = "assistant";
  state.assistantQuery = concept.title;
  state.assistantReply = buildGlobalReply(concept.title);
}

function buildOptionReply(question, message) {
  const optionIndex = parseOptionIndex(message);
  if (optionIndex === null) return "";

  const option = question.options[optionIndex];
  const correct = optionIndex === question.answer;
  return `${letters[optionIndex]} 选项：${option}\n\n判断：${correct ? "这是正确项。" : `这是干扰项，正确项是 ${letters[question.answer]}。`} ${correct ? "它贴合题干关键词。" : "它通常混淆了定义边界或把禁止性表述说成允许。"}`;
}

function parseOptionIndex(message) {
  const match = String(message).toUpperCase().match(/[ABCD]/);
  return match ? letters.indexOf(match[0]) : null;
}

function buildGlobalReply(query) {
  if (!query) return "";
  const matches = searchConcepts(concepts, query, { limit: 4 });
  if (!matches.length) return "暂时没有在本地知识卡中匹配到。换一个关键词，比如“久期”“合格投资者”“信息披露”。";
  return matches
    .map((concept, index) => {
      return `${index + 1}. ${concept.title}\n${concept.summary}\n${concept.detail}${concept.formula ? `\n公式：${concept.formula}` : ""}\n易错：${concept.traps?.[0] || "注意相邻概念边界。"}`;
    })
    .join("\n\n");
}

function importQuestions(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("JSON 根节点必须是数组");
      const valid = imported.filter(isValidQuestion);
      state.progress.importedQuestions = uniqueQuestions([...valid, ...state.progress.importedQuestions]);
      saveProgress();
      alert(`已导入 ${valid.length} 道题。`);
      render();
    } catch (error) {
      alert(`导入失败：${error.message}`);
    }
  };
  reader.readAsText(file);
}

function isValidQuestion(question) {
  return (
    question &&
    typeof question.id === "string" &&
    typeof question.stem === "string" &&
    Array.isArray(question.options) &&
    question.options.length === 4 &&
    Number.isInteger(question.answer) &&
    question.answer >= 0 &&
    question.answer < 4 &&
    typeof question.subjectId === "string" &&
    typeof question.chapterId === "string"
  );
}

function getAllQuestions() {
  return uniqueQuestions([...questions, ...state.progress.importedQuestions]);
}

function getGraph() {
  return buildKnowledgeGraph(subjects, concepts, getAllQuestions());
}

function getConcept(conceptId) {
  return concepts.find((concept) => concept.id === conceptId);
}

function ensureGraphConceptInSubject() {
  const concept = getConcept(state.graphConceptId);
  if (concept?.subjectId === state.subjectId) return;
  const first = concepts.find((item) => item.subjectId === state.subjectId);
  if (first) {
    state.graphConceptId = first.id;
    state.chapterId = first.chapterId;
  }
}

function filterConcepts() {
  return concepts.filter((concept) => {
    const subjectMatch = concept.subjectId === state.subjectId;
    const chapterMatch = state.chapterId === "all" || concept.chapterId === state.chapterId;
    return subjectMatch && chapterMatch;
  });
}

function getSubject(subjectId) {
  return subjects.find((subject) => subject.id === subjectId) || subjects[0];
}

function layoutGraph(neighborhood) {
  const center = neighborhood.nodes.find((node) => node.id === neighborhood.centerId) || neighborhood.nodes[0];
  const otherNodes = neighborhood.nodes
    .filter((node) => node.id !== center?.id)
    .sort((a, b) => nodeSortScore(a) - nodeSortScore(b) || a.label.localeCompare(b.label, "zh-Hans-CN"));
  const width = 760;
  const height = 500;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = otherNodes.length > 14 ? 205 : 178;
  const nodes = [];

  if (center) {
    nodes.push({ ...center, x: centerX, y: centerY });
  }

  otherNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, otherNodes.length)) * Math.PI * 2;
    const ring = index % 3 === 0 && otherNodes.length > 10 ? radius + 34 : radius;
    nodes.push({
      ...node,
      x: Math.round(centerX + Math.cos(angle) * ring),
      y: Math.round(centerY + Math.sin(angle) * ring),
    });
  });

  return { nodes };
}

function nodeSortScore(node) {
  if (node.type === "chapter") return 1;
  if (node.type === "subject") return 2;
  return 3;
}

function nodeRadius(node) {
  if (node.type === "subject") return 42;
  if (node.type === "chapter") return 38;
  return node.id === `concept:${state.graphConceptId}` ? 52 : 44;
}

function truncateLabel(label, size) {
  return label.length > size ? `${label.slice(0, size)}…` : label;
}

function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey));
    return { ...defaultProgress(), ...parsed };
  } catch {
    return defaultProgress();
  }
}

function defaultProgress() {
  return {
    wrongQuestionIds: [],
    bookmarks: [],
    weakConcepts: {},
    sessions: [],
    importedQuestions: [],
  };
}

function saveProgress() {
  localStorage.setItem(storageKey, JSON.stringify(state.progress));
}

function groupBy(values, key) {
  return values.reduce((groups, item) => {
    const groupKey = item[key];
    groups[groupKey] = groups[groupKey] || [];
    groups[groupKey].push(item);
    return groups;
  }, {});
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueQuestions(values) {
  const seen = new Set();
  return values.filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
