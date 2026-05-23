import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concepts, questions, subjects } from "../src/data.mjs";

describe("study data", () => {
  it("provides a broad original practice bank", () => {
    assert.ok(questions.length >= 200);
    assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  });

  it("keeps question answers and concept references valid", () => {
    const subjectIds = new Set(subjects.map((subject) => subject.id));
    const chapterIds = new Set(subjects.flatMap((subject) => subject.chapters.map((chapter) => chapter.id)));
    const conceptIds = new Set(concepts.map((concept) => concept.id));

    for (const question of questions) {
      assert.ok(subjectIds.has(question.subjectId), question.id);
      assert.ok(chapterIds.has(question.chapterId), question.id);
      assert.equal(question.options.length, 4, question.id);
      assert.ok(question.answer >= 0 && question.answer < question.options.length, question.id);
      assert.ok(question.conceptIds.every((id) => conceptIds.has(id)), question.id);
    }
  });
});
