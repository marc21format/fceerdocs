import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  FONT_OPTIONS,
  SUBJECT_OPTIONS,
  PAGE,
  defaultState,
  HALF_INCH
} from './config.js';
import {
  clamp,
  clampNonNegativeInteger,
  normalizeColumnQuestionGaps,
  mergeState,
  createChoice
} from './utils.js';

// ─── Callback registry (breaks circular dependency with app.js) ───────────────
const _cbs = { setStatus: () => {}, applyTheme: () => {}, updateHistoryButtons: () => {}, render: () => {} };
export function registerStateCallbacks({ setStatus, applyTheme, updateHistoryButtons, render }) {
  if (setStatus) _cbs.setStatus = setStatus;
  if (applyTheme) _cbs.applyTheme = applyTheme;
  if (updateHistoryButtons) _cbs.updateHistoryButtons = updateHistoryButtons;
  if (render) _cbs.render = render;
}

export let state = loadState();
export let saveConfirmKnownName = "";

export function setSaveConfirmKnownName(val) {
  saveConfirmKnownName = val;
}

export function reassignState(newState) {
  state = newState;
}

export function loadState() {
  try {
    const raw = [localStorage.getItem(STORAGE_KEY), ...LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key))].find(Boolean);
    if (!raw) return structuredClone(defaultState);
    return normalizeState(mergeState(structuredClone(defaultState), JSON.parse(raw)));
  } catch {
    return structuredClone(defaultState);
  }
}

export function normalizeState(nextState) {
  nextState.ui ||= structuredClone(defaultState.ui);
  nextState.ui.selected ||= null;
  nextState.ui.panels ||= structuredClone(defaultState.ui.panels);
  nextState.ui.panels.headerFooter ??= true;
  delete nextState.ui.panels.template;
  delete nextState.ui.panels.footer;
  nextState.examDetails ||= structuredClone(defaultState.examDetails);
  nextState.template ||= structuredClone(defaultState.template);
  nextState.template.headerBox ||= structuredClone(defaultState.template.headerBox);
  nextState.template.headerImage ||= structuredClone(defaultState.template.headerImage);
  nextState.template.footerBox ||= structuredClone(defaultState.template.footerBox);
  nextState.template.pageNumberConfig ||= structuredClone(defaultState.template.pageNumberConfig);
  nextState.template.pageMargins ||= structuredClone(defaultState.template.pageMargins);
  nextState.questionStyle ||= structuredClone(defaultState.questionStyle);
  if (!FONT_OPTIONS.includes(nextState.questionStyle.fontFamily)) {
    nextState.questionStyle.fontFamily = defaultState.questionStyle.fontFamily;
  }
  if (!Number.isFinite(Number(nextState.questionStyle.fontSize))) {
    nextState.questionStyle.fontSize = defaultState.questionStyle.fontSize;
  }
  nextState.watermark ||= structuredClone(defaultState.watermark);
  nextState.watermark.image ||= { dataUrl: "" };
  nextState.watermark.scale ??= 1.2;
  nextState.pageLayout ||= structuredClone(defaultState.pageLayout);
  nextState.pageLayout.columnGap = clampNonNegativeInteger(nextState.pageLayout.columnGap, defaultState.pageLayout.columnGap);
  nextState.pageLayout.questionGap = clampNonNegativeInteger(nextState.pageLayout.questionGap, defaultState.pageLayout.questionGap);
  nextState.pageLayout.headerBufferPx = clampNonNegativeInteger(nextState.pageLayout.headerBufferPx, defaultState.pageLayout.headerBufferPx);
  nextState.pageLayout.columnQuestionGaps = normalizeColumnQuestionGaps(nextState.pageLayout.columnQuestionGaps);
  nextState.questions = (nextState.questions || []).map((question, index) => normalizeQuestionRecord(question, index));
  nextState.questions.forEach((question) => { question.collapsed = true; });
  nextState.questions.forEach((question) => {
    if (question.formula?.trim()) {
      question.stem = `${question.stem || ""}\n%% ${question.formula.trim()} %%`.trim();
    }
    delete question.formula;
  });

  if (nextState.template.headerHeight && !nextState.template.headerBox.height) {
    nextState.template.headerBox.height = nextState.template.headerHeight;
  }
  if (Number.isFinite(nextState.template.headerTop) && !Number.isFinite(nextState.template.headerBox.y)) {
    nextState.template.headerBox.y = nextState.template.pageMargins.top + nextState.template.headerTop;
  }
  if (!Number.isFinite(nextState.template.headerImage.width)) {
    nextState.template.headerImage.width = 0;
  }
  if (!Number.isFinite(nextState.template.headerImage.height)) {
    nextState.template.headerImage.height = 0;
  }
  fitHeaderBoxToAspect(nextState);
  if (!Number.isFinite(nextState.template.footerImage.width)) {
    nextState.template.footerImage.width = 0;
  }
  if (!Number.isFinite(nextState.template.footerImage.height)) {
    nextState.template.footerImage.height = 0;
  }
  fitFooterBoxToAspect(nextState);
  if (Number.isFinite(nextState.template.pageNumberConfig.offsetX) && !Number.isFinite(nextState.template.pageNumberConfig.x)) {
    nextState.template.pageNumberConfig.x = PAGE.width / 2 + nextState.template.pageNumberConfig.offsetX;
  }
  if (Number.isFinite(nextState.template.pageNumberConfig.offsetY) && !Number.isFinite(nextState.template.pageNumberConfig.y)) {
    nextState.template.pageNumberConfig.y = PAGE.height - nextState.template.pageMargins.bottom - nextState.template.pageNumberConfig.offsetY;
  }
  if (!Number.isFinite(Number(nextState.examDetails.itemsCount))) {
    nextState.examDetails.itemsCount = nextState.questions.length || defaultState.examDetails.itemsCount;
  }
  nextState.ui.sidebarWidth = clampNonNegativeInteger(nextState.ui.sidebarWidth, defaultState.ui.sidebarWidth);
  nextState.ui.sidebarWidth = clamp(nextState.ui.sidebarWidth || defaultState.ui.sidebarWidth, 310, 650); // SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH
  if (!nextState.examDetails.subject) nextState.examDetails.subject = defaultState.examDetails.subject;
  if (!nextState.examDetails.examType) nextState.examDetails.examType = defaultState.examDetails.examType;
  if (!Number.isFinite(Number(nextState.examDetails.examNumber))) nextState.examDetails.examNumber = defaultState.examDetails.examNumber;
  nextState.examDetails.itemsCount = nextState.questions.length;
  // Note: applyExamDetailsToQuestions is called later if necessary or directly
  return nextState;
}

export function normalizeQuestionRecord(question, index = 0) {
  const choices = (question?.choices || []).map((choice) => ({
    id: choice?.id || crypto.randomUUID(),
    text: choice?.text || ""
  }));
  const validSubject = SUBJECT_OPTIONS.includes(question?.subject)
    ? question.subject
    : SUBJECT_OPTIONS.includes(question?.sourceSubject)
      ? question.sourceSubject
      : defaultState.examDetails.subject;
  const validSourceSubject = SUBJECT_OPTIONS.includes(question?.sourceSubject)
    ? question.sourceSubject
    : validSubject;
  const sourceExamType = typeof question?.sourceExamType === "string" && question.sourceExamType.trim()
    ? question.sourceExamType.trim().toLowerCase()
    : typeof question?.examType === "string" && question.examType.trim()
      ? question.examType.trim().toLowerCase()
      : defaultState.examDetails.examType;
  const correctChoiceId = choices.some((choice) => choice.id === question?.correctChoiceId)
    ? question.correctChoiceId
    : choices[0]?.id || "";

  return {
    id: question?.id || crypto.randomUUID(),
    number: Number.isFinite(Number(question?.number)) ? Number(question.number) : index + 1,
    collapsed: question?.collapsed ?? true,
    subject: validSubject,
    sourceSubject: validSourceSubject,
    sourceExamType,
    sourceExamNumber: Number.isFinite(Number(question?.sourceExamNumber)) ? Number(question.sourceExamNumber) : Number.isFinite(Number(question?.examNumber)) ? Number(question.examNumber) : 1,
    savedBy: String(question?.savedBy || "").trim(),
    savedAt: String(question?.savedAt || question?.updatedAt || question?.createdAt || "").trim(),
    topic: String(question?.topic || question?.subject || ""),
    stem: question?.stem || "",
    explanation: question?.explanation || "",
    imageNote: question?.imageNote || "",
    correctChoiceId,
    image: {
      dataUrl: question?.image?.dataUrl || "",
      width: Number.isFinite(Number(question?.image?.width)) ? Number(question.image.width) : 0,
      height: Number.isFinite(Number(question?.image?.height)) ? Number(question.image.height) : 0
    },
    imagePosition: ["top", "left", "right", "bottom", "bottom-left", "bottom-right"].includes(question?.imagePosition) ? question.imagePosition : "top",
    imageWidth: Number.isFinite(Number(question?.imageWidth)) ? Number(question.imageWidth) : 150,
    imageBox: {
      x: Number.isFinite(Number(question?.imageBox?.x)) ? Number(question.imageBox.x) : 0,
      y: Number.isFinite(Number(question?.imageBox?.y)) ? Number(question.imageBox.y) : 0,
      width: Number.isFinite(Number(question?.imageBox?.width)) ? Number(question.imageBox.width) : 150,
      height: Number.isFinite(Number(question?.imageBox?.height)) ? Number(question.imageBox.height) : 120
    },
    passage: String(question?.passage || ""),
    passageNote: String(question?.passageNote || ""),
    passagePosition: ["top", "left", "right", "bottom", "bottom-left", "bottom-right"].includes(question?.passagePosition) ? question.passagePosition : "top",
    passageFontSize: Number.isFinite(Number(question?.passageFontSize)) ? Number(question.passageFontSize) : 12,
    passageWidth: Number.isFinite(Number(question?.passageWidth)) ? Number(question.passageWidth) : 0,
    passageTextAlign: ["left", "center", "right", "justify"].includes(question?.passageTextAlign) ? question.passageTextAlign : "left",
    choiceLayout: ["auto", "1", "2", "4"].includes(question?.choiceLayout) ? question.choiceLayout : "auto",
    spacingMode: "compact",
    choices: choices.length ? choices : [createChoice(), createChoice(), createChoice(), createChoice()]
  };
}

export function createQuestionTemplate(existingQuestion) {
  const fallbackChoices = [createChoice(), createChoice(), createChoice(), createChoice()];
  const question = existingQuestion ? normalizeQuestionRecord(existingQuestion, state.questions.length) : {
    id: crypto.randomUUID(),
    number: state.questions.length + 1,
    collapsed: true,
    subject: state.examDetails.subject,
    topic: "",
    stem: "",
    explanation: "",
    imageNote: "",
    correctChoiceId: fallbackChoices[0].id,
    image: { dataUrl: "", width: 0, height: 0 },
    imagePosition: "top",
    imageWidth: 150,
    imageBox: { x: 0, y: 0, width: 150, height: 120 },
    passage: "",
    passageNote: "",
    passagePosition: "top",
    passageFontSize: 12,
    passageWidth: 0,
    passageTextAlign: "left",
    choiceLayout: "auto",
    spacingMode: "compact",
    choices: fallbackChoices
  };

  if (!question.correctChoiceId && question.choices[0]) {
    question.correctChoiceId = question.choices[0].id;
  }

  return question;
}

export function setQuestionCorrectChoice(question, choiceId) {
  if (question.choices.some((choice) => choice.id === choiceId)) {
    question.correctChoiceId = choiceId;
  } else if (question.choices[0]) {
    question.correctChoiceId = question.choices[0].id;
  } else {
    question.correctChoiceId = "";
  }
}

export function resizeQuestionsToCount(questions, count) {
  const target = Math.max(1, Math.floor(Number(count) || 0));
  const next = questions.slice(0, target);
  while (next.length < target) {
    next.push(createQuestionTemplate());
  }
  return next;
}

export function applyExamDetailsToQuestions() {
  const subject = state.examDetails.subject || defaultState.examDetails.subject;
  const examType = state.examDetails.examType || defaultState.examDetails.examType;
  const examNumber = Number(state.examDetails.examNumber) || defaultState.examDetails.examNumber;
  const itemCount = Number(state.examDetails.itemsCount) || state.questions.length;
  state.questions.forEach((question) => {
    question.subject = subject;
    question.sourceSubject = subject;
    question.examType = examType;
    question.examNumber = examNumber;
    question.examItemsCount = itemCount;
  });
}

export function normalizeNumbers() {
  state.questions = state.questions.map((question, index) => ({ ...question, number: index + 1 }));
  state.examDetails.itemsCount = state.questions.length;
  applyExamDetailsToQuestions();
}

export function getHeaderAspectRatio(sourceState = state) {
  const width = Number(sourceState.template?.headerImage?.width);
  const height = Number(sourceState.template?.headerImage?.height);
  if (width > 0 && height > 0) return width / height;
  const box = sourceState.template?.headerBox;
  if (box?.width > 0 && box?.height > 0) return box.width / box.height;
  return 6;
}

export function fitHeaderBoxToAspect(sourceState = state) {
  const ratio = getHeaderAspectRatio(sourceState);
  const box = sourceState.template.headerBox;
  const maxWidth = PAGE.width - box.x;
  const maxHeight = PAGE.height - box.y;
  const clampedWidth = clamp(box.width || defaultState.template.headerBox.width, 80, Math.max(80, maxWidth));
  const aspectWidthLimit = Math.max(80, Math.min(maxWidth, maxHeight * ratio));
  box.width = clamp(clampedWidth, 80, aspectWidthLimit);
  box.height = Math.max(24, Math.round(box.width / ratio));
  if (box.y + box.height > PAGE.height) {
    box.y = Math.max(0, PAGE.height - box.height);
  }
}

export function getFooterAspectRatio(sourceState = state) {
  const width = Number(sourceState.template?.footerImage?.width);
  const height = Number(sourceState.template?.footerImage?.height);
  if (width > 0 && height > 0) return width / height;
  const box = sourceState.template?.footerBox;
  if (box?.width > 0 && box?.height > 0) return box.width / box.height;
  return 6;
}

export function fitFooterBoxToAspect(sourceState = state) {
  const ratio = getFooterAspectRatio(sourceState);
  const box = sourceState.template.footerBox;
  const maxWidth = PAGE.width - box.x;
  const maxHeight = PAGE.height - box.y;
  const clampedWidth = clamp(box.width || defaultState.template.footerBox.width, 80, Math.max(80, maxWidth));
  const aspectWidthLimit = Math.max(80, Math.min(maxWidth, maxHeight * ratio));
  box.width = clamp(clampedWidth, 80, aspectWidthLimit);
  box.height = Math.max(24, Math.round(box.width / ratio));
  if (box.y + box.height > PAGE.height) {
    box.y = Math.max(0, PAGE.height - box.height);
  }
}

export function autoReserveFooterSpace(sourceState = state) {
  const footer = sourceState.template.footerBox;
  const pageBottom = PAGE.height - sourceState.template.pageMargins.bottom;
  const footerHeight = Number.isFinite(Number(footer.height)) ? Number(footer.height) : 36;
  const footerBuffer = Number.isFinite(Number(sourceState.pageLayout?.footerBufferPx))
    ? Number(sourceState.pageLayout.footerBufferPx)
    : HALF_INCH;
  footer.height = clamp(footerHeight, 24, Math.max(24, PAGE.height - pageBottom + footerBuffer));
  footer.y = clamp(pageBottom - footer.height - footerBuffer, 0, pageBottom - footer.height);
}

// ─── History Management ──────────────────────────────────────────────────────
export let historyStack = [];
export let historyIndex = -1;
export let isUndoingRedoing = false;
const MAX_HISTORY = 50;

export function pushHistory(snapshot) {
  if (isUndoingRedoing) return;
  if (historyIndex >= 0 && historyStack[historyIndex] === snapshot) return;
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(snapshot);
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  } else {
    historyIndex++;
  }
  _cbs.updateHistoryButtons();
}

export function saveState(statusText = "Saved locally") {
  const snapshot = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, snapshot);
  pushHistory(snapshot);
  _cbs.setStatus(statusText);
}

export function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    isUndoingRedoing = true;
    state = JSON.parse(historyStack[historyIndex]);
    localStorage.setItem(STORAGE_KEY, historyStack[historyIndex]);
    _cbs.render();
    isUndoingRedoing = false;
    _cbs.updateHistoryButtons();
    _cbs.setStatus("Undo");
    return true;
  }
  return false;
}

export function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    isUndoingRedoing = true;
    state = JSON.parse(historyStack[historyIndex]);
    localStorage.setItem(STORAGE_KEY, historyStack[historyIndex]);
    _cbs.render();
    isUndoingRedoing = false;
    _cbs.updateHistoryButtons();
    _cbs.setStatus("Redo");
    return true;
  }
  return false;
}

export function placeHeaderImage(imageMeta) {
  state.template.headerImage = imageMeta;
  const maxWidth = PAGE.width - 24;
  const targetWidth = clamp(
    state.template.headerBox.width || maxWidth,
    80,
    maxWidth
  );
  state.template.headerBox.width = targetWidth;
  state.template.headerBox.x = clamp(state.template.headerBox.x, 0, PAGE.width - targetWidth);
  fitHeaderBoxToAspect(state);
}

export function placeFooterImage(imageMeta) {
  state.template.footerImage = imageMeta;
  const maxWidth = PAGE.width - 24;
  const targetWidth = clamp(
    state.template.footerBox.width || maxWidth,
    80,
    maxWidth
  );
  state.template.footerBox.width = targetWidth;
  state.template.footerBox.x = clamp(state.template.footerBox.x, 0, PAGE.width - targetWidth);
  fitFooterBoxToAspect(state);
}

export function cloneQuestionForBuilder(existingQuestion) {
  const cloned = normalizeQuestionRecord(existingQuestion, state.questions.length);
  const originalChoices = Array.isArray(existingQuestion?.choices) ? existingQuestion.choices : cloned.choices;
  const choiceIdMap = new Map();
  cloned.choices = originalChoices.map((choice) => {
    const nextChoice = {
      id: crypto.randomUUID(),
      text: String(choice?.text || "")
    };
    choiceIdMap.set(choice?.id, nextChoice.id);
    return nextChoice;
  });
  cloned.id = crypto.randomUUID();
  cloned.number = state.questions.length + 1;
  cloned.collapsed = true;
  cloned.correctChoiceId = choiceIdMap.get(existingQuestion?.correctChoiceId) || cloned.choices[0]?.id || "";
  if (!cloned.image) {
    cloned.image = { dataUrl: "", width: 0, height: 0 };
  }
  if (!cloned.imageBox) {
    cloned.imageBox = { x: 0, y: 0, width: cloned.imageWidth || 150, height: 120 };
  }
  return cloned;
}

export function addQuestionFromTemplate(existingQuestion) {
  const question = existingQuestion ? cloneQuestionForBuilder(existingQuestion) : createQuestionTemplate();
  state.questions.push(question);
  normalizeNumbers();
  _cbs.render();
  saveState("Question added");
}

export function moveQuestionBefore(sourceId, targetId) {
  const sourceIndex = state.questions.findIndex((question) => question.id === sourceId);
  const targetIndex = state.questions.findIndex((question) => question.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [moved] = state.questions.splice(sourceIndex, 1);
  const adjustedTargetIndex = state.questions.findIndex((question) => question.id === targetId);
  state.questions.splice(adjustedTargetIndex, 0, moved);
  normalizeNumbers();
  _cbs.render();
  saveState("Questions reordered");
}


