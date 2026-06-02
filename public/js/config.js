export const STORAGE_KEY = "test-builder-state-v3";
export const LEGACY_STORAGE_KEYS = ["test-builder-state-v2", "test-builder-state-v1"];
export const FONT_OPTIONS = ["Arial", "Georgia", "Times New Roman", "Calibri", "Verdana", "Trebuchet MS", "Cambria"];
export const SUBJECT_OPTIONS = [
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
export const QUESTIONS_API = "/api/questions";

export const PAGE = {
  width: 794,
  height: 1123
};
export const QUESTION_IMAGE_MAX_DIMENSION = 1600;
export const QUESTION_IMAGE_JPEG_QUALITY = 0.86;
export const PX_PER_INCH = 96;
export const HALF_INCH = PX_PER_INCH / 2;
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 650;
export const SIDEBAR_DEFAULT_WIDTH = 350;
export const PAGE_MIN_WIDTH = 840;

export const defaultState = {
  themeMode: "dark",
  ui: {
    panels: {
      headerFooter: true,
      examDetails: true,
      title: true,
      watermark: true,
      pageNumber: true,
      questions: true
    },
    selected: null,
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH
  },
  template: {
    headerImage: { dataUrl: "", width: 0, height: 0 },
    headerBox: { x: 12, y: 10, width: 770, height: 96 },
    pageMargins: { left: 24, right: 24, top: HALF_INCH, bottom: HALF_INCH },
    titleBlock: {
      text: "MATH 2 Practice Test 2",
      offsetY: 6,
      style: { fontFamily: "Calibri", fontSize: 16, bold: true, italic: false, underline: false }
    },
    instructionBlock: {
      text: "Shade the letter of the answer on your answer sheet.\nIf you encounter difficulties answering the question, do not hesitate to ask assistance from your instructor.",
      offsetY: 21,
      style: { fontFamily: "Calibri", fontSize: 10.5, bold: false, italic: false, underline: false }
    },
    footerImage: { dataUrl: "", width: 0, height: 0 },
    footerBox: { x: 12, y: 1078, width: 770, height: 36 },
    pageNumberConfig: { visible: true, x: 750, y: 1048, fontSize: 10 }
  },
  examDetails: {
    subject: "Math 1 (algebra)",
    itemsCount: 2,
    examType: "practice test",
    examNumber: 1
  },
  pageLayout: {
    bodyLayoutMode: "two-column-compact",
    questionFlow: "column-first",
    columnGap: 18,
    questionGap: 6,
    columnQuestionGaps: {},
    headerBufferPx: 4,
    footerBufferPx: 4,
    contentDensity: "compact"
  },
  questionStyle: {
    fontFamily: "Calibri",
    fontSize: 11
  },
  watermark: {
    image: { dataUrl: "" },
    opacity: 0.08,
    darkness: 0.95,
    contrast: 1.15,
    scale: 1.2
  },
  questions: [
    {
      id: crypto.randomUUID(),
      number: 1,
      collapsed: true,
      subject: "Math",
      topic: "Interest Problems",
      stem: "Elbert divides P10,000 in two investments, one at 10% and the other at 30%. Find how much is invested at each rate so that the two investments produce the same income annually.",
      image: { dataUrl: "", width: 0, height: 0 },
      imagePosition: "top",
      imageWidth: 150,
      imageBox: { x: 0, y: 0, width: 150, height: 120 },
      passage: "",
      passageNote: "",
      passagePosition: "top",
      passageFontSize: 12,
      choiceLayout: "auto",
      spacingMode: "compact",
      correctChoiceId: null,
      explanation: "Both investments must earn the same annual income, so the amounts must satisfy 0.10x = 0.30y and x + y = 10000.",
      choices: [
        { id: crypto.randomUUID(), text: "P2,500 at 30% and P7,500 at 10%" },
        { id: crypto.randomUUID(), text: "P2,500 at 10% and P7,500 at 30%" },
        { id: crypto.randomUUID(), text: "P3,000 at 30% and P7,000 at 10%" },
        { id: crypto.randomUUID(), text: "P3,000 at 10% and P7,000 at 30%" }
      ]
    },
    {
      id: crypto.randomUUID(),
      number: 2,
      collapsed: true,
      subject: "Math",
      topic: "Interest Problems",
      stem: "Each year, Dave uses the interest earned on two separate investments to help pay for college costs. The annual interest rates are 11% and 13%. If the total amount invested is P15,200, and the total interest earned per year is P1,858, how much is invested at each rate?",
      image: { dataUrl: "", width: 0, height: 0 },
      imagePosition: "top",
      imageWidth: 150,
      imageBox: { x: 0, y: 0, width: 150, height: 120 },
      passage: "",
      passageNote: "",
      passagePosition: "top",
      passageFontSize: 12,
      choiceLayout: "auto",
      spacingMode: "compact",
      correctChoiceId: null,
      explanation: "Set up the system x + y = 15200 and 0.11x + 0.13y = 1858, then solve for the two investment amounts.",
      choices: [
        { id: crypto.randomUUID(), text: "P6,700 at 11% and P8,500 at 13%" },
        { id: crypto.randomUUID(), text: "P6,700 at 13% and P8,500 at 11%" },
        { id: crypto.randomUUID(), text: "P6,800 at 11% and P8,400 at 13%" },
        { id: crypto.randomUUID(), text: "P6,800 at 13% and P8,400 at 11%" }
      ]
    }
  ]
};
