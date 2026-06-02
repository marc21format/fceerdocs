import { QUESTIONS_API } from './config.js';

export async function checkDuplicateQuestionsOnServer(questionsPayload) {
  const response = await fetch(`${QUESTIONS_API}/duplicates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ questions: questionsPayload })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Unable to check for duplicate questions.");
  }
  const payload = await response.json();
  return Array.isArray(payload.matches) ? payload.matches : [];
}

export async function fetchQuestions() {
  const response = await fetch(QUESTIONS_API);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Unable to load questions.");
  }
  return await response.json();
}

export async function putQuestion(questionId, payload) {
  const response = await fetch(`${QUESTIONS_API}/${encodeURIComponent(questionId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Unable to save question.");
  }
  return await response.json();
}

export async function postQuestion(payload) {
  const response = await fetch(QUESTIONS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Unable to create question.");
  }
  return await response.json();
}

export async function deleteQuestionFromServer(questionId) {
  const response = await fetch(`${QUESTIONS_API}/${encodeURIComponent(questionId)}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Unable to delete question.");
  }
  return response;
}

export async function bulkInsertQuestions(questionsPayload) {
  const response = await fetch("/api/questions/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions: questionsPayload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Server error ${response.status}`);
  }
  return data;
}

export async function exportPdfOnServer(html, examState) {
  const response = await fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, exam: examState })
  });
  if (!response.ok) {
    throw new Error("PDF export failed");
  }
  return await response.blob();
}
