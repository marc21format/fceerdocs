import { elements } from '../app.js';
import {
  state,
  normalizeNumbers,
  applyExamDetailsToQuestions,
  normalizeQuestionRecord,
  setQuestionCorrectChoice,
  saveConfirmKnownName,
  setSaveConfirmKnownName
} from './state.js';
import {
  defaultState,
  SUBJECT_OPTIONS
} from './config.js';
import {
  escapeHtml,
  escapeHtmlAttribute,
  normalizeTextForSearch,
  createChoice
} from './utils.js';
import { uiState } from './ui-state.js';
import {
  checkDuplicateQuestionsOnServer,
  fetchQuestions,
  putQuestion,
  postQuestion,
  deleteQuestionFromServer
} from './api.js';

const _cbs = {
  addQuestionFromTemplate: () => {},
  render: () => {},
  setStatus: () => {}
};

export function registerDatabaseCallbacks(cbs) {
  Object.assign(_cbs, cbs);
}

export function setDatabaseStatus(message) {
  if (elements.databaseModalStatus) {
    elements.databaseModalStatus.textContent = message;
  }
}

export function summarizeExamDetails(examDetails = {}) {
  const subject = examDetails.subject || "Unknown subject";
  const examType = examDetails.examType || "exam";
  const examNumber = Number.isFinite(Number(examDetails.examNumber)) ? Number(examDetails.examNumber) : 1;
  const itemsCount = Number.isFinite(Number(examDetails.examItemsCount)) ? Number(examDetails.examItemsCount) : 0;
  const numberPart = examType === 'mock test' ? '' : ` #${examNumber}`;
  return `${subject} · ${examType}${numberPart}${itemsCount ? ` · ${itemsCount} item${itemsCount === 1 ? "" : "s"}` : ""}`;
}

export function getDatabaseQuestionSource(question = {}) {
  return {
    subject: question.sourceSubject || question.subject || SUBJECT_OPTIONS[0],
    examType: question.sourceExamType || question.examType || defaultState.examDetails.examType,
    examNumber: Number.isFinite(Number(question.sourceExamNumber))
      ? Number(question.sourceExamNumber)
      : Number.isFinite(Number(question.examNumber))
        ? Number(question.examNumber)
        : 1,
    examItemsCount: Number.isFinite(Number(question.sourceExamItemsCount))
      ? Number(question.sourceExamItemsCount)
      : Number.isFinite(Number(question.examItemsCount))
        ? Number(question.examItemsCount)
        : 0
  };
}

export function summarizeQuestionText(question, maxWords = 20) {
  const text = String(question?.stem || "").trim().replace(/<[^>]+>/g, "");
  if (!text) return "Untitled question";
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}...` : text;
}

export function renderDuplicateMetaLines(question, label) {
  const source = getDatabaseQuestionSource(question);
  const savedBy = String(question?.savedBy || "").trim();
  const savedAt = String(question?.savedAt || "").trim();
  return `
    <span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(summarizeExamDetails(source))}</span>
    <span><strong>Topic:</strong> ${escapeHtml(question?.topic || "No topic")}</span>
    <span><strong>Saved by:</strong> ${escapeHtml(savedBy || "Unknown")}</span>
    <span><strong>Saved at:</strong> ${escapeHtml(savedAt ? new Date(savedAt).toLocaleString() : "Unknown")}</span>
  `;
}

export function renderDuplicateMatchList(matches = []) {
  if (!matches.length) {
    elements.duplicateMatchList.innerHTML = "";
    return;
  }
  const rows = matches.map((match, index) => `
    <div class="duplicate-match-item">
      <strong>Matched duplicate ${index + 1}</strong>
      <span>Question ${escapeHtml(match.number || "-")}</span><br />
      <span>Subject: ${escapeHtml(match.subject || "Unknown subject")}</span><br />
      <span>Exam: ${escapeHtml(summarizeExamDetails(getDatabaseQuestionSource(match)))}</span><br />
      <span>Saved by: ${escapeHtml(match.savedBy || "Unknown")}</span><br />
      <span>Saved at: ${escapeHtml(match.savedAt ? new Date(match.savedAt).toLocaleString() : "Unknown")}</span><br />
      <span>Topic: ${escapeHtml(match.topic || "No topic")}</span>
    </div>
  `).join("");
  elements.duplicateMatchList.innerHTML = rows;
}

export function renderQuestionSaveDetails(question) {
  const source = getDatabaseQuestionSource(question);
  return `
    <span><strong>Question:</strong> ${escapeHtml(summarizeQuestionText(question, 24))}</span>
    <span><strong>Subject:</strong> ${escapeHtml(source.subject || "Unknown")}</span>
    <span><strong>Exam:</strong> ${escapeHtml(summarizeExamDetails(source))}</span>
    <span><strong>Topic:</strong> ${escapeHtml(question?.topic || "No topic")}</span>
    <span><strong>Items:</strong> ${escapeHtml(String(source.examItemsCount || state.questions.length || 0))}</span>
  `;
}

export function getSelectedDatabaseQuestion() {
  return uiState.databaseQuestions.find((question) => String(question.id) === String(uiState.selectedDatabaseQuestionId)) || null;
}

export function createDatabaseQuestionDraft() {
  const choices = [createChoice(), createChoice(), createChoice(), createChoice()];
  const source = {
    subject: state.examDetails.subject,
    examType: state.examDetails.examType,
    examNumber: Number(state.examDetails.examNumber) || 1,
    examItemsCount: Number(state.examDetails.itemsCount) || state.questions.length
  };
  return normalizeQuestionRecord({
    id: "",
    number: uiState.databaseQuestions.length + 1,
    collapsed: false,
    subject: state.examDetails.subject,
    sourceSubject: source.subject,
    sourceExamType: source.examType,
    sourceExamNumber: source.examNumber,
    savedBy: "",
    savedAt: "",
    topic: "",
    stem: "",
    explanation: "",
    correctChoiceId: choices[0].id,
    image: { dataUrl: "", width: 0, height: 0 },
    imagePosition: "top",
    imageWidth: 150,
    imageBox: { x: 0, y: 0, width: 150, height: 120 },
    passage: "",
    passageNote: "",
    passagePosition: "top",
    passageFontSize: 12,
    choiceLayout: "auto",
    choices
  }, uiState.databaseQuestions.length);
}

export function renderDatabaseChoiceInputs(question) {
  if (!elements.databaseChoices || !elements.databaseCorrect) return;
  elements.databaseChoices.innerHTML = "";
  elements.databaseCorrect.innerHTML = "";
  question.choices.forEach((choice, index) => {
    const label = String.fromCharCode(65 + index);
    const row = document.createElement("label");
    row.className = "database-choice-row";
    row.innerHTML = `<span>${label}.</span><input type="text" value="${escapeHtmlAttribute(choice.text)}" data-choice-index="${index}" />`;
    elements.databaseChoices.append(row);

    const option = document.createElement("option");
    option.value = choice.id;
    option.textContent = `${label}.`;
    elements.databaseCorrect.append(option);
  });
}

export function setDatabaseFormEditable(editable) {
  uiState.databaseFormEditable = Boolean(editable);
  const controls = elements.databaseForm.querySelectorAll("input, textarea, select");
  controls.forEach((control) => {
    if (control.id === "database-question-id") return;
    control.disabled = !uiState.databaseFormEditable;
  });
  if (elements.databaseSave) {
    elements.databaseSave.disabled = !uiState.databaseFormEditable;
  }
  if (elements.databaseEdit) {
    elements.databaseEdit.disabled = uiState.databaseFormEditable || !elements.databaseId.value;
  }
  if (elements.databaseDelete) {
    elements.databaseDelete.disabled = !elements.databaseId.value;
  }
  if (elements.databaseUse) {
    elements.databaseUse.disabled = !elements.databaseId.value;
  }
}

export function fillDatabaseForm(question, options = {}) {
  const selected = question || createDatabaseQuestionDraft();
  if (elements.databaseId) elements.databaseId.value = selected.id || "";
  if (elements.databaseSubject) elements.databaseSubject.value = selected.subject || SUBJECT_OPTIONS[0];
  if (elements.databaseTopic) elements.databaseTopic.value = selected.topic || "";
  const source = getDatabaseQuestionSource(selected);
  if (elements.databaseSourceExamType) elements.databaseSourceExamType.value = source.examType || defaultState.examDetails.examType;
  if (elements.databaseSourceExamNumber) elements.databaseSourceExamNumber.value = source.examNumber || 1;
  if (elements.databaseSavedBy) elements.databaseSavedBy.value = selected.savedBy || "";
  if (elements.databaseSavedAt) {
    elements.databaseSavedAt.value = selected.savedAt ? new Date(selected.savedAt).toLocaleString() : "";
  }
  if (elements.databaseStem) elements.databaseStem.value = selected.stem || "";
  if (elements.databaseExplanation) elements.databaseExplanation.value = selected.explanation || "";
  renderDatabaseChoiceInputs(selected);
  setQuestionCorrectChoice(selected, selected.correctChoiceId);
  if (elements.databaseCorrect) elements.databaseCorrect.value = selected.correctChoiceId || selected.choices[0]?.id || "";
  setDatabaseFormEditable(Boolean(options.editable));
  if (elements.databaseDelete) elements.databaseDelete.disabled = !selected.id;
  if (elements.databaseUse) elements.databaseUse.disabled = !selected.id;
  if (elements.databaseEdit) {
    elements.databaseEdit.disabled = Boolean(options.editable) || !selected.id;
  }
}

export function getDatabaseFormQuestion() {
  const existing = getSelectedDatabaseQuestion();
  const existingIndex = uiState.databaseQuestions.findIndex((question) => question.id === uiState.selectedDatabaseQuestionId);
  const choices = Array.from(elements.databaseChoices.querySelectorAll("input")).map((input, index) => ({
    id: existing?.choices?.[index]?.id || crypto.randomUUID(),
    text: input.value
  }));
  const fallbackCorrectId = choices[0]?.id || "";
  const correctChoiceId = choices.some((choice) => choice.id === elements.databaseCorrect.value)
    ? elements.databaseCorrect.value
    : fallbackCorrectId;
  return normalizeQuestionRecord({
    ...(existing || {}),
    id: elements.databaseId.value || existing?.id || crypto.randomUUID(),
    subject: elements.databaseSubject.value,
    sourceSubject: elements.databaseSubject.value,
    sourceExamType: elements.databaseSourceExamType.value,
    sourceExamNumber: Number(elements.databaseSourceExamNumber.value) || 1,
    savedBy: elements.databaseSavedBy?.value || existing?.savedBy || "",
    savedAt: existing?.savedAt || "",
    topic: elements.databaseTopic.value,
    stem: elements.databaseStem.value,
    explanation: elements.databaseExplanation.value,
    choices,
    correctChoiceId,
    choiceLayout: existing?.choiceLayout || "auto",
    image: existing?.image || { dataUrl: "", width: 0, height: 0 },
    imagePosition: existing?.imagePosition || "top",
    imageWidth: existing?.imageWidth || 150,
    imageBox: existing?.imageBox || { x: 0, y: 0, width: 150, height: 120 },
    passage: existing?.passage || "",
    passageNote: existing?.passageNote || "",
    passagePosition: existing?.passagePosition || "top",
    passageFontSize: existing?.passageFontSize || 12,
  }, existingIndex >= 0 ? existingIndex : uiState.databaseQuestions.length);
}

export function syncDatabaseFilters() {
  if (elements.databaseFilterSubject && !elements.databaseFilterSubject.options.length) {
    const subjectOptions = ["All", ...SUBJECT_OPTIONS];
    elements.databaseFilterSubject.innerHTML = subjectOptions.map((subject) => `<option value="${escapeHtmlAttribute(subject)}">${escapeHtml(subject)}</option>`).join("");
  }
  if (elements.databaseSubject && !elements.databaseSubject.options.length) {
    elements.databaseSubject.innerHTML = SUBJECT_OPTIONS.map((subject) => `<option value="${escapeHtmlAttribute(subject)}">${escapeHtml(subject)}</option>`).join("");
  }
  if (elements.databaseFilterExamType && !elements.databaseFilterExamType.options.length) {
    const examTypes = ["All", defaultState.examDetails.examType, "mock test", "test"];
    const uniqueExamTypes = examTypes.filter((value, index, array) => array.indexOf(value) === index);
    elements.databaseFilterExamType.innerHTML = uniqueExamTypes.map((examType) => `<option value="${escapeHtmlAttribute(examType)}">${escapeHtml(examType)}</option>`).join("");
  }
  if (elements.databaseFilterTopic) {
    const subject = uiState.databaseQuestionFilters.subject === "All" ? null : uiState.databaseQuestionFilters.subject;
    if (!subject) {
      elements.databaseFilterTopic.innerHTML = `<option value="All">All</option>`;
      elements.databaseFilterTopic.disabled = true;
    } else {
      const topics = new Set();
      uiState.databaseQuestions.forEach((q) => {
        if (getDatabaseQuestionSource(q).subject !== subject) return;
        if (q.topic && String(q.topic).trim()) topics.add(String(q.topic).trim());
      });
      const topicOptions = ["All", ...Array.from(topics).sort((a, b) => a.localeCompare(b))];
      elements.databaseFilterTopic.innerHTML = topicOptions.map((t) => `<option value="${escapeHtmlAttribute(t)}">${escapeHtml(t)}</option>`).join("");
      elements.databaseFilterTopic.disabled = false;
    }
  }
  if (elements.databaseSearchInput) elements.databaseSearchInput.value = uiState.databaseQuestionFilters.search;
  if (elements.databaseFilterSubject) elements.databaseFilterSubject.value = uiState.databaseQuestionFilters.subject;
  if (elements.databaseFilterExamType) elements.databaseFilterExamType.value = uiState.databaseQuestionFilters.examType;
  if (elements.databaseFilterTopic) elements.databaseFilterTopic.value = uiState.databaseQuestionFilters.topic;
}

export function filterDatabaseQuestions() {
  const search = normalizeTextForSearch(uiState.databaseQuestionFilters.search);
  return uiState.databaseQuestions.filter((question) => {
    const source = getDatabaseQuestionSource(question);
    if (uiState.databaseQuestionFilters.subject !== "All" && source.subject !== uiState.databaseQuestionFilters.subject) return false;
    if (uiState.databaseQuestionFilters.examType !== "All" && source.examType !== uiState.databaseQuestionFilters.examType) return false;
    if (uiState.databaseQuestionFilters.topic !== "All" && String(question.topic || "").trim() !== String(uiState.databaseQuestionFilters.topic || "").trim()) return false;
    if (!search) return true;
    const haystack = normalizeTextForSearch([
      question.stem,
      question.topic,
      source.subject,
      source.examType,
      source.examNumber,
      source.examItemsCount
    ].join(" "));
    return haystack.includes(search);
  });
}

export function renderDatabaseList() {
  elements.databaseList.innerHTML = "";
  const filtered = filterDatabaseQuestions();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = uiState.databaseQuestions.length ? "No questions match the current filters." : "No saved questions yet.";
    elements.databaseList.append(empty);
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const srcA = getDatabaseQuestionSource(a);
    const srcB = getDatabaseQuestionSource(b);
    const subCmp = (srcA.subject || "").localeCompare(srcB.subject || "");
    if (subCmp !== 0) return subCmp;
    const topCmp = (a.topic || "").localeCompare(b.topic || "");
    if (topCmp !== 0) return topCmp;
    return (a.number || 0) - (b.number || 0);
  });

  let lastSubject = "";
  let itemIndex = 0;

  sorted.forEach((question) => {
    const source = getDatabaseQuestionSource(question);
    const subject = source.subject || "Unknown";

    if (subject !== lastSubject) {
      const label = document.createElement("div");
      label.className = "database-group-label";
      label.textContent = subject;
      elements.databaseList.append(label);
      lastSubject = subject;
    }

    itemIndex++;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `database-question-item${String(question.id) === String(uiState.selectedDatabaseQuestionId) ? " active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(question.stem || "Untitled question")}</strong>
      <span>${itemIndex}. ${escapeHtml(summarizeExamDetails(source))}${question.topic ? ` · ${escapeHtml(question.topic)}` : ""}</span>
      <span>${escapeHtml(question.savedBy || "Unknown saver")}${question.savedAt ? ` · ${escapeHtml(new Date(question.savedAt).toLocaleString())}` : ""}</span>
    `;
    button.addEventListener("click", () => {
      uiState.selectedDatabaseQuestionId = question.id;
      renderDatabaseList();
      fillDatabaseForm(question, { editable: true });
      setDatabaseStatus(`${uiState.databaseQuestions.length} saved question${uiState.databaseQuestions.length === 1 ? "" : "s"}`);
    });
    elements.databaseList.append(button);
  });
}

export async function fetchDatabaseQuestions() {
  const payload = await fetchQuestions();
  uiState.databaseQuestions = Array.isArray(payload.questions)
    ? payload.questions.map((question, index) => normalizeQuestionRecord(question, index))
    : [];
  if (!uiState.databaseQuestions.some((question) => String(question.id) === String(uiState.selectedDatabaseQuestionId))) {
    uiState.selectedDatabaseQuestionId = uiState.databaseQuestions[0]?.id || "";
  }
  syncDatabaseFilters();
  renderDatabaseList();
  fillDatabaseForm(getSelectedDatabaseQuestion(), { editable: true });
  setDatabaseStatus(`${uiState.databaseQuestions.length} saved question${uiState.databaseQuestions.length === 1 ? "" : "s"}`);
}

export async function openDatabaseModal() {
  elements.databaseModal.hidden = false;
  setDatabaseStatus("Loading saved questions...");
  fillDatabaseForm(createDatabaseQuestionDraft(), { editable: true });
  try {
    await fetchDatabaseQuestions();
  } catch (error) {
    console.warn("Database questions load failed", error);
    setDatabaseStatus(error.message.includes("MONGODB_URI") ? "MongoDB is not configured" : error.message);
    elements.databaseList.innerHTML = `<div class="hint">${escapeHtml(elements.databaseModalStatus.textContent)}</div>`;
  }
}

export function closeDatabaseModal() {
  elements.databaseModal.hidden = true;
}

export async function saveDatabaseFormQuestion() {
  const question = getDatabaseFormQuestion();
  const savedBy = String(question.savedBy || "").trim();
  if (!savedBy) {
    throw new Error("Please enter the instructor name before saving.");
  }
  const topicName = String(question.topic || "").trim();
  if (topicName) {
    const conflict = uiState.databaseQuestions.find((item) => {
      if (!item.topic) return false;
      if (String(item.topic || "").trim().toLowerCase() !== topicName.toLowerCase()) return false;
      if (String(item.id) === String(question.id)) return false;
      return String(item.subject || "") !== String(question.subject || "");
    });
    if (conflict) {
      const conflictSubject = conflict.subject || "Unknown subject";
      throw new Error(`Topic \"${topicName}\" already exists under subject \"${conflictSubject}\". Topic names must be unique across subjects.`);
    }
  }
  const exists = uiState.databaseQuestions.some((item) => String(item.id) === String(question.id));
  const order = Math.max(0, uiState.databaseQuestions.findIndex((item) => item.id === question.id));
  const sourceExamType = question.examType || state.examDetails.examType;
  const sourceExamNumber = Number.isFinite(Number(question.examNumber)) ? Number(question.examNumber) : Number(state.examDetails.examNumber) || 1;
  const examItemsCount = Number.isFinite(Number(question.examItemsCount))
    ? Number(question.examItemsCount)
    : Number(state.examDetails.itemsCount) || state.questions.length;
  const payload = {
    ...question,
    order: exists ? order : uiState.databaseQuestions.length,
    subject: question.subject,
    sourceSubject: question.sourceSubject || question.subject,
    examType: sourceExamType,
    examNumber: sourceExamNumber,
    examItemsCount,
    savedBy,
    savedAt: new Date().toISOString()
  };
  delete payload.choiceLayout;
  delete payload.sourceExamItemsCount;
<<<<<<< HEAD
  delete payload.collapsed;
  delete payload.image;
  delete payload.imagePosition;
  delete payload.imageWidth;
  delete payload.imageBox;
  delete payload.spacingMode;
  delete payload.number;
=======
>>>>>>> c627fc6ad4062d8ea5ee1a4225406d4864ef3350
  const result = exists ? await putQuestion(question.id, payload) : await postQuestion(payload);
  const saved = normalizeQuestionRecord(result.question, exists ? uiState.databaseQuestions.findIndex((item) => item.id === question.id) : uiState.databaseQuestions.length);
  const index = uiState.databaseQuestions.findIndex((item) => String(item.id) === String(saved.id));
  if (index >= 0) {
    uiState.databaseQuestions[index] = saved;
  } else {
    uiState.databaseQuestions.push(saved);
  }
  uiState.selectedDatabaseQuestionId = saved.id;
  renderDatabaseList();
  fillDatabaseForm(saved, { editable: true });
  setDatabaseStatus("Question saved");
}

export async function deleteSelectedDatabaseQuestion() {
  const question = getSelectedDatabaseQuestion();
  if (!question) return;
  const proceed = window.confirm("Delete this saved question from MongoDB?");
  if (!proceed) return;
  await deleteQuestionFromServer(question.id);
  uiState.databaseQuestions = uiState.databaseQuestions.filter((item) => String(item.id) !== String(question.id));
  uiState.selectedDatabaseQuestionId = uiState.databaseQuestions[0]?.id || "";
  renderDatabaseList();
  fillDatabaseForm(getSelectedDatabaseQuestion() || createDatabaseQuestionDraft(), { editable: true });
  setDatabaseStatus("Question deleted");
}

export function useSelectedDatabaseQuestionInBuilder() {
  const question = getSelectedDatabaseQuestion();
  if (!question) return;
  _cbs.addQuestionFromTemplate(question);
  closeDatabaseModal();
  _cbs.setStatus("Database question added to builder");
}

export function closeSaveConfirmModal(result = null) {
  if (elements.saveConfirmModal) {
    elements.saveConfirmModal.setAttribute("hidden", "");
  }
  if (uiState.saveConfirmModalState) {
    const { resolve } = uiState.saveConfirmModalState;
    uiState.saveConfirmModalState = null;
    resolve(result);
  }
}

export function openSaveConfirmModal(question) {
  if (!elements.saveConfirmModal) {
    return Promise.resolve(null);
  }
  elements.saveConfirmDetails.innerHTML = renderQuestionSaveDetails(question);
  elements.saveConfirmName.value = uiState.saveConfirmSkipRestOfSession ? saveConfirmKnownName : "";
  elements.saveConfirmSkip.checked = uiState.saveConfirmSkipRestOfSession;
  elements.saveConfirmError.textContent = "";
  elements.saveConfirmModal.removeAttribute("hidden");
  elements.saveConfirmName.focus();
  return new Promise((resolve) => {
    uiState.saveConfirmModalState = { resolve };
  });
}

export function closeDuplicateSaveModal(result = false) {
  if (elements.duplicateSaveModal) {
    elements.duplicateSaveModal.hidden = true;
  }
  if (uiState.duplicateSaveModalState) {
    const { resolve } = uiState.duplicateSaveModalState;
    uiState.duplicateSaveModalState = null;
    resolve(Boolean(result));
  }
}

export function openDuplicateSaveModal({ incomingQuestion, matches }) {
  if (!elements.duplicateSaveModal) {
    return Promise.resolve(false);
  }
  elements.duplicateIncomingMeta.innerHTML = renderDuplicateMetaLines(incomingQuestion, "Incoming");
  elements.duplicateIncomingStem.textContent = summarizeQuestionText(incomingQuestion, 60);
  const primaryMatch = matches[0] || null;
  elements.duplicateExistingMeta.innerHTML = primaryMatch
    ? renderDuplicateMetaLines(primaryMatch, "Existing")
    : `<span>No duplicate match found.</span>`;
  elements.duplicateExistingStem.textContent = primaryMatch ? summarizeQuestionText(primaryMatch, 60) : "";
  renderDuplicateMatchList(matches);
  elements.duplicateSaveModal.hidden = false;
  return new Promise((resolve) => {
    uiState.duplicateSaveModalState = { resolve };
  });
}

function buildQuestionPayload(question, index = 0) {
  const {
    choiceLayout,
    collapsed,
    image,
    imagePosition,
    imageWidth,
    imageBox,
    spacingMode,
    sourceExamNumber,
    examItemsCount,
    order,
    number,
    ...payload
  } = question;
  return {
    ...payload,
    subject: state.examDetails.subject,
    sourceSubject: state.examDetails.subject,
    examType: state.examDetails.examType,
    examNumber: state.examDetails.examType === 'mock test' ? 0 : (Number(state.examDetails.examNumber) || 1)
  };
}

export async function saveQuestionToDatabase(question, saveMeta = {}) {
  const index = state.questions.findIndex((item) => item.id === question.id);
  if (index < 0) {
    throw new Error("Question not found.");
  }
  applyExamDetailsToQuestions();
  normalizeNumbers();
  const payload = buildQuestionPayload(state.questions[index], index);
  payload.savedBy = (saveMeta && saveMeta.savedBy) || saveConfirmKnownName || payload.savedBy || "";
  payload.savedAt = (saveMeta && saveMeta.savedAt) || payload.savedAt || new Date().toISOString();
  const duplicates = await checkDuplicateQuestionsOnServer([payload]);
  if (duplicates.length) {
    const proceed = await openDuplicateSaveModal({
      incomingQuestion: payload,
      matches: duplicates
    });
    if (!proceed) {
      _cbs.setStatus("Save canceled");
      return;
    }
  }
  const result = await putQuestion(payload.id || payload._id, payload);
  if (result.question?.id) {
    state.questions[index] = normalizeQuestionRecord(result.question, index);
    normalizeNumbers();
    _cbs.render();
    try {
      if (elements.databaseModal && !elements.databaseModal.hidden) {
        await fetchDatabaseQuestions();
      }
    } catch (err) {
      console.warn('Failed to refresh database questions after save', err);
    }
  }
}
