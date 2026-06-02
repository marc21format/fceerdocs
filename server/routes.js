import { pathToFileURL } from "node:url";
import {
  allowedSubjects,
  allowedExamTypes,
  getQuestionsCollection,
  normalizeQuestionForStorage,
  toQuestionResponse,
  listQuestions
} from "./db.js";
import { renderHtmlToPdf } from "./pdf.js";

// Response Helpers
export function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

export function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

export async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  if (!body.trim()) {
    return {};
  }
  return JSON.parse(body);
}

// Similarity Helpers
function normalizeForSimilarity(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value = "") {
  return new Set(normalizeForSimilarity(value).split(" ").filter(Boolean));
}

function jaccardSimilarity(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size && !setB.size) return 1;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function tokenContainment(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  return intersection.size / Math.min(setA.size, setB.size);
}

function levenshteinDistance(a = "", b = "") {
  const normA = normalizeForSimilarity(a);
  const normB = normalizeForSimilarity(b);
  const track = Array(normB.length + 1)
    .fill(null)
    .map(() => Array(normA.length + 1).fill(null));
  for (let i = 0; i <= normA.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= normB.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= normB.length; j += 1) {
    for (let i = 1; i <= normA.length; i += 1) {
      const indicator = normA[i - 1] === normB[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return track[normB.length][normA.length];
}

function characterSimilarity(a = "", b = "") {
  const normA = normalizeForSimilarity(a);
  const normB = normalizeForSimilarity(b);
  const maxLength = Math.max(normA.length, normB.length);
  if (!maxLength) return 1;
  const distance = levenshteinDistance(normA, normB);
  return (maxLength - distance) / maxLength;
}

export function questionSimilarity(a = {}, b = {}) {
  const stemWeight = 0.5;
  const choicesWeight = 0.5;
  const stemSim = characterSimilarity(a.stem || "", b.stem || "");
  const choicesA = (a.choices || []).map((c) => normalizeForSimilarity(c.text)).sort();
  const choicesB = (b.choices || []).map((c) => normalizeForSimilarity(c.text)).sort();
  let choicesSim = 0;
  if (!choicesA.length && !choicesB.length) {
    choicesSim = 1;
  } else if (choicesA.length && choicesB.length) {
    let matchCount = 0;
    const used = Array(choicesB.length).fill(false);
    for (const charA of choicesA) {
      let bestIndex = -1;
      let bestScore = 0.8; // threshold for choice match similarity
      for (let j = 0; j < choicesB.length; j += 1) {
        if (used[j]) continue;
        const score = characterSimilarity(charA, choicesB[j]);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = j;
        }
      }
      if (bestIndex >= 0) {
        matchCount += 1;
        used[bestIndex] = true;
      }
    }
    choicesSim = matchCount / Math.max(choicesA.length, choicesB.length);
  }
  return stemSim * stemWeight + choicesSim * choicesWeight;
}

export function questionFingerprint(question = {}) {
  const stem = normalizeForSimilarity(question.stem || "");
  const choices = (question.choices || [])
    .map((c) => normalizeForSimilarity(c.text))
    .filter(Boolean)
    .join(" | ");
  const image = question.image?.dataUrl ? "image" : "no-image";
  return `${stem}::${choices}::${image}`;
}

// Router Entry Point
export async function handleApiRoute(req, res, pathname, requestUrl) {
  // 1. GET /api/questions
  if (pathname === "/api/questions" && req.method === "GET") {
    try {
      console.log("Fetching questions from MongoDB...");
      const questions = await listQuestions();
      console.log(`Got ${questions.length} questions`);
      sendJson(res, 200, { questions });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  // 2. POST /api/questions/duplicates
  if (pathname === "/api/questions/duplicates" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const incomingQuestions = Array.isArray(body.questions) ? body.questions : [];
      const collection = await getQuestionsCollection();
      const existingQuestions = await collection.find({}).toArray();
      const matches = [];
      for (const incoming of incomingQuestions) {
        const incomingId = String(incoming.id || incoming._id || "");
        let bestMatch = null;
        for (const existing of existingQuestions) {
          if (incomingId && String(existing._id) === incomingId) {
            continue;
          }
          const sourceSubject = existing.sourceSubject || existing.subject || allowedSubjects[0];
          const sourceExamType = existing.sourceExamType || existing.examType || allowedExamTypes[0];
          const sourceExamNumber = Number.isFinite(Number(existing.sourceExamNumber))
            ? Number(existing.sourceExamNumber)
            : Number.isFinite(Number(existing.examNumber))
              ? Number(existing.examNumber)
              : 1;
          const sourceExamItemsCount = Number.isFinite(Number(existing.sourceExamItemsCount))
            ? Number(existing.sourceExamItemsCount)
            : Number.isFinite(Number(existing.examItemsCount))
              ? Number(existing.examItemsCount)
              : 0;
          if (questionFingerprint(incoming) === questionFingerprint(existing)) {
            bestMatch = {
              incomingId,
              existingId: String(existing._id),
              number: existing.number,
              subject: sourceSubject,
              sourceSubject,
              examType: sourceExamType,
              sourceExamType,
              examNumber: sourceExamNumber,
              sourceExamNumber,
              examItemsCount: sourceExamItemsCount,
              sourceExamItemsCount,
              topic: existing.topic || "",
              stem: existing.stem || "",
              savedBy: existing.savedBy || "",
              savedAt: existing.savedAt || existing.updatedAt || existing.createdAt || "",
              score: 1
            };
            break;
          }
          const score = questionSimilarity(incoming, existing);
          if (score >= 0.72 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = {
              incomingId,
              existingId: String(existing._id),
              number: existing.number,
              subject: sourceSubject,
              sourceSubject,
              examType: sourceExamType,
              sourceExamType,
              examNumber: sourceExamNumber,
              sourceExamNumber,
              examItemsCount: sourceExamItemsCount,
              sourceExamItemsCount,
              topic: existing.topic || "",
              stem: existing.stem || "",
              savedBy: existing.savedBy || "",
              savedAt: existing.savedAt || existing.updatedAt || existing.createdAt || "",
              score: Number(score.toFixed(2))
            };
          }
        }
        if (bestMatch) {
          matches.push(bestMatch);
        }
      }
      matches.sort((a, b) => b.score - a.score);
      sendJson(res, 200, { matches });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  // 3. POST /api/questions
  if (pathname === "/api/questions" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const question = normalizeQuestionForStorage(body, Number.isFinite(Number(body.order)) ? Number(body.order) : 0);
      const collection = await getQuestionsCollection();
      await collection.insertOne(question);
      sendJson(res, 201, { question: toQuestionResponse(question) });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  // 4. POST /api/questions/bulk
  if (pathname === "/api/questions/bulk" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const incoming = Array.isArray(body.questions) ? body.questions : [];
      if (!incoming.length) {
        sendJson(res, 400, { error: "No questions provided." });
        return true;
      }
      const collection = await getQuestionsCollection();
      const normalized = incoming.map((q, index) =>
        normalizeQuestionForStorage(q, Number.isFinite(Number(q.order)) ? Number(q.order) : index)
      );
      await collection.insertMany(normalized, { ordered: false });
      sendJson(res, 201, { inserted: normalized.length, questions: normalized.map(toQuestionResponse) });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  // 5. POST /api/export/pdf
  if (pathname === "/api/export/pdf" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const html = payload.html;
        
        if (!html) {
          send(res, 400, JSON.stringify({ error: "HTML content required" }), "application/json; charset=utf-8");
          return;
        }
        
        const pdfBuffer = await renderHtmlToPdf(html);
        
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="test-builder-export.pdf"',
          "Access-Control-Allow-Origin": "*"
        });
        res.end(pdfBuffer);
      } catch (error) {
        send(res, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
      }
    });
    return true;
  }

  // 6. Question ID specific endpoints: GET /api/questions/:id, PUT /api/questions/:id, DELETE /api/questions/:id
  const questionMatch = pathname.match(/^\/api\/questions\/([^/]+)$/);
  if (questionMatch) {
    const questionId = decodeURIComponent(questionMatch[1]);

    if (req.method === "GET") {
      try {
        const collection = await getQuestionsCollection();
        const question = await collection.findOne({ _id: questionId });
        if (!question) {
          sendJson(res, 404, { error: "Question not found." });
          return true;
        }
        sendJson(res, 200, { question: toQuestionResponse(question) });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return true;
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      try {
        const body = await readJsonBody(req);
        const question = normalizeQuestionForStorage({ ...body, id: questionId, _id: questionId }, Number.isFinite(Number(body.order)) ? Number(body.order) : 0);
        console.log('Normalized question to store:', JSON.stringify(question));
        const collection = await getQuestionsCollection();
        await collection.replaceOne({ _id: questionId }, question, { upsert: true });
        sendJson(res, 200, { question: toQuestionResponse(question) });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return true;
    }

    if (req.method === "DELETE") {
      try {
        const collection = await getQuestionsCollection();
        const result = await collection.deleteOne({ _id: questionId });
        if (!result.deletedCount) {
          sendJson(res, 404, { error: "Question not found." });
          return true;
        }
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return true;
    }
  }

  return false; // Not an API route or not matched
}
