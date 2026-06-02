import { elements, applyPreviewZoom } from '../app.js';
import {
  state,
  saveState,
  normalizeNumbers,
  createQuestionTemplate,
  setQuestionCorrectChoice,
  addQuestionFromTemplate,
  moveQuestionBefore
} from './state.js';
import {
  PAGE,
  HALF_INCH,
  defaultState
} from './config.js';
import {
  escapeHtml,
  escapeHtmlAttribute
} from './utils.js';
import { uiState } from './ui-state.js';
import {
  alignQuestionImageBox,
  getQuestionImageHeight,
  detectChoiceColumns,
  getImageLayoutForQuestion,
  getSelectionInfo,
  getQuestionGapForColumn
} from './layout.js';
import {
  readQuestionImageFile,
  readImageFile
} from './image-utils.js';
import { renderStyledTextParts } from './math-render.js';
import { startDragAction } from './drag.js';

const _cbs = {
  syncToolbarFields: () => {},
  setStatus: () => {},
  queueQuestionSync: () => {}
};

export function registerRendererCallbacks(cbs) {
  Object.assign(_cbs, cbs);
}

export function rerenderPreview(statusText, options = {}) {
  if (options.syncEditors) {
    renderQuestionEditors();
  }
  renderPages();
  _cbs.syncToolbarFields();
  if (options.syncQuestions) {
    _cbs.queueQuestionSync(statusText);
    return;
  }
  saveState(statusText);
}

export function updateFileInputLabel(inputEl, filename) {
  const wrapper = inputEl.closest(".file-input-wrapper");
  if (!wrapper) return;
  const labelSpan = wrapper.querySelector(".file-input-label");
  if (labelSpan && filename) {
    labelSpan.textContent = filename;
  }
  wrapper.classList.toggle("has-file", Boolean(filename));
}

export function closeActiveInlineEditor() {
  if (!uiState.activeInlineEditor) return;
  const { container, commit } = uiState.activeInlineEditor;
  uiState.activeInlineEditor = null; // clear FIRST so commit cannot re-enter
  commit();
}

export function openInlineEditor(container, rawText, onCommit, options = {}) {
  // If this exact container is already in edit mode, do nothing
  if (container.dataset.editing === "true") return;

  // Explicitly close whatever other editor was open (different element)
  closeActiveInlineEditor();

  container.dataset.editing = "true";
  const bounds = container.getBoundingClientRect();
  const editor = document.createElement("textarea");
  editor.className = "inline-text-editor";
  editor.value = rawText;
  editor.rows = Math.max(1, String(rawText).split("\n").length);
  // Do NOT set explicit pixel width — CSS width:100% + box-sizing:border-box
  // correctly constrains to the parent column in both 1-col and 2-col modes.
  editor.style.minHeight = `${Math.max(bounds.height, 22)}px`;
  editor.style.height = `${Math.max(bounds.height, 22)}px`;
  container.innerHTML = "";
  container.append(editor);

  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);

  const commit = () => {
    if (container.dataset.editing !== "true") return;
    container.dataset.editing = "false";
    // Unregister from the global tracker if this is still the active one
    if (uiState.activeInlineEditor?.container === container) {
      uiState.activeInlineEditor = null;
    }
    const value = editor.value.trimEnd();
    onCommit(value);
  };

  // Register as the globally active editor
  uiState.activeInlineEditor = { container, commit };

  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && options.multiline === false) {
      event.preventDefault();
      editor.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      container.dataset.editing = "false";
      uiState.activeInlineEditor = null;
      renderInlineDisplay(container, rawText, options);
    }
  });
  editor.addEventListener("input", () => {
    editor.style.height = "auto";
    editor.style.height = `${Math.max(editor.scrollHeight, bounds.height, 22)}px`;
  });
  editor.addEventListener("blur", commit);
}

export function openInlineEditorAfterRender(selection, rawText, onCommit, options = {}) {
  if (!selection) return;
  let liveEl = null;

  // choice:QUESTIONID:INDEX
  const choiceMatch = selection.match(/^choice:(.+):(\d+)$/);
  if (choiceMatch) {
    const questionId = choiceMatch[1];
    const choiceIndex = Number(choiceMatch[2]);
    const wrapper = elements.pagePreview.querySelector(`[data-question-id="${questionId}"]`);
    if (wrapper) {
      const choiceTexts = wrapper.querySelectorAll(".choice-text");
      liveEl = choiceTexts[choiceIndex] || null;
    }
  }

  // question:QUESTIONID
  const questionMatch = !choiceMatch && selection.match(/^question:(.+)$/);
  if (questionMatch) {
    const questionId = questionMatch[1];
    const wrapper = elements.pagePreview.querySelector(`[data-question-id="${questionId}"]`);
    liveEl = wrapper?.querySelector(".question-stem") || null;
  }

  if (liveEl) {
    openInlineEditor(liveEl, rawText, onCommit, options);
  }
}

export function createInlineDisplay(tag, className, rawText, onCommit, options = {}) {
  const el = document.createElement(tag);
  el.className = className;
  renderInlineDisplay(el, rawText, options);
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    const newSelection = options.selection || null;
    // If already selected and already editing, do nothing
    if (state.ui.selected === newSelection && el.dataset.editing === "true") return;
    // Update selection state
    state.ui.selected = newSelection;
    _cbs.syncToolbarFields();
    // Commit any open editor after the new selection is set so any rerender
    // from the commit already reflects the new active target.
    closeActiveInlineEditor();
    // Rebuild the page so the old editor is gone and selection highlight is correct
    renderPages();
    // Now find the live counterpart of this element and open the editor there
    openInlineEditorAfterRender(newSelection, rawText, onCommit, options);
  });
  return el;
}

export function renderInlineDisplay(el, rawText, options = {}) {
  el.innerHTML = "";
  if (options.renderAnnotations) {
    el.append(renderStyledTextParts(rawText, options.subject));
  } else {
    el.textContent = rawText;
  }
}

export function summarizeQuestionText(question, maxWords = 20) {
  const text = String(question?.stem || "").trim().replace(/<[^>]+>/g, "");
  if (!text) return "Untitled question";
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}...` : text;
}

export function buildQuestionEditor(question) {
  const fragment = elements.questionTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".question-editor-card");
  card.dataset.questionId = question.id;
  card.open = !question.collapsed;
  fragment.querySelector(".question-title").textContent = `Question ${question.number}`;

  const previewText = fragment.querySelector(".question-preview-text");
  previewText.textContent = summarizeQuestionText(question, 20);

  card.addEventListener("dragstart", (event) => {
    if (event.target.closest("input, textarea, select, button")) {
      event.preventDefault();
      return;
    }
    uiState.draggedQuestionId = question.id;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", question.id);
  });

  card.addEventListener("dragend", () => {
    uiState.draggedQuestionId = "";
    card.classList.remove("dragging");
    document.querySelectorAll(".question-editor-card.drop-target").forEach((node) => node.classList.remove("drop-target"));
  });

  card.addEventListener("dragover", (event) => {
    if (!uiState.draggedQuestionId || uiState.draggedQuestionId === question.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    card.classList.add("drop-target");
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drop-target");
  });

  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("drop-target");
    const sourceId = event.dataTransfer.getData("text/plain") || uiState.draggedQuestionId;
    if (!sourceId || sourceId === question.id) return;
    moveQuestionBefore(sourceId, question.id);
  });

  card.addEventListener("toggle", () => {
    question.collapsed = !card.open;
    _cbs.queueQuestionSync(`Question ${question.number} ${card.open ? "expanded" : "collapsed"}`);
  });

  const stemInput = fragment.querySelector(".question-stem-input");
  const stemToolbarBtns = fragment.querySelectorAll(".stem-format-btn");

  function sanitizeHtml(html) {
    const allowed = new Set(["b", "i", "u", "br", "div"]);
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    function clean(node) {
      if (node.nodeType === 3) return;
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (!allowed.has(tag)) {
          const parent = node.parentNode;
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
        } else {
          while (node.attributes.length > 0) node.removeAttribute(node.attributes[0].name);
          [...node.children].forEach(clean);
        }
      }
    }
    clean(tmp);
    return tmp.innerHTML;
  }

  function updateFormatBtnStates() {
    const sel = window.getSelection();
    const noSel = !sel.rangeCount || sel.isCollapsed;
    stemToolbarBtns.forEach((btn) => {
      const cmd = btn.dataset.cmd;
      const tags = { bold: "b", italic: "i", underline: "u" };
      const tag = tags[cmd];
      let active;
      if (noSel) {
        const html = stemInput.innerHTML.trim();
        active = html.startsWith(`<${tag}>`) && html.endsWith(`</${tag}>`);
      } else {
        active = document.queryCommandState(cmd);
      }
      btn.classList.toggle("active", active);
    });
  }

  stemInput.innerHTML = sanitizeHtml(question.stem);
  stemInput.addEventListener("input", () => {
    question.stem = sanitizeHtml(stemInput.innerHTML);
    previewText.textContent = summarizeQuestionText(question, 20);
    rerenderPreview("Question updated", { syncQuestions: true });
  });

  stemToolbarBtns.forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) {
        const range = document.createRange();
        range.selectNodeContents(stemInput);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand(cmd, false, null);
        sel.removeAllRanges();
        stemInput.focus();
      } else {
        document.execCommand(cmd, false, null);
        stemInput.focus();
      }
      updateFormatBtnStates();
      stemInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  document.addEventListener("selectionchange", () => {
    if (document.activeElement === stemInput) {
      updateFormatBtnStates();
    }
  });

  stemInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  stemInput.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertHTML", false, "&nbsp;&nbsp;&nbsp;&nbsp;");
    }
  });

  const topicInput = fragment.querySelector(".question-topic-input");
  topicInput.value = question.topic || "";
  topicInput.addEventListener("input", (event) => {
    question.topic = event.target.value;
    rerenderPreview("Topic updated", { syncQuestions: true });
  });

  const correctAnswerInput = fragment.querySelector(".question-correct-answer-input");
  correctAnswerInput.innerHTML = "";
  question.choices.forEach((choice, index) => {
    const option = document.createElement("option");
    option.value = choice.id;
    const letter = String.fromCharCode(65 + index);
    const text = choice.text.trim();
    option.textContent = text ? `${letter}. ${text}` : `${letter}.`;
    correctAnswerInput.append(option);
  });
  setQuestionCorrectChoice(question, question.correctChoiceId);
  correctAnswerInput.value = question.correctChoiceId;
  correctAnswerInput.addEventListener("change", (event) => {
    question.correctChoiceId = event.target.value;
    rerenderPreview("Correct answer updated", { syncQuestions: true });
  });

  const explanationInput = fragment.querySelector(".question-explanation-input");
  explanationInput.value = question.explanation || "";
  explanationInput.addEventListener("input", (event) => {
    question.explanation = event.target.value;
    rerenderPreview("Explanation updated", { syncQuestions: true });
  });

  const choiceLayoutInput = fragment.querySelector(".question-choice-layout-input");
  choiceLayoutInput.value = question.choiceLayout;
  choiceLayoutInput.addEventListener("change", (event) => {
    question.choiceLayout = event.target.value;
    rerenderPreview("Choice layout updated", { syncQuestions: true });
  });

  question.spacingMode = "compact";

  const imageControls = fragment.querySelector(".question-image-controls");
  imageControls.hidden = !question.image?.dataUrl;

  const deleteImageBtn = fragment.querySelector(".delete-question-image-btn");
  deleteImageBtn.hidden = !question.image?.dataUrl;

  const fileWrapper = fragment.querySelector(".question-image-wrapper");
  const fileLabel = fileWrapper?.querySelector(".file-input-label");
  if (question.image?.dataUrl && fileLabel) {
    fileLabel.textContent = "Image attached";
    fileWrapper.classList.add("has-file");
  }

  const imagePositionInput = fragment.querySelector(".question-image-position-input");
  imagePositionInput.value = question.imagePosition;
  imagePositionInput.addEventListener("change", (event) => {
    question.imagePosition = event.target.value;
    alignQuestionImageBox(question);
    rerenderPreview("Image position updated", { syncQuestions: true });
  });

  const imageWidthInput = fragment.querySelector(".question-image-width-input");
  imageWidthInput.value = question.imageBox.width || question.imageWidth;
  imageWidthInput.addEventListener("input", (event) => {
    const width = Number(event.target.value);
    question.imageWidth = width;
    question.imageBox.width = width;
    question.imageBox.height = getQuestionImageHeight(question, width);
    alignQuestionImageBox(question);
    rerenderPreview("Image width updated", { syncQuestions: true });
  });

  const imageXInput = fragment.querySelector(".question-image-x-input");
  imageXInput.value = question.imageBox.x ?? 0;
  imageXInput.addEventListener("input", (event) => {
    question.imageBox.x = Number(event.target.value);
    rerenderPreview("Image X updated", { syncQuestions: true });
  });

  const imageYInput = fragment.querySelector(".question-image-y-input");
  imageYInput.value = question.imageBox.y ?? 0;
  imageYInput.addEventListener("input", (event) => {
    question.imageBox.y = Number(event.target.value);
    rerenderPreview("Image Y updated", { syncQuestions: true });
  });

  fragment.querySelector(".question-image-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    _cbs.setStatus("Optimizing question image...");
    updateFileInputLabel(event.target, file.name);
    question.image = await readQuestionImageFile(file);
    question.imageBox.width = question.imageWidth || 150;
    question.imageBox.height = getQuestionImageHeight(question, question.imageBox.width);
    alignQuestionImageBox(question);
    rerenderPreview("Question image added", { syncEditors: true, syncQuestions: true });
    event.target.value = "";
  });

  deleteImageBtn.addEventListener("click", (event) => {
    event.preventDefault();
    question.image = { dataUrl: "", width: 0, height: 0 };
    question.imageBox = { x: 0, y: 0, width: question.imageWidth || 150, height: 120 };
    if (fileLabel) {
      fileLabel.textContent = "Choose image\u2026";
      fileWrapper.classList.remove("has-file");
    }
    rerenderPreview("Question image removed", { syncEditors: true, syncQuestions: true });
  });

  const imageNoteInput = fragment.querySelector(".question-image-note-input");
  imageNoteInput.value = question.imageNote || "";
  imageNoteInput.addEventListener("input", (event) => {
    question.imageNote = event.target.value;
    rerenderPreview("Image note updated", { syncQuestions: true });
  });

  const passageControls = fragment.querySelector(".question-passage-controls");
  const hasPassageContent = (text) => text && text.replace(/<[^>]*>/g, "").trim().length > 0;
  passageControls.hidden = !question.passage;

  const passageInput = fragment.querySelector(".question-passage-input");
  passageInput.innerHTML = question.passage || "";
  passageInput.addEventListener("input", () => {
    const content = passageInput.innerHTML;
    if (hasPassageContent(content)) {
      question.passage = content;
    } else {
      question.passage = "";
      passageInput.innerHTML = "";
    }
    passageControls.hidden = !question.passage;
    rerenderPreview("Passage updated", { syncQuestions: true });
  });

  const passageFormatBtns = fragment.querySelectorAll(".passage-toolbar-left .passage-tool-btn");

  function updatePassageFormatBtnStates() {
    const sel = window.getSelection();
    const noSel = !sel.rangeCount || sel.isCollapsed;
    passageFormatBtns.forEach((btn) => {
      const cmd = btn.dataset.cmd;
      const tags = { bold: "b", italic: "i", underline: "u" };
      const tag = tags[cmd];
      if (!tag) return;
      let active;
      if (noSel) {
        const html = passageInput.innerHTML.trim();
        active = html.startsWith(`<${tag}>`) && html.endsWith(`</${tag}>`);
      } else {
        active = document.queryCommandState(cmd);
      }
      btn.classList.toggle("active", active);
    });
  }

  passageFormatBtns.forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) {
        const range = document.createRange();
        range.selectNodeContents(passageInput);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand(cmd, false, null);
        sel.removeAllRanges();
        passageInput.focus();
      } else {
        document.execCommand(cmd, false, null);
        passageInput.focus();
      }
      updatePassageFormatBtnStates();
      passageInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  document.addEventListener("selectionchange", () => {
    if (document.activeElement === passageInput) {
      updatePassageFormatBtnStates();
    }
  });

  const passagePositionInput = fragment.querySelector(".question-passage-position-input");
  passagePositionInput.value = question.passagePosition;
  passagePositionInput.addEventListener("change", (event) => {
    question.passagePosition = event.target.value;
    rerenderPreview("Passage position updated", { syncQuestions: true });
  });

  const passageNoteInput = fragment.querySelector(".question-passage-note-input");
  passageNoteInput.value = question.passageNote || "";
  passageNoteInput.addEventListener("input", (event) => {
    question.passageNote = event.target.value;
    rerenderPreview("Passage note updated", { syncQuestions: true });
  });

  const passageFontsizeDisplay = fragment.querySelector(".passage-fontsize-display");
  passageFontsizeDisplay.textContent = question.passageFontSize || 12;

  fragment.querySelector(".passage-fontsize-minus-btn").addEventListener("click", () => {
    question.passageFontSize = Math.max(8, (question.passageFontSize || 12) - 0.5);
    passageFontsizeDisplay.textContent = question.passageFontSize;
    rerenderPreview("Passage font size decreased", { syncQuestions: true });
  });

  fragment.querySelector(".passage-fontsize-plus-btn").addEventListener("click", () => {
    question.passageFontSize = Math.min(30, (question.passageFontSize || 12) + 0.5);
    passageFontsizeDisplay.textContent = question.passageFontSize;
    rerenderPreview("Passage font size increased", { syncQuestions: true });
  });

  const alignBtns = fragment.querySelectorAll(".passage-align-btn");
  alignBtns.forEach((btn) => {
    if (btn.dataset.align === (question.passageTextAlign || "left")) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      alignBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      question.passageTextAlign = btn.dataset.align;
      rerenderPreview("Passage alignment updated", { syncQuestions: true });
    });
  });

  const choicesGrid = fragment.querySelector(".choices-grid");
  question.choices.forEach((choice, index) => {
    const row = document.createElement("label");
    row.className = "choice-editor-row";
    row.innerHTML = `<span>${String.fromCharCode(65 + index)}.</span><input type="text" value="${escapeHtmlAttribute(choice.text)}" />`;
    row.querySelector("input").addEventListener("input", (event) => {
      choice.text = event.target.value;
      rerenderPreview("Choice updated", { syncQuestions: true });
    });
    choicesGrid.append(row);
  });

  return fragment;
}

export function renderQuestionEditors() {
  elements.questionList.innerHTML = "";
  state.questions.forEach((question) => {
    elements.questionList.append(buildQuestionEditor(question));
  });
}

function sanitizeAllowedTags(html) {
  if (!html) return "";
  const allowed = new Set(["b", "i", "u", "br", "div"]);
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  (function clean(node) {
    const children = [...node.childNodes];
    children.forEach((child) => {
      if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (!allowed.has(tag)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          while (child.attributes.length > 0) child.removeAttribute(child.attributes[0].name);
          clean(child);
        }
      }
    });
  })(tmp);
  return tmp.innerHTML;
}

export function createQuestionPreview(question, width) {
  const selection = getSelectionInfo();
  const selectedQuestion = selection?.questionId === question.id;
  const selectedChoice = selection?.kind === "choice" && selectedQuestion && selection.choiceIndex != null;
  const selectedStem = selection?.kind === "question" && selectedQuestion;
  const selectedBox = selection?.kind === "question-box" && selectedQuestion;
  const selectedImage = selection?.kind === "image" && selectedQuestion;

  const wrapper = document.createElement("article");
  wrapper.className = "question-preview";
  wrapper.dataset.questionId = question.id;
  wrapper.style.fontSize = `${state.questionStyle.fontSize}px`;
  wrapper.style.fontFamily = state.questionStyle.fontFamily;
  wrapper.style.marginBottom = "0px";

  const commitStemEdit = (value) => {
    question.stem = value.replace(/^\s*\d+\.\s*/, "");
    rerenderPreview("Question edited on paper", { syncEditors: true });
  };

  const questionGroup = document.createElement("div");
  questionGroup.className = `question-group${selectedQuestion ? " selected" : ""}${selectedBox ? " box-selected" : ""}${selectedStem ? " stem-selected" : ""}${selectedImage ? " image-selected" : ""}`;
  questionGroup.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target.closest(
      "button, input, textarea, select, .choice-item, .question-image-layer, .inline-text-editor"
    )) {
      return;
    }

    const hadActiveEditor = Boolean(uiState.activeInlineEditor);
    // Set selection BEFORE rendering so highlights are correct from the start
    state.ui.selected = `question:${question.id}`;
    _cbs.syncToolbarFields();
    closeActiveInlineEditor();

    if (hadActiveEditor) {
      // Re-render to clear stale highlights, then find the live DOM node
      renderPages();
      const liveGroup = elements.pagePreview.querySelector(
        `[data-question-id="${question.id}"] .question-stem`
      );
      if (liveGroup) {
        openInlineEditor(liveGroup, `${question.number}. ${question.stem}`, commitStemEdit, {
          renderAnnotations: true,
          selection: `question:${question.id}`,
          multiline: true,
          subject: question.subject
        });
      }
      return;
    }

    openInlineEditor(stem, `${question.number}. ${question.stem}`, commitStemEdit, {
      renderAnnotations: true,
      selection: `question:${question.id}`,
      multiline: true,
      subject: question.subject
    });
  });

  function getPassageLayoutForQuestion(q, w) {
    if (!q.passage) return { mode: "none", box: null, paddings: { top: 0, left: 0, right: 0, bottom: 0 }, minHeight: 0 };
    const m = q.passagePosition || "top";
    const paddings = { top: 0, left: 0, right: 0, bottom: 0 };
    return { mode: m, box: null, paddings, minHeight: 0 };
  }

  const imageLayout = getImageLayoutForQuestion(question, width);
  const passageLayout = getPassageLayoutForQuestion(question, width);

  function buildImageLayer() {
    if (!imageLayout.box || !question.image?.dataUrl) return null;
    const layout = imageLayout;
    const el = document.createElement("div");
    el.className = `question-image-layer${selectedImage ? " selected" : ""}`;
    el.style.width = `${layout.box.width}px`;
    el.style.height = `${layout.box.height}px`;
    el.dataset.kind = "question-image";
    el.dataset.questionId = question.id;
    el.innerHTML = `<img class="question-image-preview" src="${question.image.dataUrl}" alt="" /><button class="image-delete-btn" type="button">×</button><span class="resize-handle"></span>`;
    if (question.imageNote) {
      const note = document.createElement("div");
      note.className = "image-note";
      note.textContent = question.imageNote;
      el.append(note);
    }
    el.addEventListener("pointerdown", (event) => startDragAction(event, el));
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      state.ui.selected = `image:${question.id}`;
      _cbs.syncToolbarFields();
      closeActiveInlineEditor();
      renderPages();
    });
    el.querySelector(".image-delete-btn").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      question.image = { dataUrl: "", width: 0, height: 0 };
      question.imageBox = { x: 0, y: 0, width: question.imageWidth || 150, height: 120 };
      rerenderPreview("Question image removed", { syncEditors: true, syncQuestions: true });
    });
    return el;
  }

  function startPassageResize(event, el) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = el.offsetWidth;
    const widthInput = document.querySelector(`[data-question-id="${question.id}"]`)?.closest(".question-editor-card")?.querySelector(".question-passage-width-input");
    function onMove(e) {
      const dx = e.clientX - startX;
      el.style.width = `${Math.max(80, startW + dx)}px`;
    }
    function onUp() {
      question.passageWidth = el.offsetWidth;
      if (widthInput) widthInput.value = question.passageWidth;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function buildPassageLayer() {
    if (!question.passage) return null;
    const wrapper = document.createElement("div");
    wrapper.className = "question-passage-wrapper";
    wrapper.dataset.kind = "question-passage";
    wrapper.dataset.questionId = question.id;
    if (question.passageNote) {
      const note = document.createElement("div");
      note.className = "passage-note";
      note.textContent = question.passageNote;
      wrapper.append(note);
    }
    const el = document.createElement("div");
    el.className = "question-passage-layer";
    const fontSize = question.passageFontSize || 12;
    el.style.fontSize = `${fontSize}px`;
    el.style.textAlign = question.passageTextAlign || "left";
    if (question.passageWidth) el.style.width = `${question.passageWidth}px`;
    el.innerHTML = `<div class="question-passage-text">${sanitizeAllowedTags(question.passage)}</div><span class="passage-resize-handle"></span>`;
    el.addEventListener("pointerdown", (event) => {
      if (event.target.classList.contains("passage-resize-handle")) {
        startPassageResize(event, el);
      }
    });
    wrapper.append(el);
    return wrapper;
  }

  const hasHtml = /<[biu]>/.test(question.stem);
  let stem;
  if (hasHtml) {
    stem = document.createElement("div");
    stem.className = `question-stem preview-editable${selectedStem ? " selected" : ""}`;
    const allowed = new Set(["b", "i", "u", "br", "div"]);
    const tmp = document.createElement("div");
    tmp.innerHTML = question.stem;
    (function clean(node) {
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (!allowed.has(tag)) {
          const parent = node.parentNode;
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
        } else {
          while (node.attributes.length > 0) node.removeAttribute(node.attributes[0].name);
          [...node.children].forEach(clean);
        }
      }
    })(tmp);
    stem.innerHTML = `${question.number}. ${tmp.innerHTML}`;
    stem.addEventListener("click", () => {
      state.ui.selected = `question:${question.id}`;
      _cbs.syncToolbarFields();
      closeActiveInlineEditor();
    });
  } else {
    stem = createInlineDisplay(
      "div",
      `question-stem preview-editable${selectedStem ? " selected" : ""}`,
      `${question.number}. ${question.stem}`,
      commitStemEdit,
      { renderAnnotations: true, selection: `question:${question.id}`, multiline: true, subject: question.subject }
    );
  }

  const choicesWrap = document.createElement("div");
  const columns = detectChoiceColumns(question, width);
  choicesWrap.className = `choices-wrap ${columns > 1 ? "cols-" + columns : ""}`;
  question.choices
    .filter((choice) => choice.text.trim())
    .forEach((choice, index) => {
      const choiceItem = document.createElement("div");
      const selectedThisChoice = selectedChoice && selection.choiceIndex === index;
      choiceItem.className = `choice-item${selectedThisChoice ? " selected" : ""}`;
      choiceItem.addEventListener("click", (event) => {
        event.stopPropagation();
        state.ui.selected = `choice:${question.id}:${index}`;
        _cbs.syncToolbarFields();
        closeActiveInlineEditor();
        renderPages();
      });
      const label = document.createElement("span");
      label.className = "choice-label";
      label.textContent = `${String.fromCharCode(65 + index)}.`;
      const text = createInlineDisplay(
        "span",
        `choice-text preview-editable${selectedThisChoice ? " selected" : ""}`,
        choice.text,
        (value) => {
          choice.text = value;
          rerenderPreview("Choice edited on paper", { syncEditors: true });
        },
        { selection: `choice:${question.id}:${index}`, multiline: false, renderAnnotations: true, subject: question.subject }
      );
      choiceItem.append(label, text);
      choicesWrap.append(choiceItem);
    });

  const imageLayer = buildImageLayer();
  const passageLayer = buildPassageLayer();
  const hasMedia = imageLayer || passageLayer;

  const imageMode = question.imagePosition || "top";
  const passageMode = question.passagePosition || "top";
  const mode = imageLayer ? imageMode : passageMode;
  const layout = imageLayer ? imageLayout : passageLayout;
  questionGroup.style.minHeight = `${layout.minHeight}px`;

  function absImageContainer(el, box) {
    const c = document.createElement("div");
    c.style.position = "relative";
    c.style.minHeight = `${(box.y || 0) + box.height}px`;
    el.style.position = "absolute";
    el.style.left = `${box.x}px`;
    el.style.top = `${box.y}px`;
    c.append(el);
    return c;
  }

  if (mode === "top") {
    if (hasMedia) questionGroup.style.overflow = "visible";
    if (imageLayer) {
      imageLayer.style.position = "absolute";
      imageLayer.style.left = `${layout.box.x}px`;
      imageLayer.style.top = `${layout.box.y}px`;
      questionGroup.append(imageLayer);
    }
    if (passageLayer) {
      passageLayer.style.marginBottom = "8px";
      questionGroup.append(passageLayer);
    }
    const copy = document.createElement("div");
    copy.className = "question-copy";
    copy.style.paddingTop = `${layout.paddings.top}px`;
    copy.append(stem);
    copy.append(choicesWrap);
    questionGroup.append(copy);
  } else if (mode === "left") {
    if (hasMedia) {
      questionGroup.style.overflow = "visible";
      const row = document.createElement("div");
      row.className = "question-media-row";
      const p = document.createElement("div");
      p.style.flexShrink = "0";
      p.style.overflow = "visible";
      if (imageLayer) {
        const box = layout.box;
        p.style.minWidth = `${Math.max(box.width, (box.x || 0) + box.width)}px`;
        p.style.minHeight = `${Math.max(box.height, (box.y || 0) + box.height)}px`;
        p.append(passageLayer || document.createElement("span"));
      } else if (passageLayer) {
        p.append(passageLayer);
      }
      const col = document.createElement("div");
      col.style.flex = "1";
      col.style.minWidth = "0";
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.append(stem, choicesWrap);
      row.append(p, col);
      questionGroup.append(row);
      if (imageLayer) {
        const box = layout.box;
        imageLayer.style.left = `${box.x}px`;
        imageLayer.style.top = `${box.y}px`;
        questionGroup.append(imageLayer);
      }
    } else {
      questionGroup.append(stem);
      questionGroup.append(choicesWrap);
    }
  } else if (mode === "right") {
    if (hasMedia) {
      questionGroup.style.overflow = "visible";
      if (imageLayer) {
        const box = layout.box;
        if (!box.x || box.x === 0) box.x = Math.max(0, width - box.width);
      }
      const row = document.createElement("div");
      row.className = "question-media-row";
      const col = document.createElement("div");
      col.style.flex = "1";
      col.style.minWidth = "0";
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.append(stem, choicesWrap);
      const p = document.createElement("div");
      p.style.flexShrink = "0";
      p.style.overflow = "visible";
      if (imageLayer) {
        const box = layout.box;
        p.style.minWidth = `${Math.min(width, Math.max(box.width, width - box.x + 12))}px`;
        p.style.minHeight = `${Math.max(box.height, (box.y || 0) + box.height)}px`;
        p.append(passageLayer || document.createElement("span"));
      } else if (passageLayer) {
        p.append(passageLayer);
      }
      row.append(col, p);
      questionGroup.append(row);
      if (imageLayer) {
        const box = layout.box;
        imageLayer.style.left = `${box.x}px`;
        imageLayer.style.top = `${box.y}px`;
        questionGroup.append(imageLayer);
      }
    } else {
      questionGroup.append(stem);
      questionGroup.append(choicesWrap);
    }
  } else if (mode === "bottom-left") {
    questionGroup.append(stem);
    if (hasMedia) {
      questionGroup.style.overflow = "visible";
      const row = document.createElement("div");
      row.className = "question-media-row";
      const p = document.createElement("div");
      p.style.flexShrink = "0";
      p.style.overflow = "visible";
      if (imageLayer) {
        const box = layout.box;
        p.style.minWidth = `${Math.max(box.width, (box.x || 0) + box.width)}px`;
        p.style.minHeight = `${Math.max(box.height, (box.y || 0) + box.height)}px`;
        p.append(passageLayer || document.createElement("span"));
      } else if (passageLayer) {
        p.append(passageLayer);
      }
      const chDiv = document.createElement("div");
      chDiv.style.flex = "1";
      chDiv.style.minWidth = "0";
      chDiv.append(choicesWrap);
      row.append(p, chDiv);
      questionGroup.append(row);
      if (imageLayer) {
        const box = layout.box;
        imageLayer.style.left = `${box.x}px`;
        imageLayer.style.top = `${box.y}px`;
        questionGroup.append(imageLayer);
      }
    } else {
      questionGroup.append(choicesWrap);
    }
  } else if (mode === "bottom-right") {
    questionGroup.append(stem);
    if (hasMedia) {
      questionGroup.style.overflow = "visible";
      if (imageLayer) {
        const box = layout.box;
        if (!box.x || box.x === 0) box.x = Math.max(0, width - box.width);
      }
      const row = document.createElement("div");
      row.className = "question-media-row";
      const chDiv = document.createElement("div");
      chDiv.style.flex = "1";
      chDiv.style.minWidth = "0";
      chDiv.append(choicesWrap);
      const p = document.createElement("div");
      p.style.flexShrink = "0";
      p.style.overflow = "visible";
      if (imageLayer) {
        const box = layout.box;
        p.style.minWidth = `${Math.min(width, Math.max(box.width, width - box.x + 12))}px`;
        p.style.minHeight = `${Math.max(box.height, (box.y || 0) + box.height)}px`;
        p.append(passageLayer || document.createElement("span"));
      } else if (passageLayer) {
        p.append(passageLayer);
      }
      row.append(chDiv, p);
      questionGroup.append(row);
      if (imageLayer) {
        const box = layout.box;
        imageLayer.style.left = `${box.x}px`;
        imageLayer.style.top = `${box.y}px`;
        questionGroup.append(imageLayer);
      }
    } else {
      questionGroup.append(choicesWrap);
    }
  } else if (mode === "bottom") {
    questionGroup.append(stem);
    if (imageLayer) {
      const c = absImageContainer(imageLayer, layout.box);
      c.style.margin = "4px 0";
      questionGroup.append(c);
    }
    if (passageLayer) {
      passageLayer.style.margin = "4px 0";
      questionGroup.append(passageLayer);
    }
    questionGroup.append(choicesWrap);
  }
  wrapper.append(questionGroup);
  return wrapper;
}

export function measureQuestionHeights(columnWidth) {
  const root = document.createElement("div");
  root.className = "hidden-measurement-root";
  document.body.append(root);
  const heightsNoGap = {};
  state.questions.forEach((question) => {
    const preview = createQuestionPreview(question, columnWidth);
    preview.style.width = `${columnWidth}px`;
    root.append(preview);
    preview.style.marginBottom = "0px";
    heightsNoGap[question.id] = preview.getBoundingClientRect().height;
  });
  root.remove();
  return { heightsNoGap };
}

export function getTitleHeight() {
  const titleSize = Number(state.template.titleBlock.style.fontSize) || 16;
  const instructionSize = Number(state.template.instructionBlock.style.fontSize) || 10.5;
  const instructionLines = (state.template.instructionBlock.text || "").split("\n").filter(Boolean).length || 1;
  return titleSize * 1.1 + instructionSize * (instructionLines * 0.95 + 0.15) + 4;
}

export function measureTitleInstructionHeight() {
  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.left = '-9999px';
  root.style.top = '0px';
  root.style.visibility = 'hidden';
  root.style.width = `${PAGE.width}px`;
  document.body.append(root);

  const title = document.createElement('div');
  Object.assign(title.style, textStyleToCss(state.template.titleBlock.style));
  title.style.width = `${PAGE.width}px`;
  title.style.textAlign = 'center';
  title.textContent = state.template.titleBlock.text;
  root.append(title);

  const titleH = title.getBoundingClientRect().height;

  const instr = document.createElement('div');
  Object.assign(instr.style, textStyleToCss(state.template.instructionBlock.style));
  instr.style.width = `${PAGE.width}px`;
  instr.style.textAlign = 'center';
  const instrHtml = (state.template.instructionBlock.text || "")
    .replace(/<div>/gi, "<br>")
    .replace(/<\/div>/gi, "")
    .replace(/^<br>/i, "");
  instr.innerHTML = instrHtml;
  root.append(instr);

  const instrH = instr.getBoundingClientRect().height;

  root.remove();
  const titleInstructionGap = 0;
  return Math.round(titleH + titleInstructionGap + instrH);
}

export function getEffectiveHeaderHeight() {
  if (!state.template.headerImage.dataUrl) {
    return Number.isFinite(Number(state.template.footerBox?.height))
      ? Number(state.template.footerBox.height)
      : defaultState.template.footerBox.height;
  }
  return Number.isFinite(Number(state.template.headerBox?.height))
    ? Number(state.template.headerBox.height)
    : defaultState.template.headerBox.height;
}

export function getEffectiveHeaderBase() {
  const headerY = Number.isFinite(Number(state.template.headerBox?.y))
    ? Number(state.template.headerBox.y)
    : state.template.pageMargins.top;
  return headerY + getEffectiveHeaderHeight();
}

export function getFooterCollisionTop(sourceState = state) {
  const footerTop = Number.isFinite(Number(sourceState.template.footerBox?.y))
    ? Number(sourceState.template.footerBox.y)
    : PAGE.height - sourceState.template.pageMargins.bottom;
  const footerHeight = Number.isFinite(Number(sourceState.template.footerBox?.height))
    ? Number(sourceState.template.footerBox.height)
    : defaultState.template.footerBox.height;
  if (!sourceState.template.footerImage?.dataUrl) return footerTop;
  return footerTop + footerHeight * 0.45;
}

export function textStyleToCss(style) {
  return {
    fontFamily: style.fontFamily || "Arial",
    fontSize: `${style.fontSize || 12}px`,
    fontWeight: style.bold ? "700" : "400",
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none"
  };
}

export function createInteractiveFrame(kind, styleBox, extra = {}) {
  const frame = document.createElement("div");
  frame.className = `canvas-frame ${state.ui.selected === kind ? "selected" : ""}`;
  frame.dataset.kind = kind;
  Object.assign(frame.style, styleBox);
  if (extra.html) frame.innerHTML = extra.html;
  if (extra.text) frame.textContent = extra.text;
  frame.addEventListener("pointerdown", (event) => startDragAction(event, frame));
  frame.addEventListener("click", (event) => {
    event.stopPropagation();
    state.ui.selected = kind;
    _cbs.syncToolbarFields();
    // ── Close any previously open editor after the new selection is set ──
    closeActiveInlineEditor();
    renderPages();
  });
  return frame;
}

export function createEmptyPage(columnCount, columnHeight, contentTop = 0, pageIndex = 0) {
  return {
    pageIndex,
    cursor: 0,
    contentTop,
    columns: Array.from({ length: columnCount }, () => []),
    remainingHeights: Array.from({ length: columnCount }, () => columnHeight)
  };
}

export function paginateQuestions() {
  const margins = state.template.pageMargins;
  const contentWidth = PAGE.width - margins.left - margins.right;
  const columnCount = state.pageLayout.bodyLayoutMode === "two-column-compact" ? 2 : 1;
  const columnGap = columnCount === 2 ? state.pageLayout.columnGap : 0;
  const columnWidth = (contentWidth - columnGap) / columnCount;
  const headerClearance = 1;
  const headerBase = getEffectiveHeaderBase();
  const titleStartY = headerBase + headerClearance;
  const titleInstrHeight = measureTitleInstructionHeight();
  const instructionGap = 3;
  const firstPageContentTop = titleStartY + titleInstrHeight + instructionGap;
  const continuationContentTop = headerBase + headerClearance;
  const footerTop = getFooterCollisionTop(state);
  const footerBuffer = Number.isFinite(Number(state.pageLayout.footerBufferPx)) ? Number(state.pageLayout.footerBufferPx) : 4;
  const earliestContentTop = Math.min(firstPageContentTop, continuationContentTop);
  const footerReserve = Math.max(earliestContentTop + 16, footerTop - footerBuffer);
  const contentBottom = Math.min(footerReserve, PAGE.height - state.template.pageMargins.bottom);
  const SAFETY_PIXELS = (state.pageLayout && typeof state.pageLayout.safetyPixels === 'number') ? state.pageLayout.safetyPixels : 1;
  const firstPageColumnHeight = Math.max(60, contentBottom - firstPageContentTop - SAFETY_PIXELS);
  const continuationColumnHeight = Math.max(60, contentBottom - continuationContentTop - SAFETY_PIXELS);
  const measured = measureQuestionHeights(columnWidth);
  const heightsNoGap = measured.heightsNoGap;

  const pages = [];
  let currentPage = createEmptyPage(columnCount, firstPageColumnHeight, firstPageContentTop, 0);
  pages.push(currentPage);

  state.questions.forEach((question) => {
    const rawNoGap = heightsNoGap[question.id] || 0;
    const questionHeight = Math.ceil(rawNoGap) + SAFETY_PIXELS;
    let placed = false;
    while (!placed) {
      const columnIndex = currentPage.cursor;
      const remainingHeight = currentPage.remainingHeights[columnIndex];
      const targetColumn = currentPage.columns[columnIndex];
      const columnGap = getQuestionGapForColumn(currentPage.pageIndex, columnIndex);
      const requiredHeight = questionHeight + (targetColumn.length > 0 ? columnGap : 0);
      if (requiredHeight <= remainingHeight || targetColumn.length === 0) {
        targetColumn.push(question);
        currentPage.remainingHeights[columnIndex] -= requiredHeight;
        placed = true;
      } else {
        const contentNoGap = Math.ceil(rawNoGap);
        const TOLERANCE = 6;
        const requiredNoGap = contentNoGap + (targetColumn.length > 0 ? columnGap : 0);
        if (requiredNoGap <= remainingHeight) {
          targetColumn.push(question);
          currentPage.remainingHeights[columnIndex] -= requiredNoGap;
          placed = true;
          break;
        }
        if (requiredNoGap <= remainingHeight + TOLERANCE) {
          const finalUsedHeight = Math.min(requiredNoGap, remainingHeight);
          targetColumn.push(question);
          currentPage.remainingHeights[columnIndex] -= finalUsedHeight;
          placed = true;
          break;
        }
        if (currentPage.cursor < columnCount - 1) {
          currentPage.cursor += 1;
        } else {
          currentPage = createEmptyPage(columnCount, continuationColumnHeight, continuationContentTop, pages.length);
          pages.push(currentPage);
        }
      }
    }
  });

  return {
    pages,
    metrics: { contentTop: firstPageContentTop, firstPageContentTop, continuationContentTop, contentWidth, contentBottom, columnCount, columnWidth, columnGap, margins }
  };
}

export function renderPages() {
  let pages = [];
  let metrics = null;
  try {
    const result = paginateQuestions();
    pages = result.pages || [];
    metrics = result.metrics || null;
  } catch (err) {
    console.error("paginateQuestions failed:", err);
  }
  if (!metrics) {
    const margins = state.template.pageMargins;
    metrics = {
      contentTop: margins.top + HALF_INCH,
      contentWidth: PAGE.width - margins.left - margins.right,
      contentBottom: PAGE.height - margins.bottom - HALF_INCH,
      columnCount: 1,
      columnWidth: PAGE.width - margins.left - margins.right,
      columnGap: 0,
      margins
    };
  }
  uiState.currentPagination = { pages, metrics };
  const stack = document.createElement("div");
  stack.className = "page-stack";

  pages.forEach((page, pageIndex) => {
    const pageElement = document.createElement("article");
    pageElement.className = "exam-page";
    pageElement.dataset.pageIndex = pageIndex;
    pageElement.innerHTML = `<div class="page-ruler"></div><div class="page-content"></div>`;
    const content = pageElement.querySelector(".page-content");

    // ── Page background click: close editor + deselect ──────────────────
    pageElement.addEventListener("click", () => {
      state.ui.selected = null;
      _cbs.syncToolbarFields();
      closeActiveInlineEditor();
      renderPages();
    });

    {
      if (!state.template.headerImage.dataUrl) {
        state.template.headerBox.height = getEffectiveHeaderHeight();
      }

      const header = createInteractiveFrame("header", {
        left: `${state.template.headerBox.x}px`,
        top: `${state.template.headerBox.y}px`,
        width: `${state.template.headerBox.width}px`,
        height: `${state.template.headerBox.height}px`
      });
      if (state.template.headerImage.dataUrl) {
        header.innerHTML = `<img class="page-header-image" src="${state.template.headerImage.dataUrl}" alt="" /><span class="resize-handle"></span>`;
      } else {
        header.classList.add('footer-helper');
        header.innerHTML = `<div class="footer-helper-label">Header (helper)</div><span class="resize-handle"></span>`;
      }
      content.append(header);
    }

    if (pageIndex === 0) {
      const headerBase = getEffectiveHeaderBase();
      const headerBufferPix = 1;
      const titleTopY = headerBase + headerBufferPix;

      const titleBlock = document.createElement("div");
      titleBlock.className = "page-title-block";
      Object.assign(titleBlock.style, textStyleToCss(state.template.titleBlock.style));
      titleBlock.style.top = `${titleTopY}px`;
      titleBlock.style.textAlign = state.template.titleBlock.style.textAlign || "center";
      titleBlock.innerHTML = state.template.titleBlock.text || "";
      content.append(titleBlock);

      const titleMeasureRoot = document.createElement('div');
      titleMeasureRoot.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;width:794px';
      document.body.append(titleMeasureRoot);
      const titleMeasureEl = document.createElement('div');
      Object.assign(titleMeasureEl.style, textStyleToCss(state.template.titleBlock.style));
      titleMeasureEl.style.width = '794px';
      titleMeasureEl.innerHTML = state.template.titleBlock.text || "";
      titleMeasureRoot.append(titleMeasureEl);
      const titleActualHeight = Math.round(titleMeasureEl.getBoundingClientRect().height) || 20;
      titleMeasureRoot.remove();

      const titleInstructionGap = 0;
      const instructionBlock = document.createElement("div");
      instructionBlock.className = "page-instruction-block";
      Object.assign(instructionBlock.style, textStyleToCss(state.template.instructionBlock.style));
      instructionBlock.style.top = `${titleTopY + titleActualHeight + titleInstructionGap}px`;
      const instrHtml = (state.template.instructionBlock.text || "")
        .replace(/<div>/gi, "<br>")
        .replace(/<\/div>/gi, "")
        .replace(/^<br>/i, "");
      instructionBlock.innerHTML = instrHtml;
      content.append(instructionBlock);
    }

    if (state.watermark.image.dataUrl) {
      const watermark = document.createElement("div");
      watermark.className = "watermark-layer";
      const image = document.createElement("img");
      image.className = "watermark-image";
      image.src = state.watermark.image.dataUrl;
      image.style.opacity = state.watermark.opacity;
      image.style.filter = `grayscale(1) brightness(${state.watermark.darkness}) contrast(${state.watermark.contrast})`;
      image.style.transform = `scale(${state.watermark.scale})`;
      watermark.append(image);
      content.append(watermark);
    }

    const columns = document.createElement("div");
    columns.className = `page-columns ${metrics.columnCount === 2 ? "two-col" : "one-col"}`;
    const pageContentTop = Number.isFinite(Number(page.contentTop)) ? Number(page.contentTop) : metrics.contentTop;
    columns.style.top = `${pageContentTop}px`;
    columns.style.left = `${metrics.margins.left}px`;
    columns.style.width = `${metrics.contentWidth}px`;
    columns.style.height = `${metrics.contentBottom - pageContentTop}px`;
    columns.style.gap = `${metrics.columnGap}px`;
    page.columns.forEach((items, columnIndex) => {
      const col = document.createElement("div");
      const selectedColumn = state.ui.selected === `column:${pageIndex}:${columnIndex}`;
      col.className = `page-column${selectedColumn ? " selected" : ""}`;
      col.dataset.pageIndex = pageIndex;
      col.dataset.columnIndex = columnIndex;
      col.style.gap = `${getQuestionGapForColumn(pageIndex, columnIndex)}px`;
      col.addEventListener("click", (event) => {
        event.stopPropagation();
        state.ui.selected = `column:${pageIndex}:${columnIndex}`;
        _cbs.syncToolbarFields();
        // ── Close any previously open editor after the new selection is set ──
        closeActiveInlineEditor();
        renderPages();
      });
      items.forEach((question) => col.append(createQuestionPreview(question, metrics.columnWidth)));
      columns.append(col);
    });
    content.append(columns);

    {
      const footer = createInteractiveFrame("footer", {
        left: `${state.template.footerBox.x}px`,
        top: `${state.template.footerBox.y}px`,
        width: `${state.template.footerBox.width}px`,
        height: `${state.template.footerBox.height}px`
      });
      if (state.template.footerImage.dataUrl) {
        footer.innerHTML = `<img class="page-footer-image" src="${state.template.footerImage.dataUrl}" alt="" /><span class="resize-handle"></span>`;
      } else {
        footer.classList.add('footer-helper');
        footer.innerHTML = `<div class="footer-helper-label">Footer (helper)</div><span class="resize-handle"></span>`;
      }
      content.append(footer);
    }

    if (state.template.pageNumberConfig.visible) {
      const pageNumber = createInteractiveFrame(
        "page-number",
        {
          left: `${state.template.pageNumberConfig.x}px`,
          top: `${state.template.pageNumberConfig.y}px`,
          fontSize: `${state.template.pageNumberConfig.fontSize}px`
        },
        { text: `${pageIndex + 1}` }
      );
      pageNumber.classList.add("page-number-frame");
      pageNumber.innerHTML = `<span class="page-number-text">${pageIndex + 1}</span><span class="resize-handle"></span>`;
      content.append(pageNumber);
    }

    stack.append(pageElement);
  });

  elements.pagePreview.innerHTML = "";
  elements.pagePreview.append(stack);
  if (Number(state.pageLayout.headerBufferPx) === 0 && Number(state.pageLayout.footerBufferPx) === 0) {
    elements.pagePreview.style.padding = '0px';
  } else {
    elements.pagePreview.style.padding = '28px';
  }
  Array.from(stack.querySelectorAll('.exam-page')).forEach((pg) => {
    const footerEl = pg.querySelector('.canvas-frame[data-kind="footer"]');
    if (!footerEl) return;
    const footerRect = footerEl.getBoundingClientRect();
    const collisionTop = footerRect.top + (state.template.footerImage?.dataUrl ? footerRect.height * 0.45 : 0);
    const qEls = Array.from(pg.querySelectorAll('.question-preview'));
    const overlapped = qEls.some((q) => {
      const r = q.getBoundingClientRect();
      return r.bottom > collisionTop;
    });
    if (overlapped) footerEl.classList.add('footer-overlap');
    else footerEl.classList.remove('footer-overlap');
  });
  if (elements.pageCount) elements.pageCount.textContent = `${pages.length} page${pages.length > 1 ? "s" : ""}`;
  
  // Apply the current zoom level after pages are fully rendered
  try {
    applyPreviewZoom();
  } catch (e) {
    console.error("applyPreviewZoom failed", e);
  }
}
