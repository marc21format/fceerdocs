import { state } from './state.js';
import { defaultState } from './config.js';
import { clamp, clampNonNegativeInteger } from './utils.js';
import { uiState } from './ui-state.js';

export function getSelectionInfo() {
  const selection = String(state.ui.selected || "");
  const columnMatch = selection.match(/^column:(\d+):(\d+)$/);
  if (columnMatch) {
    return {
      kind: "column",
      pageIndex: Number(columnMatch[1]),
      columnIndex: Number(columnMatch[2]),
      questionId: null,
      choiceIndex: null
    };
  }
  const choiceMatch = selection.match(/^choice:(.+):(\d+)$/);
  if (choiceMatch) {
    return {
      kind: "choice",
      questionId: choiceMatch[1],
      choiceIndex: Number(choiceMatch[2]),
      pageIndex: null,
      columnIndex: null
    };
  }
  const questionMatch = selection.match(/^(question|question-box|image):(.+)$/);
  if (questionMatch) {
    return {
      kind: questionMatch[1],
      questionId: questionMatch[2],
      choiceIndex: null,
      pageIndex: null,
      columnIndex: null
    };
  }
  return null;
}

export function getSelectedColumnRef() {
  const selection = getSelectionInfo();
  if (!selection || !uiState.currentPagination?.pages) return null;
  if (selection.kind === "column") {
    return {
      pageIndex: selection.pageIndex,
      columnIndex: selection.columnIndex
    };
  }
  const questionId = selection.questionId;
  if (!questionId) return null;
  for (const [pageIndex, page] of uiState.currentPagination.pages.entries()) {
    for (const [columnIndex, columnQuestions] of page.columns.entries()) {
      if (columnQuestions.some((question) => String(question.id) === String(questionId))) {
        return { pageIndex, columnIndex };
      }
    }
  }
  return null;
}

export function getColumnGapKey(pageIndex, columnIndex) {
  return `p${pageIndex + 1}-c${columnIndex + 1}`;
}

export function getQuestionGapForColumn(pageIndex, columnIndex) {
  const key = getColumnGapKey(pageIndex, columnIndex);
  const override = state.pageLayout.columnQuestionGaps?.[key];
  return Number.isFinite(Number(override)) ? Number(override) : state.pageLayout.questionGap;
}

export function getSelectedQuestionGapValue() {
  const ref = getSelectedColumnRef();
  if (!ref) return state.pageLayout.questionGap;
  return getQuestionGapForColumn(ref.pageIndex, ref.columnIndex);
}

export function setQuestionGapForSelection(value) {
  const gap = clampNonNegativeInteger(value, defaultState.pageLayout.questionGap);
  const ref = getSelectedColumnRef();
  if (!ref) {
    state.pageLayout.questionGap = gap;
    return { scope: "global", gap };
  }
  const key = getColumnGapKey(ref.pageIndex, ref.columnIndex);
  if (gap === state.pageLayout.questionGap) {
    delete state.pageLayout.columnQuestionGaps[key];
  } else {
    state.pageLayout.columnQuestionGaps[key] = gap;
  }
  return { scope: "column", gap, key };
}

export function getQuestionGapScopeText() {
  const ref = getSelectedColumnRef();
  if (!ref) return "Applies to all pages and columns.";
  return `Applies to page ${ref.pageIndex + 1}, column ${ref.columnIndex + 1} only.`;
}

export function detectChoiceColumns(question, width) {
  if (question.choiceLayout === "1") return 1;
  if (question.choiceLayout === "2") return width < 235 ? 1 : 2;
  if (question.choiceLayout === "4") return width < 400 ? 2 : 4;
  const longest = Math.max(...question.choices.map((choice) => choice.text.length), 0);
  if (longest < 15 && width >= 400) return 4;
  return longest > 42 || width < 235 ? 1 : 2;
}

export function getQuestionImageAspectRatio(question) {
  const imageWidth = Number(question.image?.width);
  const imageHeight = Number(question.image?.height);
  if (imageWidth > 0 && imageHeight > 0) return imageWidth / imageHeight;
  const boxWidth = Number(question.imageBox?.width);
  const boxHeight = Number(question.imageBox?.height);
  if (boxWidth > 0 && boxHeight > 0) return boxWidth / boxHeight;
  return 1.25;
}

export function getQuestionImageHeight(question, width) {
  return Math.max(60, Math.round(width / getQuestionImageAspectRatio(question)));
}

export function getImageLayoutForQuestion(question, width) {
  if (!question.image?.dataUrl) return { mode: "none", box: null, paddings: { top: 0, left: 0, right: 0, bottom: 0 }, minHeight: 0 };
  const mode = question.imagePosition || "top";
  const box = { ...question.imageBox };
  if (!box.width || box.width < 1) box.width = question.imageWidth || 150;
  if (!box.height || box.height < 1) box.height = Math.max(20, Math.round(box.width / getQuestionImageAspectRatio(question)));
  if (!Number.isFinite(box.x)) box.x = 0;
  if (!Number.isFinite(box.y)) box.y = 0;
  const paddings = { top: 0, left: 0, right: 0, bottom: 0 };
  let minHeight = 0;
  if (mode === "top") {
    paddings.top = box.y + box.height + 8;
    minHeight = box.y + box.height + 4;
  }
  return { mode, box, paddings, minHeight };
}

export function alignQuestionImageBox(question) {
  if (!question.image?.dataUrl) return;
  const width = question.imageBox.width || question.imageWidth || 150;
  question.imageBox.width = width;
  if (!question.imageBox.height || question.imageBox.height < 1) {
    question.imageBox.height = getQuestionImageHeight(question, width);
  }
  if (question.imagePosition === "left" || question.imagePosition === "bottom-left") {
    if (!Number.isFinite(question.imageBox.x)) question.imageBox.x = 0;
    if (!Number.isFinite(question.imageBox.y)) question.imageBox.y = 0;
  } else if (question.imagePosition === "right" || question.imagePosition === "bottom-right") {
    if (!Number.isFinite(question.imageBox.x)) question.imageBox.x = 0;
    if (!Number.isFinite(question.imageBox.y)) question.imageBox.y = 0;
  } else if (question.imagePosition === "bottom") {
    question.imageBox.x = 0;
    question.imageBox.y = 0;
  } else {
    if (!Number.isFinite(question.imageBox.x)) question.imageBox.x = Math.max(0, Math.round((240 - width) / 2));
    if (!Number.isFinite(question.imageBox.y)) question.imageBox.y = 0;
  }
}
