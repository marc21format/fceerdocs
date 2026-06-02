import { state, saveConfirmKnownName, setSaveConfirmKnownName } from './state.js';
import { bulkInsertQuestions, fetchQuestions } from './api.js';
import { escapeHtml } from './utils.js';
import { uiState } from './ui-state.js';

let csvParsedRows = [];

export function initCsvImport(elements, { fetchDatabaseQuestions, setDatabaseStatus }) {
  function parseQuestionCsv(text) {
    const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!rawLines.length) return [];

    function parseLine(line) {
      const fields = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === "," && !inQuotes) {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      fields.push(current.trim());
      return fields;
    }

    const EXPECTED_HEADERS = ["question", "choice a", "choice b", "choice c", "choice d"];
    let startIndex = 0;
    const firstFields = parseLine(rawLines[0]).map((f) => f.toLowerCase().replace(/['"]/g, "").trim());
    const looksLikeHeader = firstFields.some((f) => EXPECTED_HEADERS.includes(f));
    if (looksLikeHeader) startIndex = 1;

    const rows = [];
    for (let i = startIndex; i < rawLines.length; i++) {
      const fields = parseLine(rawLines[i]);
      if (fields.length < 5) continue;
      const [stem, choiceA, choiceB, choiceC, choiceD] = fields;
      if (!stem) continue;
      rows.push({ stem, choices: [choiceA, choiceB, choiceC, choiceD] });
    }
    return rows;
  }

  function openCsvMetadataModal(rows) {
    csvParsedRows = rows;
    elements.csvSubjectInput.value = state.examDetails?.subject || elements.csvSubjectInput.options[0]?.value || "";
    elements.csvExamTypeInput.value = state.examDetails?.examType || "practice test";
    elements.csvExamNumberInput.value = state.examDetails?.examNumber || 1;
    elements.csvSavedByInput.value = saveConfirmKnownName || "";
    if (elements.csvMetadataError) elements.csvMetadataError.textContent = "";
    if (elements.csvPreviewInfo) {
      elements.csvPreviewInfo.innerHTML = `
        <strong>${rows.length} question${rows.length !== 1 ? "s" : ""} detected in CSV</strong>
        ${rows.slice(0, 3).map((r, i) => `<div style="margin-top:4px;opacity:.8">${i + 1}. ${escapeHtml(r.stem.slice(0, 90))}${r.stem.length > 90 ? "…" : ""}</div>`).join("")}
        ${rows.length > 3 ? `<span class="csv-pill">+${rows.length - 3} more</span>` : ""}
      `.trim();
    }
    elements.csvMetadataModal.removeAttribute("hidden");
  }

  function closeCsvMetadataModal() {
    elements.csvMetadataModal.setAttribute("hidden", "");
    csvParsedRows = [];
    elements.csvFileInput.value = "";
    if (elements.csvMetadataError) elements.csvMetadataError.textContent = "";
  }

  async function submitCsvBulkImport() {
    if (elements.csvMetadataError) elements.csvMetadataError.textContent = "";
    const savedBy = (elements.csvSavedByInput?.value || "").trim();
    if (!savedBy) {
      if (elements.csvMetadataError) elements.csvMetadataError.textContent = "Please enter your name.";
      elements.csvSavedByInput?.focus();
      return;
    }
    if (!csvParsedRows.length) {
      if (elements.csvMetadataError) elements.csvMetadataError.textContent = "No valid questions found in CSV.";
      return;
    }

    const subject = elements.csvSubjectInput?.value || "";
    const examType = elements.csvExamTypeInput?.value || "practice test";
    const examNumber = Number(elements.csvExamNumberInput?.value) || 1;
    const savedAt = new Date().toISOString();

    const questions = csvParsedRows.map((row, index) => {
      const choices = row.choices.map((text) => ({ id: crypto.randomUUID(), text: text || "" }));
      return {
        id: crypto.randomUUID(),
        order: index,
        subject,
        sourceSubject: subject,
        examType,
        sourceExamType: examType,
        examNumber,
        sourceExamNumber: examNumber,
        savedBy,
        savedAt,
        stem: row.stem,
        choices,
        correctChoiceId: choices[0]?.id || "",
        explanation: "",
        topic: ""
      };
    });

    elements.csvMetadataSubmit.setAttribute("data-loading", "true");
    elements.csvMetadataSubmit.textContent = `Saving ${questions.length} questions…`;
    try {
      setDatabaseStatus(`Checking for duplicates…`);

      let existingQuestions = uiState.databaseQuestions || [];
      if (!existingQuestions.length) {
        try {
          const payload = await fetchQuestions();
          existingQuestions = Array.isArray(payload.questions) ? payload.questions : [];
        } catch (_) { /* ignore */ }
      }

      const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const existingStems = new Map();
      existingQuestions.forEach((q) => {
        const key = normalize(q.stem);
        if (key) existingStems.set(key, q);
      });

      const duplicates = [];
      const seenInCsv = new Set();
      questions.forEach((q) => {
        const key = normalize(q.stem);
        if (!key) return;
        if (existingStems.has(key)) {
          duplicates.push({ csvQuestion: q, existing: existingStems.get(key) });
        } else if (seenInCsv.has(key)) {
          duplicates.push({ csvQuestion: q, existing: null, withinCsv: true });
        }
        seenInCsv.add(key);
      });

      if (duplicates.length) {
        const lines = duplicates.slice(0, 5).map((d, i) =>
          `${i + 1}. ${d.csvQuestion.stem.slice(0, 80)}${d.csvQuestion.stem.length > 80 ? "…" : ""}${d.withinCsv ? " (duplicate within CSV)" : ` (exists: ${d.existing.savedBy || "unknown"})`}`
        );
        const proceed = confirm(
          `${duplicates.length} duplicate${duplicates.length !== 1 ? "s" : ""} detected:\n\n` +
          lines.join("\n") +
          (duplicates.length > 5 ? `\n…and ${duplicates.length - 5} more` : "") +
          "\n\nSave anyway?"
        );
        if (!proceed) {
          setDatabaseStatus("Import canceled — duplicates detected.");
          return;
        }
      }

      setDatabaseStatus(`Saving ${questions.length} questions via CSV…`);
      const data = await bulkInsertQuestions(questions);
      setSaveConfirmKnownName(savedBy);
      closeCsvMetadataModal();
      setDatabaseStatus(`Imported ${data.inserted ?? questions.length} questions successfully`);
      await fetchDatabaseQuestions();
    } catch (error) {
      console.warn("CSV bulk import failed", error);
      if (elements.csvMetadataError) {
        elements.csvMetadataError.textContent = error.message.includes("MONGODB_URI")
          ? "MongoDB is not configured."
          : `Error: ${error.message}`;
      }
    } finally {
      elements.csvMetadataSubmit.removeAttribute("data-loading");
      elements.csvMetadataSubmit.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px">
          <path d="M20.5 7.27783L12 12.0001M12 12.0001L3.49997 7.27783M12 12.0001L12 21.5001M14 20.889L12.777 21.5684C12.4934 21.726 12.3516 21.8047 12.2015 21.8356C12.0685 21.863 11.9315 21.863 11.7986 21.8356C11.6484 21.8047 11.5066 21.726 11.223 21.5684L3.82297 17.4573C3.52346 17.2909 3.37368 17.2077 3.26463 17.0893C3.16816 16.9847 3.09515 16.8606 3.05048 16.7254C3 16.5726 3 16.4013 3 16.0586V7.94153C3 7.59889 3 7.42757 3.05048 7.27477C3.09515 7.13959 3.16816 7.01551 3.26463 6.91082C3.37368 6.79248 3.52345 6.70928 3.82297 6.54288L11.223 2.43177C11.5066 2.27421 11.6484 2.19543 11.7986 2.16454C11.9315 2.13721 12.2015 2.16454 12.3516 2.19543 12.4934 2.27421 12.777 2.43177L20.177 6.54288C20.4766 6.70928 20.6263 6.79248 20.7354 6.91082C20.8318 7.01551 20.9049 7.13959 20.9495 7.27477C21 7.42757 21 7.59889 21 7.94153L21 12.5001M7.5 4.50008L16.5 9.50008M19 21.0001V15.0001M16 18.0001H22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Save to Database
      `.trim();
    }
  }

  elements.csvBulkImportBtn?.addEventListener("click", () => {
    elements.csvFileInput.value = "";
    elements.csvFileInput.click();
  });

  elements.csvFileInput?.addEventListener("change", () => {
    const file = elements.csvFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const rows = parseQuestionCsv(text);
      if (!rows.length) {
        setDatabaseStatus("No valid questions found in CSV. Check the format.");
        elements.csvFileInput.value = "";
        return;
      }
      openCsvMetadataModal(rows);
    };
    reader.readAsText(file, "utf-8");
  });

  elements.csvMetadataClose?.addEventListener("click", closeCsvMetadataModal);
  elements.csvMetadataCancel?.addEventListener("click", closeCsvMetadataModal);
  elements.csvMetadataModal?.addEventListener("click", (event) => {
    if (event.target === elements.csvMetadataModal) closeCsvMetadataModal();
  });

  elements.csvMetadataSubmit?.addEventListener("click", submitCsvBulkImport);

  elements.csvSavedByInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitCsvBulkImport();
    }
  });
}
