import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  FONT_OPTIONS,
  SUBJECT_OPTIONS,
  QUESTIONS_API,
  PAGE,
  QUESTION_IMAGE_MAX_DIMENSION,
  QUESTION_IMAGE_JPEG_QUALITY,
  PX_PER_INCH,
  HALF_INCH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  PAGE_MIN_WIDTH,
  defaultState
} from './js/config.js';

import {
  clamp,
  clampNonNegativeInteger,
  escapeHtml,
  escapeHtmlAttribute,
  normalizeTextForSearch,
  normalizeColumnQuestionGaps,
  mergeState,
  createChoice
} from './js/utils.js';

import {
  state,
  reassignState,
  loadState,
  saveState,
  normalizeState,
  normalizeQuestionRecord,
  createQuestionTemplate,
  setQuestionCorrectChoice,
  resizeQuestionsToCount,
  applyExamDetailsToQuestions,
  getHeaderAspectRatio,
  fitHeaderBoxToAspect,
  getFooterAspectRatio,
  fitFooterBoxToAspect,
  autoReserveFooterSpace,
  placeHeaderImage,
  placeFooterImage,
  undo,
  redo,
  historyIndex,
  historyStack,
  registerStateCallbacks,
  normalizeNumbers,
  addQuestionFromTemplate,
  saveConfirmKnownName,
  setSaveConfirmKnownName
} from './js/state.js';

import {
  checkDuplicateQuestionsOnServer,
  fetchQuestions,
  putQuestion,
  postQuestion,
  deleteQuestionFromServer,
  bulkInsertQuestions,
  exportPdfOnServer
} from './js/api.js';

import { initCsvImport } from './js/csv-import.js';

import {
  readImageFile,
  readQuestionImageFile,
  readFileAsDataUrl
} from './js/image-utils.js';

import {
  getSelectionInfo,
  getSelectedQuestionGapValue,
  getQuestionGapScopeText,
  setQuestionGapForSelection
} from './js/layout.js';

import {
  startSidebarResize,
  startDatabaseSidebarResize,
  registerDragCallbacks
} from './js/drag.js';

import {
  renderPages,
  renderQuestionEditors,
  registerRendererCallbacks,
  updateFileInputLabel,
  rerenderPreview,
  closeActiveInlineEditor,
  openInlineEditorAfterRender
} from './js/renderer.js';

import {
  registerDatabaseCallbacks,
  fetchDatabaseQuestions,
  openDatabaseModal,
  closeDatabaseModal,
  renderDatabaseList,
  fillDatabaseForm,
  createDatabaseQuestionDraft,
  setDatabaseStatus,
  setDatabaseFormEditable,
  saveDatabaseFormQuestion,
  deleteSelectedDatabaseQuestion,
  useSelectedDatabaseQuestionInBuilder,
  closeDuplicateSaveModal,
  closeSaveConfirmModal,
  openSaveConfirmModal,
  saveQuestionToDatabase,
  getSelectedDatabaseQuestion,
  syncDatabaseFilters
} from './js/database.js';

import { uiState } from './js/ui-state.js';
import { initCustomSelects } from './js/custom-select.js';

const navButtons = document.querySelectorAll(".nav-btn");

export const elements = {
  body: document.body,
  status: document.querySelector("#status-pill"),
  pagePreview: document.querySelector("#page-preview"),
  pageCount: document.querySelector("#page-count-label"),
  questionList: document.querySelector("#question-list"),
  questionTemplate: document.querySelector("#question-editor-template"),
  projectImport: document.querySelector("#project-import"),
  sidebarResizer: document.querySelector("[data-sidebar-resizer]"),
  databaseSidebarResizer: document.querySelector("#database-sidebar-resizer"),
  themeToggle: document.querySelector("#theme-toggle-btn"),
  addQuestion: document.querySelector("#add-question-btn"),
  downloadProject: document.querySelector("#download-project-btn"),
  exportPdf: document.querySelector("#export-pdf-btn"),
  undoBtn: document.querySelector("#undo-btn"),
  redoBtn: document.querySelector("#redo-btn"),
  fontFamily: document.querySelector("#global-font-family"),
  bodyLayoutMode: null,
  layoutSingleBtn: document.querySelector("#layout-single-btn"),
  layoutTwoBtn: document.querySelector("#layout-two-btn"),
  layoutAddBtn: document.querySelector("#layout-add-btn"),
  layoutPillToggle: document.querySelector(".layout-pill-toggle"),
  headerImageInput: document.querySelector("#header-image-input"),
  examSubjectInput: document.querySelector("#exam-subject-input"),
  examTypeInput: document.querySelector("#exam-type-input"),
  examNumberInput: document.querySelector("#exam-number-input"),
  pageMarginLeftInput: document.querySelector("#page-margin-left-input"),
  pageMarginRightInput: document.querySelector("#page-margin-right-input"),
  questionGapInput: document.querySelector("#question-gap-input"),
  questionGapScopeLabel: document.querySelector("#question-gap-scope-label"),
  columnGapField: document.querySelector("#column-gap-field"),
  columnGapInput: document.querySelector("#column-gap-input"),
  questionFontFamilyInput: document.querySelector("#question-font-family-input"),
  questionFontSizeInput: document.querySelector("#question-font-size-input"),
  titleTextInput: document.querySelector("#title-text-input"),
  instructionTextInput: document.querySelector("#instruction-text-input"),
  titleFormatBtns: document.querySelectorAll(".title-editor-toolbar .passage-tool-btn[data-cmd]"),
  instructionFormatBtns: document.querySelectorAll(".instruction-editor-toolbar .passage-tool-btn[data-cmd]"),
  titleFontsizeDisplay: document.querySelector(".title-fontsize-display"),
  instructionFontsizeDisplay: document.querySelector(".instruction-fontsize-display"),
  titleAlignBtns: document.querySelectorAll(".title-align-btn"),
  instructionAlignBtns: document.querySelectorAll(".instruction-align-btn"),
  questionCorrectAnswerInput: document.querySelector("#question-correct-answer-input"),
  questionExplanationInput: document.querySelector("#question-explanation-input"),
  watermarkImageInput: document.querySelector("#watermark-image-input"),
  watermarkControls: document.querySelector("#watermark-controls"),
  watermarkOpacityInput: document.querySelector("#watermark-opacity-input"),
  watermarkScaleInput: document.querySelector("#watermark-scale-input"),
  watermarkDarknessInput: document.querySelector("#watermark-darkness-input"),
  watermarkContrastInput: document.querySelector("#watermark-contrast-input"),
  footerImageInput: document.querySelector("#footer-image-input"),
  databaseQuestionsButton: document.querySelector("#database-questions-btn"),
  databaseModal: document.querySelector("#database-modal"),
  databaseModalClose: document.querySelector("#database-modal-close"),
  databaseModalStatus: document.querySelector("#database-modal-status"),
  databaseRefresh: document.querySelector("#database-refresh-btn"),
  databaseNew: document.querySelector("#database-new-btn"),
  databaseSearchInput: document.querySelector("#database-search-input"),
  databaseFilterTopic: document.querySelector("#database-filter-topic"),
  databaseFilterSubject: document.querySelector("#database-filter-subject"),
  databaseFilterExamType: document.querySelector("#database-filter-exam-type"),
  databaseList: document.querySelector("#database-question-list"),
  databaseForm: document.querySelector("#database-question-form"),
  databaseId: document.querySelector("#database-question-id"),
  databaseSubject: document.querySelector("#database-question-subject"),
  databaseTopic: document.querySelector("#database-question-topic"),
  databaseSourceExamType: document.querySelector("#database-source-exam-type"),
  databaseSourceExamNumber: document.querySelector("#database-source-exam-number"),
  databaseSavedBy: document.querySelector("#database-saved-by"),
  databaseSavedAt: document.querySelector("#database-saved-at"),
  databaseStem: document.querySelector("#database-question-stem"),
  databaseChoices: document.querySelector("#database-choice-list"),
  databaseCorrect: document.querySelector("#database-question-correct"),
  databaseExplanation: document.querySelector("#database-question-explanation"),
  databaseUse: document.querySelector("#database-use-btn"),
  databaseEdit: document.querySelector("#database-edit-btn"),
  databaseDelete: document.querySelector("#database-delete-btn"),
  databaseSave: document.querySelector("#database-save-btn"),
  duplicateSaveModal: document.querySelector("#duplicate-save-modal"),
  duplicateSaveClose: document.querySelector("#duplicate-save-close"),
  duplicateSaveCancel: document.querySelector("#duplicate-save-cancel"),
  duplicateSaveConfirm: document.querySelector("#duplicate-save-confirm"),
  duplicateIncomingMeta: document.querySelector("#duplicate-incoming-meta"),
  duplicateIncomingStem: document.querySelector("#duplicate-incoming-stem"),
  duplicateExistingMeta: document.querySelector("#duplicate-existing-meta"),
  duplicateExistingStem: document.querySelector("#duplicate-existing-stem"),
  duplicateMatchList: document.querySelector("#duplicate-match-list"),
  saveConfirmModal: document.querySelector("#save-confirm-modal"),
  saveConfirmClose: document.querySelector("#save-confirm-close"),
  saveConfirmCancel: document.querySelector("#save-confirm-cancel"),
  saveConfirmSubmit: document.querySelector("#save-confirm-submit"),
  saveConfirmDetails: document.querySelector("#save-confirm-details"),
  saveConfirmName: document.querySelector("#save-confirm-name"),
  saveConfirmSkip: document.querySelector("#save-confirm-skip"),
  saveConfirmError: document.querySelector("#save-confirm-error"),
  exportIssueModal: document.querySelector("#export-issue-modal"),
  exportIssueClose: document.querySelector("#export-issue-close"),
  exportIssueMessage: document.querySelector("#export-issue-message"),
  panels: Array.from(document.querySelectorAll(".panel-section")),
  // CSV bulk import
  csvFileInput: document.querySelector("#csv-file-input"),
  csvBulkImportBtn: document.querySelector("#database-bulk-import-btn"),
  csvMetadataModal: document.querySelector("#csv-metadata-modal"),
  csvMetadataClose: document.querySelector("#csv-metadata-close"),
  csvMetadataCancel: document.querySelector("#csv-metadata-cancel"),
  csvMetadataSubmit: document.querySelector("#csv-metadata-submit"),
  csvSubjectInput: document.querySelector("#csv-subject-input"),
  csvExamTypeInput: document.querySelector("#csv-exam-type-input"),
  csvExamNumberInput: document.querySelector("#csv-exam-number-input"),
  csvSavedByInput: document.querySelector("#csv-saved-by-input"),
  csvPreviewInfo: document.querySelector("#csv-preview-info"),
  csvMetadataError: document.querySelector("#csv-metadata-error")
};

let questionsRemoteAvailable = true;
let questionSyncTimer = null;

export function setStatus(text) {
  if (elements.status) elements.status.textContent = text;
}

export function queueQuestionSync(statusText = "Questions saved") {
  saveState(statusText);
  setStatus(statusText);
}

export function updateHistoryButtons() {
  if (elements.undoBtn) elements.undoBtn.disabled = historyIndex <= 0;
  if (elements.redoBtn) elements.redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

function populateFontSelect(select) {
  if (!select || select.options.length) return;
  FONT_OPTIONS.forEach((font) => {
    const option = document.createElement("option");
    option.value = font;
    option.textContent = font;
    select.append(option);
  });
}

function showExportIssueModal(message) {
  if (!elements.exportIssueModal) {
    setStatus(message);
    return;
  }
  if (elements.exportIssueMessage) elements.exportIssueMessage.textContent = message;
  elements.exportIssueModal.hidden = false;
}

function hideExportIssueModal() {
  if (elements.exportIssueModal) elements.exportIssueModal.hidden = true;
}

function getExportBlockingIssue() {
  renderPages();
  const overflowPages = Array.from(elements.pagePreview.querySelectorAll(".exam-page"))
    .filter((page) => page.querySelector(".canvas-frame.footer-overlap"))
    .map((page) => Number(page.dataset.pageIndex || 0) + 1);
  if (!overflowPages.length) return "";
  return `May content na tumatama sa footer sa page ${overflowPages.join(", ")}. Ayusin muna yung spacing, footer position, o page layout bago mag-export.`;
}

export function applyTheme() {
  elements.body.dataset.theme = state.themeMode;
}

// Wire callbacks
registerStateCallbacks({ setStatus, applyTheme, updateHistoryButtons: () => updateHistoryButtons(), render });
registerRendererCallbacks({ syncToolbarFields, setStatus, queueQuestionSync });
registerDragCallbacks({ renderPages, applySidebarWidth });
registerDatabaseCallbacks({ addQuestionFromTemplate, render, setStatus });

function getSidebarWidthBounds() {
  const availableWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
  const maxWidth = Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, availableWidth - PAGE_MIN_WIDTH - 32)
  );
  return { min: SIDEBAR_MIN_WIDTH, max: maxWidth };
}

function applySidebarWidth(width = state.ui.sidebarWidth) {
  const { min, max } = getSidebarWidthBounds();
  const nextWidth = clamp(Math.round(Number(width) || SIDEBAR_DEFAULT_WIDTH), min, max);
  state.ui.sidebarWidth = nextWidth;
  document.documentElement.style.setProperty("--sidebar-width", `${nextWidth}px`);
  return nextWidth;
}

function syncToolbarFields() {
  populateFontSelect(elements.fontFamily);
  populateFontSelect(elements.questionFontFamilyInput);
  const isTwoColumn = state.pageLayout.bodyLayoutMode === "two-column-compact";
  elements.fontFamily.value = state.template.titleBlock.style.fontFamily;
  if (elements.questionFontFamilyInput) elements.questionFontFamilyInput.value = state.questionStyle.fontFamily;
  if (elements.questionFontSizeInput) elements.questionFontSizeInput.value = Number(state.questionStyle.fontSize).toFixed(1);
  if (elements.layoutSingleBtn) elements.layoutSingleBtn.classList.toggle("active", !isTwoColumn);
  if (elements.layoutTwoBtn) elements.layoutTwoBtn.classList.toggle("active", isTwoColumn);
  if (elements.layoutPillToggle) elements.layoutPillToggle.dataset.active = isTwoColumn ? "two" : "single";
  elements.examSubjectInput.value = state.examDetails.subject;
  elements.examTypeInput.value = state.examDetails.examType;
  if (state.examDetails.examType === 'mock test') {
    elements.examNumberInput.value = "";
    elements.examNumberInput.disabled = true;
  } else {
    elements.examNumberInput.value = state.examDetails.examNumber;
    elements.examNumberInput.disabled = false;
  }
  elements.pageMarginLeftInput.value = Number(state.template.pageMargins.left).toFixed(1);
  elements.pageMarginRightInput.value = Number(state.template.pageMargins.right).toFixed(1);
  if (elements.questionGapInput) {
    elements.questionGapInput.value = Number(getSelectedQuestionGapValue()).toFixed(1);
  }
  if (elements.questionGapScopeLabel) {
    elements.questionGapScopeLabel.textContent = getQuestionGapScopeText();
  }
  if (elements.columnGapInput) {
    elements.columnGapInput.value = Number(state.pageLayout.columnGap).toFixed(1);
  }
  elements.titleTextInput.innerHTML = state.template.titleBlock.text;
  elements.instructionTextInput.innerHTML = state.template.instructionBlock.text;
  if (elements.titleFontsizeDisplay) elements.titleFontsizeDisplay.textContent = state.template.titleBlock.style.fontSize;
  if (elements.instructionFontsizeDisplay) elements.instructionFontsizeDisplay.textContent = state.template.instructionBlock.style.fontSize;
  elements.titleTextInput.style.fontSize = `${state.template.titleBlock.style.fontSize}px`;
  elements.instructionTextInput.style.fontSize = `${state.template.instructionBlock.style.fontSize}px`;
  elements.titleTextInput.style.textAlign = state.template.titleBlock.style.textAlign || "center";
  elements.instructionTextInput.style.textAlign = state.template.instructionBlock.style.textAlign || "center";
  updateTitleAlignBtnStates();
  updateInstructionAlignBtnStates();
  elements.watermarkOpacityInput.value = state.watermark.opacity;
  elements.watermarkScaleInput.value = state.watermark.scale;
  elements.watermarkDarknessInput.value = state.watermark.darkness;
  elements.watermarkContrastInput.value = state.watermark.contrast;
  if (elements.watermarkControls) elements.watermarkControls.hidden = !state.watermark.image?.dataUrl;
  applySidebarWidth(state.ui.sidebarWidth);
}

function bindPanelState() {
  elements.panels.forEach((panel) => {
    const heading = panel.querySelector("h2")?.textContent?.trim().toLowerCase() || "";
    const key =
      heading === "template"
        ? "headerFooter"
        : heading === "header & footer"
          ? "headerFooter"
          : heading === "exam details"
            ? "examDetails"
        : heading === "title and instructions" || heading === "title & instructions"
          ? "title"
          : heading === "watermark"
            ? "watermark"
            : heading === "page number"
                ? "pageNumber"
                : "questions";
    panel.open = state.ui.panels[key];
    panel.ontoggle = () => {
      state.ui.panels[key] = panel.open;
      saveState("Panel state updated");
    };
  });
}

async function loadQuestionsFromServer() {
  try {
    const payload = await fetchQuestions();
    const remoteQuestions = Array.isArray(payload.questions) ? payload.questions : [];
    if (remoteQuestions.length) {
      questionsRemoteAvailable = true;
      state.questions = remoteQuestions.map((question, index) => normalizeQuestionRecord(question, index));
      normalizeNumbers();
      render();
      saveState("Questions loaded from MongoDB");
      return;
    }
    questionsRemoteAvailable = true;
    setStatus("MongoDB is connected, no saved questions yet");
  } catch (error) {
    questionsRemoteAvailable = false;
    console.warn("MongoDB question load failed", error);
    setStatus(error.message.includes("MONGODB_URI") ? "MongoDB is not configured" : "Using local question data");
  }
}

export function render() {
  applyTheme();
  syncToolbarFields();
  bindPanelState();
  renderQuestionEditors();
  renderPages();
}

function updateAlignBtnStates(btns, textAlign) {
  btns.forEach((btn) => btn.classList.toggle("active", btn.dataset.align === textAlign));
}

function updateTitleAlignBtnStates() {
  updateAlignBtnStates(elements.titleAlignBtns, state.template.titleBlock.style.textAlign || "center");
}

function updateInstructionAlignBtnStates() {
  updateAlignBtnStates(elements.instructionAlignBtns, state.template.instructionBlock.style.textAlign || "center");
}

function bindGlobalInputs() {
  elements.databaseSubject.innerHTML = SUBJECT_OPTIONS.map((subject) => `<option value="${escapeHtmlAttribute(subject)}">${escapeHtml(subject)}</option>`).join("");
  if (elements.databaseSourceExamType) {
    const examTypes = [defaultState.examDetails.examType, "mock test", "test"];
    elements.databaseSourceExamType.innerHTML = examTypes.map((examType) => `<option value="${escapeHtmlAttribute(examType)}">${escapeHtml(examType)}</option>`).join("");
  }

  elements.themeToggle?.addEventListener("click", () => {
    state.themeMode = state.themeMode === "light" ? "dark" : "light";
    applyTheme();
    saveState(`Theme: ${state.themeMode}`);
  });

  if (elements.undoBtn) {
    elements.undoBtn.addEventListener("click", () => {
      undo();
    });
  }

  if (elements.redoBtn) {
    elements.redoBtn.addEventListener("click", () => {
      redo();
    });
  }

  elements.addQuestion?.addEventListener("click", (event) => {
    event.preventDefault();
    addQuestionFromTemplate();
  });

  elements.databaseQuestionsButton.addEventListener("click", async () => {
    await openDatabaseModal();
  });

  let justResizedModal = false;

  elements.databaseModalClose.addEventListener("click", closeDatabaseModal);

  elements.databaseModal.addEventListener("click", (event) => {
    if (justResizedModal) { justResizedModal = false; return; }
    if (event.target === elements.databaseModal) {
      closeDatabaseModal();
    }
  });

  elements.databaseSearchInput?.addEventListener("input", (event) => {
    uiState.databaseQuestionFilters.search = event.target.value;
    renderDatabaseList();
  });

  elements.databaseFilterTopic?.addEventListener("change", (event) => {
    uiState.databaseQuestionFilters.topic = event.target.value || "All";
    renderDatabaseList();
  });

  elements.databaseFilterSubject?.addEventListener("change", (event) => {
    uiState.databaseQuestionFilters.subject = event.target.value || "All";
    syncDatabaseFilters();
    renderDatabaseList();
  });

  elements.databaseFilterExamType?.addEventListener("change", (event) => {
    uiState.databaseQuestionFilters.examType = event.target.value || "All";
    renderDatabaseList();
  });

  elements.duplicateSaveClose.addEventListener("click", () => closeDuplicateSaveModal(false));
  elements.duplicateSaveCancel.addEventListener("click", () => closeDuplicateSaveModal(false));
  elements.duplicateSaveConfirm.addEventListener("click", () => closeDuplicateSaveModal(true));
  elements.duplicateSaveModal.addEventListener("click", (event) => {
    if (event.target === elements.duplicateSaveModal) {
      closeDuplicateSaveModal(false);
    }
  });

  elements.saveConfirmClose?.addEventListener("click", () => closeSaveConfirmModal(null));
  elements.saveConfirmCancel?.addEventListener("click", () => closeSaveConfirmModal(null));
  elements.saveConfirmModal?.addEventListener("click", (event) => {
    if (event.target === elements.saveConfirmModal) {
      closeSaveConfirmModal(null);
    }
  });
  elements.saveConfirmSubmit?.addEventListener("click", () => {
    const savedBy = String(elements.saveConfirmName?.value || "").trim();
    if (!savedBy) {
      if (elements.saveConfirmError) {
        elements.saveConfirmError.textContent = "Please enter your name to confirm saving.";
      }
      elements.saveConfirmName?.focus();
      return;
    }
    setSaveConfirmKnownName(savedBy);
    uiState.saveConfirmSkipRestOfSession = Boolean(elements.saveConfirmSkip?.checked);
    closeSaveConfirmModal({
      savedBy,
      savedAt: new Date().toISOString()
    });
  });
  elements.saveConfirmName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      elements.saveConfirmSubmit?.click();
    }
  });

  elements.databaseRefresh.addEventListener("click", async () => {
    setDatabaseStatus("Refreshing...");
    await fetchDatabaseQuestions();
  });

  elements.databaseNew.addEventListener("click", () => {
    uiState.selectedDatabaseQuestionId = "";
    renderDatabaseList();
    fillDatabaseForm(createDatabaseQuestionDraft(), { editable: true });
    setDatabaseStatus("New question");
  });

  elements.databaseEdit.addEventListener("click", () => {
    if (!elements.databaseId.value) {
      if (uiState.databaseQuestions.length) {
        uiState.selectedDatabaseQuestionId = uiState.databaseQuestions[0].id;
        renderDatabaseList();
        fillDatabaseForm(getSelectedDatabaseQuestion());
      } else {
        return;
      }
    }
    setDatabaseFormEditable(true);
    setDatabaseStatus("Editing question");
  });

  elements.databaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveDatabaseFormQuestion();
    } catch (error) {
      console.warn("Database question save failed", error);
      setDatabaseStatus(error.message.includes("MONGODB_URI") ? "MongoDB is not configured" : error.message);
    }
  });

  elements.databaseDelete.addEventListener("click", async () => {
    try {
      await deleteSelectedDatabaseQuestion();
    } catch (error) {
      console.warn("Database question delete failed", error);
      setDatabaseStatus(error.message.includes("MONGODB_URI") ? "MongoDB is not configured" : error.message);
    }
  });

  elements.databaseUse.addEventListener("click", useSelectedDatabaseQuestionInBuilder);

  elements.exportIssueClose?.addEventListener("click", hideExportIssueModal);
  elements.exportIssueModal?.addEventListener("click", (event) => {
    if (event.target === elements.exportIssueModal) hideExportIssueModal();
  });

  elements.exportPdf.addEventListener("click", async () => {
    try {
      setStatus("Generating PDF...");
      applyExamDetailsToQuestions();
      normalizeNumbers();
      const blockingIssue = getExportBlockingIssue();
      if (blockingIssue) {
        showExportIssueModal(blockingIssue);
        setStatus("Fix page layout before export");
        return;
      }
      const html = await buildPrintableHtml();
      const blob = await exportPdfOnServer(html, state);
      downloadBlob(blob, "test-builder-export.pdf");
      setStatus("PDF exported");
    } catch (error) {
      console.warn("PDF export failed", error);
      setStatus(error.message || "PDF export failed");
    }
  });

  elements.fontFamily.addEventListener("change", (event) => {
    const font = event.target.value;
    state.template.titleBlock.style.fontFamily = font;
    state.template.instructionBlock.style.fontFamily = font;
    state.questionStyle.fontFamily = font;
    saveState("Font updated");
    renderPages();
    syncToolbarFields();
  });

  function setLayoutMode(mode) {
    if (state.pageLayout.bodyLayoutMode === mode) return;
    state.pageLayout.bodyLayoutMode = mode;
    saveState("Layout mode updated");
    renderPages();
    syncToolbarFields();
  }

  elements.layoutSingleBtn?.addEventListener("click", () => setLayoutMode("single-column"));
  elements.layoutTwoBtn?.addEventListener("click", () => setLayoutMode("two-column-compact"));
  elements.layoutAddBtn?.addEventListener("click", () => addQuestionFromTemplate());

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const panelName = btn.dataset.panel;
      if (!panelName) return;
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const cards = document.querySelectorAll(".settings-card");
      cards.forEach((card) => {
        if (card.dataset.panel === panelName) {
          card.setAttribute("data-active", "true");
        } else {
          card.removeAttribute("data-active");
        }
      });
      // Collapse all questions when switching away from Questions panel
      if (panelName !== "questions") {
        state.questions.forEach((q) => { q.collapsed = true; });
        renderQuestionEditors();
      }
    });
  });

  elements.headerImageInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateFileInputLabel(event.target, file.name);
    placeHeaderImage(await readImageFile(file));
    rerenderPreview("Header banner updated");
  });

  elements.examSubjectInput.addEventListener("change", (event) => {
    state.examDetails.subject = event.target.value;
    applyExamDetailsToQuestions();
    renderQuestionEditors();
    saveState("Exam subject updated");
  });

  elements.examTypeInput.addEventListener("change", (event) => {
    state.examDetails.examType = event.target.value;
    if (state.examDetails.examType === "mock test") {
      state.examDetails.examNumber = 0;
      if (elements.examNumberInput) {
        elements.examNumberInput.value = "";
        elements.examNumberInput.disabled = true;
      }
    } else {
      if (!Number.isFinite(Number(state.examDetails.examNumber)) || Number(state.examDetails.examNumber) <= 0) {
        state.examDetails.examNumber = 1;
      }
      if (elements.examNumberInput) {
        elements.examNumberInput.disabled = false;
        elements.examNumberInput.value = state.examDetails.examNumber;
      }
    }
    applyExamDetailsToQuestions();
    saveState("Exam type updated");
  });

  if (elements.examNumberInput) {
    elements.examNumberInput.addEventListener("input", (event) => {
      const raw = Math.floor(Number(event.target.value) || 1);
      const clamped = Math.min(5, Math.max(1, raw));
      state.examDetails.examNumber = clamped;
      try {
        event.target.value = String(clamped);
      } catch (e) {}
      applyExamDetailsToQuestions();
      saveState("Exam number updated");
    });
  }

  elements.pageMarginLeftInput.addEventListener("input", (event) => {
    const clamped = Math.min(15, Math.max(1, Number(event.target.value) || 1));
    state.template.pageMargins.left = clamped;
    event.target.value = Number(clamped).toFixed(1);
    rerenderPreview("Left margin updated");
  });

  elements.pageMarginRightInput.addEventListener("input", (event) => {
    const clamped = Math.min(15, Math.max(1, Number(event.target.value) || 1));
    state.template.pageMargins.right = clamped;
    event.target.value = Number(clamped).toFixed(1);
    rerenderPreview("Right margin updated");
  });

  if (elements.questionGapInput) {
    elements.questionGapInput.addEventListener("input", (event) => {
      const clamped = Math.min(15, Math.max(1, Number(event.target.value) || 1));
      const result = setQuestionGapForSelection(clamped);
      event.target.value = Number(result.gap).toFixed(1);
      rerenderPreview(result.scope === "column" ? "Column question gap updated" : "Question gap updated");
    });
  }

  elements.columnGapInput?.addEventListener("input", (event) => {
    const clamped = Math.min(15, Math.max(1, Number(event.target.value) || 1));
    state.pageLayout.columnGap = clamped;
    event.target.value = Number(clamped).toFixed(1);
    rerenderPreview("Column gap updated");
  });

  document.querySelectorAll(".chevron-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const step = Number(input.step) || 0.1;
      const min = Number(input.min) || 1;
      const max = Number(input.max) || 15;
      const dir = btn.dataset.dir === "up" ? 1 : -1;
      const raw = Number(input.value) || 1;
      const next = Math.min(max, Math.max(min, raw + dir * step));
      input.value = Number(next).toFixed(1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  elements.questionFontFamilyInput?.addEventListener("change", (event) => {
    state.questionStyle.fontFamily = event.target.value;
    rerenderPreview("Question font updated");
  });

  elements.questionFontSizeInput?.addEventListener("input", (event) => {
    const clamped = Math.min(15, Math.max(1, Number(event.target.value) || 1));
    state.questionStyle.fontSize = clamped;
    event.target.value = Number(clamped).toFixed(1);
    rerenderPreview("Question font size updated");
  });

  elements.titleTextInput.addEventListener("input", () => {
    state.template.titleBlock.text = elements.titleTextInput.innerHTML;
    rerenderPreview("Title updated");
  });

  elements.instructionTextInput.addEventListener("input", () => {
    state.template.instructionBlock.text = elements.instructionTextInput.innerHTML;
    rerenderPreview("Instructions updated");
  });

  function setupFormatButtons(formatBtns, inputEl) {
    function updateFormatBtnStates() {
      formatBtns.forEach((btn) => {
        const cmd = btn.dataset.cmd;
        if (!cmd) return;
        btn.classList.toggle("active", document.queryCommandState(cmd));
      });
    }

    formatBtns.forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const cmd = btn.dataset.cmd;
        if (!cmd) return;
        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) {
          const range = document.createRange();
          range.selectNodeContents(inputEl);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand(cmd, false, null);
          sel.removeAllRanges();
          inputEl.focus();
        } else {
          document.execCommand(cmd, false, null);
          inputEl.focus();
        }
        updateFormatBtnStates();
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    inputEl.addEventListener("mouseup", updateFormatBtnStates);
    inputEl.addEventListener("keyup", updateFormatBtnStates);
  }

  setupFormatButtons(elements.titleFormatBtns, elements.titleTextInput);
  setupFormatButtons(elements.instructionFormatBtns, elements.instructionTextInput);

  function setupFontsizeButtons(minusBtn, plusBtn, displayEl, stateStyle, inputEl) {
    function updateDisplay() {
      if (displayEl) displayEl.textContent = stateStyle.fontSize;
      if (inputEl) inputEl.style.fontSize = `${stateStyle.fontSize}px`;
    }
    if (minusBtn) {
      minusBtn.addEventListener("click", () => {
        stateStyle.fontSize = Math.max(6, stateStyle.fontSize - 0.5);
        updateDisplay();
        rerenderPreview("Font size updated");
      });
    }
    if (plusBtn) {
      plusBtn.addEventListener("click", () => {
        stateStyle.fontSize = Math.min(72, stateStyle.fontSize + 0.5);
        updateDisplay();
        rerenderPreview("Font size updated");
      });
    }
  }

  setupFontsizeButtons(
    document.querySelector(".title-fontsize-minus"),
    document.querySelector(".title-fontsize-plus"),
    elements.titleFontsizeDisplay,
    state.template.titleBlock.style,
    elements.titleTextInput
  );
  setupFontsizeButtons(
    document.querySelector(".instruction-fontsize-minus"),
    document.querySelector(".instruction-fontsize-plus"),
    elements.instructionFontsizeDisplay,
    state.template.instructionBlock.style,
    elements.instructionTextInput
  );

  function setupAlignButtons(btns, stateStyle, inputEl, updateFn) {
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const align = btn.dataset.align;
        if (!align) return;
        stateStyle.textAlign = align;
        if (inputEl) inputEl.style.textAlign = align;
        updateFn();
        rerenderPreview("Alignment updated");
      });
    });
  }

  setupAlignButtons(elements.titleAlignBtns, state.template.titleBlock.style, elements.titleTextInput, updateTitleAlignBtnStates);
  setupAlignButtons(elements.instructionAlignBtns, state.template.instructionBlock.style, elements.instructionTextInput, updateInstructionAlignBtnStates);

  elements.watermarkImageInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateFileInputLabel(event.target, file.name);
    state.watermark.image.dataUrl = await readFileAsDataUrl(file);
    if (elements.watermarkControls) elements.watermarkControls.hidden = false;
    rerenderPreview("Watermark image updated");
  });
  elements.watermarkOpacityInput.addEventListener("input", (event) => {
    state.watermark.opacity = Number(event.target.value);
    rerenderPreview("Watermark opacity updated");
  });
  elements.watermarkScaleInput.addEventListener("input", (event) => {
    state.watermark.scale = Number(event.target.value);
    rerenderPreview("Watermark size updated");
  });
  elements.watermarkDarknessInput.addEventListener("input", (event) => {
    state.watermark.darkness = Number(event.target.value);
    rerenderPreview("Watermark darkness updated");
  });
  elements.watermarkContrastInput.addEventListener("input", (event) => {
    state.watermark.contrast = Number(event.target.value);
    rerenderPreview("Watermark contrast updated");
  });

    elements.footerImageInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateFileInputLabel(event.target, file.name);
    placeFooterImage(await readImageFile(file));
    rerenderPreview("Footer image updated");
  });

  document.addEventListener("click", (event) => {
    const clearBtn = event.target.closest(".file-clear-btn");
    if (clearBtn) {
      event.preventDefault();
      event.stopPropagation();
      const kind = clearBtn.dataset.clear;
      const wrapper = clearBtn.closest(".file-input-wrapper");
      if (!wrapper) return;
      const input = wrapper.querySelector("input[type='file']");
      if (input) { input.value = ""; }
      const label = wrapper.querySelector(".file-input-label");
      if (label) {
        const defaults = { "header-image": "Choose header image\u2026", "footer-image": "Choose footer image\u2026", "watermark-image": "Choose watermark image\u2026", "question-image": "Choose image\u2026" };
        label.textContent = defaults[kind] || "Choose file\u2026";
      }
      wrapper.classList.remove("has-file");
      if (kind === "watermark-image") {
        state.watermark.image.dataUrl = "";
        if (elements.watermarkControls) elements.watermarkControls.hidden = true;
        rerenderPreview("Watermark removed");
      } else if (kind === "header-image") {
        placeHeaderImage(null);
        rerenderPreview("Header image removed");
      } else if (kind === "footer-image") {
        placeFooterImage(null);
        rerenderPreview("Footer image removed");
      } else if (kind === "question-image") {
        const card = clearBtn.closest(".question-editor-card");
        if (card) {
          const qId = card.dataset.questionId;
          const q = state.questions.find((q) => q.id === qId);
          if (q) {
            q.image = { dataUrl: "", width: 0, height: 0 };
            q.imageFileName = "";
          }
        }
        rerenderPreview("Question image removed", { syncEditors: true, syncQuestions: true });
      }
      return;
    }
    const btn = event.target.closest(".file-input-btn");
    if (btn) {
      const wrapper = btn.closest(".file-input-wrapper");
      const input = wrapper?.querySelector("input[type='file']");
      if (input) input.click();
    }
  });

  elements.sidebarResizer?.addEventListener("pointerdown", startSidebarResize);
  elements.databaseSidebarResizer?.addEventListener("pointerdown", (e) => {
    justResizedModal = true;
    startDatabaseSidebarResize(e);
  });

  let sidebarResizeFrame = null;
  window.addEventListener("resize", () => {
    if (sidebarResizeFrame) cancelAnimationFrame(sidebarResizeFrame);
    sidebarResizeFrame = requestAnimationFrame(() => {
      applySidebarWidth(state.ui.sidebarWidth);
      sidebarResizeFrame = null;
    });
  }, { passive: true });
}

// Zoom logic & global state
let currentZoom = 100;
export function applyPreviewZoom() {
  const zoomLabel = document.getElementById("zoom-label");
  const pageStack = document.querySelector(".page-stack");
  if (zoomLabel) zoomLabel.textContent = `${currentZoom}%`;
  if (pageStack) {
    pageStack.style.transform = `scale(${currentZoom / 100})`;
    pageStack.style.marginBottom = `${(currentZoom / 100 - 1) * pageStack.offsetHeight}px`;
  }
}

const updateZoom = (value) => {
  currentZoom = Math.min(200, Math.max(50, value));
  applyPreviewZoom();
};

document.addEventListener("click", (event) => {
  const btn = event.target.closest(".zoom-btn");
  if (!btn) return;
  if (btn.id === "zoom-in-btn") {
    updateZoom(currentZoom + 10);
  } else if (btn.id === "zoom-out-btn") {
    updateZoom(currentZoom - 10);
  } else if (btn.id === "zoom-reset-btn") {
    updateZoom(100);
  }
});

// ── Context Menu ──────────────────────────────────────────────────────────────
let activeContextMenuQuestionId = null;
const contextMenu = document.getElementById("custom-context-menu");

const hideContextMenu = () => {
  if (contextMenu && !contextMenu.hidden) contextMenu.hidden = true;
};

// Show on right-click over a question-preview or question-editor-card
document.addEventListener("contextmenu", (event) => {
  const targetQuestion = event.target.closest(".question-preview") || event.target.closest(".question-editor-card");
  if (!targetQuestion) { hideContextMenu(); return; }

  event.preventDefault();
  activeContextMenuQuestionId = targetQuestion.dataset.questionId;

  if (contextMenu) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = 160, mh = 160;
    contextMenu.style.left = `${Math.min(event.clientX, vw - mw)}px`;
    contextMenu.style.top  = `${Math.min(event.clientY, vh - mh)}px`;
    contextMenu.hidden = false;
  }
});

// Use capture-phase mousedown so it fires before any click handlers —
// this is the only reliable way to dismiss before other handlers re-open it.
document.addEventListener("mousedown", (event) => {
  if (!contextMenu || contextMenu.hidden) return;
  if (!event.target.closest(".custom-context-menu")) {
    hideContextMenu();
  }
}, true /* capture */);

// Also hide on scroll anywhere
document.getElementById("page-preview")?.addEventListener("scroll", hideContextMenu, { passive: true });
window.addEventListener("scroll", hideContextMenu, { passive: true });

// Deselect question on click outside question/sidebar
document.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".custom-context-menu")) return; // clicking menu = keep selection
  if (!event.target.closest(".question-preview") &&
      !event.target.closest(".sidebar") &&
      !event.target.closest(".settings-navbar")) {
    state.ui.selected = null;
    renderPages();
  }
});

// Handle menu item clicks
contextMenu?.addEventListener("click", (event) => {
  const item = event.target.closest(".context-item");
  if (!item || !activeContextMenuQuestionId) return;
  const action = item.dataset.action;
  const qId = activeContextMenuQuestionId;
  hideContextMenu();

  if (action === "edit") {
    const question = state.questions.find((q) => q.id === qId);
    state.ui.selected = `question:${qId}`;
    closeActiveInlineEditor();
    renderPages();
    setTimeout(() => {
      if (question) {
        openInlineEditorAfterRender(
          `question:${qId}`,
          question.stem,
          (value) => {
            question.stem = value.replace(/^\s*\d+\.\s*/, "");
            rerenderPreview("Question edited on paper", { syncEditors: true });
          },
          { renderAnnotations: true, multiline: true, subject: question.subject }
        );
      }
    }, 30);

  } else if (action === "go-to-editor") {
    const questionsTab = document.querySelector('.nav-btn[data-panel="questions"]');
    if (questionsTab) questionsTab.click();
    state.questions.forEach((q) => { q.collapsed = (q.id !== qId); });
    renderPages();
    renderQuestionEditors();
    setTimeout(() => {
      const card = document.querySelector(`.question-editor-card[data-question-id="${qId}"]`);
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.open = true; }
    }, 100);

  } else if (action === "delete") {
    if (state.questions.length === 1) { setStatus("At least one question is required"); return; }
    state.questions = state.questions.filter((q) => q.id !== qId);
    normalizeNumbers();
    renderPages();
    syncToolbarFields();
    renderQuestionEditors();
    queueQuestionSync("Question removed via context menu");

  } else if (action === "duplicate") {
    const question = state.questions.find((q) => q.id === qId);
    if (!question) return;
    const copy = structuredClone(question);
    copy.id = crypto.randomUUID();
    copy.collapsed = false;
    copy.choices = copy.choices.map((choice) => ({ ...choice, id: crypto.randomUUID() }));
    copy.correctChoiceId = copy.choices[0]?.id || "";
    const index = state.questions.findIndex((q) => q.id === qId);
    state.questions.splice(index + 1, 0, copy);
    normalizeNumbers();
    renderPages();
    syncToolbarFields();
    renderQuestionEditors();
    queueQuestionSync("Question duplicated");

  } else if (action === "save") {
    const question = state.questions.find((q) => q.id === qId);
    if (!question) return;
    (async () => {
      try {
        const saveMeta = uiState.saveConfirmSkipRestOfSession && saveConfirmKnownName
          ? { savedBy: saveConfirmKnownName, savedAt: new Date().toISOString() }
          : await openSaveConfirmModal(question);
        if (!saveMeta) return;
        await saveQuestionToDatabase(question, saveMeta);
        setStatus(`Question ${question.number} saved to MongoDB`);
      } catch (error) {
        console.warn("Question save failed", error);
        setStatus(error.message.includes("MONGODB_URI") ? "MongoDB is not configured" : error.message);
      }
    })();
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function cloneWithInlineStyles(element) {
  const clone = element.cloneNode(true);
  const sourceEls = element.querySelectorAll("*");
  const cloneEls = clone.querySelectorAll("*");
  const computedStyle = window.getComputedStyle(element);
  for (const prop of computedStyle) {
    clone.style[prop] = computedStyle.getPropertyValue(prop);
  }
  sourceEls.forEach((src, i) => {
    const cs = window.getComputedStyle(src);
    for (const prop of cs) {
      cloneEls[i].style[prop] = cs.getPropertyValue(prop);
    }
  });
  return clone;
}

function capturePageAsSvg(pageElement) {
  const cleanClone = cloneWithInlineStyles(pageElement);
  const serialized = new XMLSerializer().serializeToString(cleanClone);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}" height="${PAGE.height}" viewBox="0 0 ${PAGE.width} ${PAGE.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>
      </foreignObject>
    </svg>
  `;
}

async function buildPrintableHtml() {
  const previousSelection = state.ui.selected;
  state.ui.selected = null;
  renderPages();
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const pageHtml = Array.from(document.querySelectorAll(".exam-page")).map((page) => {
    const clonedPage = cloneWithInlineStyles(page);
    const wrapper = document.createElement("div");
    wrapper.className = "print-page-container";
    wrapper.appendChild(clonedPage);
    return wrapper.outerHTML;
  });

  state.ui.selected = previousSelection;
  renderPages();

  if (!pageHtml.length) throw new Error("No pages found to export");

  let cssContent = "";
  try {
    const response = await fetch("./styles.css");
    cssContent = await response.text();
  } catch (error) {
    console.warn("Failed to fetch styles.css:", error);
  }

  const exportResetCss = `
body, .exam-page, .page-content, .page-bg { background: white !important; color: #111827 !important; }
:root { --page-bg: #ffffff; --text: #111827; --bg: #ffffff; }
.resize-handle,
.image-delete-btn,
.canvas-frame .selected,
.canvas-frame.selected,
.page-ruler {
  display: none !important;
}
body {
  background: white !important;
  margin: 0 !important;
  padding: 0 !important;
}
.print-page-container {
  width: 794px;
  min-height: 1123px;
  margin: 0;
  padding: 0;
  background: white !important;
  page-break-after: always;
}
.exam-page {
  width: 794px !important;
  min-height: 1123px !important;
  overflow: hidden !important;
  position: relative !important;
  background: white !important;
  page-break-after: always;
  border: none !important;
  box-shadow: none !important;
  margin: 0 !important;
}
`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exam Export</title>
  <style>
    ${exportResetCss}
    ${cssContent}
    ${exportResetCss}
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: white !important;
      margin: 0;
      padding: 0;
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  ${pageHtml.join("\n")}
</body>
</html>`;

  return html;
}

async function buildExportPayload(options = {}) {
  document.activeElement?.blur?.();
  const previousSelection = state.ui.selected;
  if (options.snapshotOnly) {
    state.ui.selected = null;
  }
  renderPages();
  await document.fonts?.ready?.catch?.(() => {});
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  const pageNodes = Array.from(document.querySelectorAll(".exam-page"));
  const pageSnapshots = [];
  for (let index = 0; index < pageNodes.length; index += 1) {
    setStatus(`Preparing page ${index + 1} of ${pageNodes.length}...`);
    const pageNode = pageNodes[index];
    try {
      pageSnapshots.push({
        width: PAGE.width,
        height: PAGE.height,
        svg: capturePageAsSvg(pageNode)
      });
    } catch (error) {
      console.warn("Snapshot capture failed.", error);
      if (options.snapshotOnly) {
        state.ui.selected = previousSelection;
        renderPages();
        throw error;
      }
      setStatus("Snapshot capture failed, using fallback export...");
      state.ui.selected = previousSelection;
      renderPages();
      return { exam: state, pageSnapshots: [] };
    }
  }
  state.ui.selected = previousSelection;
  renderPages();
  return { exam: state, pageSnapshots };
}

window.addEventListener("error", (event) => {
  console.error("Unhandled error:", event.error || event.message);
  setStatus(event.error?.message || event.message || "Unexpected error");
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
  setStatus(event.reason?.message || String(event.reason) || "Unexpected error");
});

try {
  bindGlobalInputs();
  initCsvImport(elements, { fetchDatabaseQuestions, setDatabaseStatus });
  initCustomSelects();
  elements.examNumberInput = document.querySelector("#exam-number-input");
  if (elements.examNumberInput) {
    elements.examNumberInput.addEventListener("input", (event) => {
      const raw = Math.floor(Number(event.target.value) || 1);
      const clamped = Math.min(5, Math.max(1, raw));
      state.examDetails.examNumber = clamped;
      try { event.target.value = String(clamped); } catch (e) {}
      applyExamDetailsToQuestions();
      saveState("Exam number updated");
    });
  }
  // Initialize active settings card
  const firstCard = document.querySelector('.settings-card[data-panel="header-footer"]');
  if (firstCard) firstCard.setAttribute('data-active', 'true');
  render();
  saveState("Ready");
  void loadQuestionsFromServer();
} catch (error) {
  console.error("Startup failed:", error);
  setStatus(error?.message || "Startup failed");
}

// Global tooltip handler to avoid overflow clipping
document.addEventListener('mouseenter', (e) => {
  const btn = e.target.closest ? e.target.closest('.hint-icon-btn') : null;
  if (btn) {
    const popoverId = btn.getAttribute('aria-describedby');
    if (popoverId) {
      const popover = document.getElementById(popoverId);
      if (popover) {
        document.body.appendChild(popover);
        const rect = btn.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.right = (window.innerWidth - rect.left + 10) + 'px';
        popover.style.top = (rect.top + rect.height / 2) + 'px';
        popover.style.bottom = 'auto';
        popover.style.left = 'auto';
        popover.style.transform = 'translateY(-50%) translateX(0)';
        popover.style.opacity = '1';
        popover.style.pointerEvents = 'auto';
      }
    }
  }
}, true);

document.addEventListener('mouseleave', (e) => {
  const btn = e.target.closest ? e.target.closest('.hint-icon-btn') : null;
  if (btn) {
    const popoverId = btn.getAttribute('aria-describedby');
    if (popoverId) {
      const popover = document.getElementById(popoverId);
      if (popover) {
        popover.style.opacity = '0';
        popover.style.pointerEvents = 'none';
        popover.style.transform = 'translateY(-50%) translateX(4px)';
      }
    }
  }
}, true);
