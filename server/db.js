import { randomUUID } from "node:crypto";
import { MongoClient, ServerApiVersion } from "mongodb";

export const mongoUri = process.env.MONGODB_URI || "";
export const mongoDbName = process.env.MONGODB_DB || "test_builder";

export const allowedSubjects = [
  "Math 1 (algebra)",
  "Math 2 (word problems)",
  "Math 3 (geometry)",
  "Math 4 (statistics)",
  "Biology",
  "Physics",
  "Chem",
  "Earth and Space Science",
  "English Language Proficiency",
  "Kasanayan sa Wikang Filipino",
  "Reading Comprehension"
];

export const allowedExamTypes = ["practice test", "mock test", "test"];

let mongoClientPromise = null;

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

export async function getMongoDb() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set.");
  }
  if (!mongoClientPromise) {
    const client = new MongoClient(mongoUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      },
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      maxIdleTimeMS: 30000,
      retryWrites: true,
      w: "majority"
    });
    mongoClientPromise = (async () => {
      try {
        console.log("Attempting MongoDB connection...");
        await withTimeout(client.connect(), 35000, "MongoDB connection timed out while connecting.");
        console.log("Connected! Pinging server...");
        await withTimeout(client.db("admin").command({ ping: 1 }), 35000, "MongoDB connection timed out while pinging.");
        console.log("Ping successful! Connection ready.");
        return client;
      } catch (error) {
        mongoClientPromise = null;
        await client.close().catch(() => {});
        throw error;
      }
    })();
  }
  const client = await mongoClientPromise;
  return client.db(mongoDbName);
}

export async function getQuestionsCollection() {
  const db = await getMongoDb();
  return db.collection("questions");
}

export function normalizeChoice(choice = {}) {
  return {
    id: String(choice.id || randomUUID()),
    text: String(choice.text || "")
  };
}

export function normalizeQuestionForStorage(question = {}, index = 0) {
  const choices = Array.isArray(question.choices) ? question.choices.map((choice) => normalizeChoice(choice)) : [];
  const subject = allowedSubjects.includes(question.subject) ? question.subject : allowedSubjects[0];
  const sourceSubject = allowedSubjects.includes(question.sourceSubject) ? question.sourceSubject : subject;
  const examType = allowedExamTypes.includes(String(question.examType || "").toLowerCase())
    ? String(question.examType).toLowerCase()
    : allowedExamTypes[0];
  const savedBy = String(question.savedBy || "").trim();
  const savedAt = String(question.savedAt || "").trim() || new Date().toISOString();
  const correctChoiceId = choices.some((choice) => choice.id === question.correctChoiceId)
    ? question.correctChoiceId
    : choices[0]?.id || "";

  return {
    _id: String(question._id || question.id || randomUUID()),
    order: Number.isFinite(Number(question.order)) ? Number(question.order) : index,
    number: Number.isFinite(Number(question.number)) ? Number(question.number) : index + 1,
    subject,
    sourceSubject,
    topic: String(question.topic || ""),
    examType,
    sourceExamType: allowedExamTypes.includes(String(question.sourceExamType || "").toLowerCase())
      ? String(question.sourceExamType).toLowerCase()
      : examType,
    examNumber: Number.isFinite(Number(question.examNumber)) ? Number(question.examNumber) : 1,
    sourceExamNumber: Number.isFinite(Number(question.sourceExamNumber)) ? Number(question.sourceExamNumber) : Number.isFinite(Number(question.examNumber)) ? Number(question.examNumber) : 1,
    examItemsCount: Number.isFinite(Number(question.examItemsCount)) ? Number(question.examItemsCount) : index + 1,
    savedBy,
    savedAt,
    stem: String(question.stem || ""),
    choices,
    correctChoiceId,
    explanation: String(question.explanation || ""),
    collapsed: Boolean(question.collapsed),
    image: {
      dataUrl: String(question.image?.dataUrl || ""),
      width: Number.isFinite(Number(question.image?.width)) ? Number(question.image.width) : 0,
      height: Number.isFinite(Number(question.image?.height)) ? Number(question.image.height) : 0
    },
    imagePosition: ["top", "left", "right"].includes(question.imagePosition) ? question.imagePosition : "top",
    imageWidth: Number.isFinite(Number(question.imageWidth)) ? Number(question.imageWidth) : 150,
    imageBox: {
      x: Number.isFinite(Number(question.imageBox?.x)) ? Number(question.imageBox.x) : 0,
      y: Number.isFinite(Number(question.imageBox?.y)) ? Number(question.imageBox.y) : 0,
      width: Number.isFinite(Number(question.imageBox?.width)) ? Number(question.imageBox.width) : 150,
      height: Number.isFinite(Number(question.imageBox?.height)) ? Number(question.imageBox.height) : 120
    },
    spacingMode: "compact",
    createdAt: question.createdAt || savedAt,
    updatedAt: new Date().toISOString()
  };
}

export function toQuestionResponse(question) {
  const { _id, ...rest } = question;
  return { id: _id, ...rest };
}

export async function listQuestions() {
  const collection = await getQuestionsCollection();
  const questions = await collection.find({}).sort({ order: 1, createdAt: 1 }).toArray();
  return questions.map(toQuestionResponse);
}
