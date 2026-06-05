import path from "node:path";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const pdfLibModulePath = path.join(
  process.env.USERPROFILE || "C:\\Users\\Marc Ian C. Young",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  ".pnpm",
  "pdf-lib@1.17.1",
  "node_modules",
  "pdf-lib",
  "cjs",
  "index.js"
);
const imageSizeModulePath = path.join(
  process.env.USERPROFILE || "C:\\Users\\Marc Ian C. Young",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  ".pnpm",
  "image-size@1.2.1",
  "node_modules",
  "image-size",
  "dist",
  "index.js"
);
const sharpModulePath = path.join(
  process.env.USERPROFILE || "C:\\Users\\Marc Ian C. Young",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  "sharp",
  "lib",
  "index.js"
);

function stripDataUrlPrefix(value = "") {
  const index = value.indexOf("base64,");
  return index >= 0 ? value.slice(index + 7) : value;
}

function getSvgFromSnapshot(snapshot = {}) {
  if (typeof snapshot.svg === "string" && snapshot.svg.trim()) return snapshot.svg;
  return "";
}

async function getChromiumPath() {
  const isVercel = !!process.env.VERCEL;
  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return chromium.executablePath();
  }
  const chromeCandidates = [
    process.env.CHROMIUM_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
  ].filter(Boolean);
  let chromiumPath = chromeCandidates[0];
  for (const candidate of chromeCandidates) {
    try {
      await stat(candidate);
      chromiumPath = candidate;
      break;
    } catch {
    }
  }
  return chromiumPath;
}

function parsePx(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function numOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeMathText(text = "") {
  return text
    .replace(/\\times|\\cdot/gi, "x")
    .replace(/\\pm/gi, "±")
    .replace(/\\div/gi, "÷")
    .replace(/\\leq?|<=/gi, "≤")
    .replace(/\\geq?|>=/gi, "≥")
    .replace(/\\neq|!=/gi, "≠")
    .replace(/\\approx/gi, "≈")
    .replace(/\\pi/gi, "π")
    .replace(/\\theta/gi, "θ")
    .replace(/\\alpha/gi, "α")
    .replace(/\\beta/gi, "β")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/gi, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/gi, "√($1)");
}

function normalizeExportText(text = "") {
  return text
    .replace(/\[\[(.+?)::(.+?)\]\]/g, "$1 ($2)")
    .replace(/%%([\s\S]+?)%%/g, (_, expr) => normalizeMathText(expr.trim()));
}

function extractMathSegments(text) {
  const mathSymbolPattern = /[0-9+\-×÷=±≤≥≠≈√π×·∫∑∏°αβγθΔΣΠ]/;
  const mathFunctionPattern = /\b(sin|cos|tan|log|ln|sqrt|exp|abs|max|min)\b/i;
  
  const segments = [];
  let i = 0;
  
  while (i < text.length) {
    const funcMatch = text.slice(i).match(mathFunctionPattern);
    if (funcMatch && funcMatch.index === 0) {
      segments.push({ type: 'math', value: funcMatch[0] });
      i += funcMatch[0].length;
      continue;
    }
    
    if (mathSymbolPattern.test(text[i])) {
      let mathPart = '';
      while (i < text.length && (mathSymbolPattern.test(text[i]) || /[()[\]{}<>.,]/.test(text[i]))) {
        mathPart += text[i];
        i++;
      }
      segments.push({ type: 'math', value: mathPart });
    } else {
      let regularPart = '';
      while (i < text.length && !mathSymbolPattern.test(text[i])) {
        const funcMatch = text.slice(i).match(mathFunctionPattern);
        if (funcMatch && funcMatch.index === 0) break;
        regularPart += text[i];
        i++;
      }
      if (regularPart) {
        segments.push({ type: 'regular', value: regularPart });
      }
    }
  }
  
  return segments;
}

function wrapText(text, font, size, maxWidth) {
  const rawLines = String(text).split("\n");
  const lines = [];
  for (const rawLine of rawLines) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

function getImageMime(dataUrl = "") {
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "jpg";
  if (dataUrl.startsWith("data:image/svg+xml")) return "svg";
  return null;
}

async function embedDataImage(pdfDoc, dataUrl) {
  const mime = getImageMime(dataUrl);
  const bytes = Buffer.from(stripDataUrlPrefix(dataUrl), "base64");
  if (mime === "png") return pdfDoc.embedPng(bytes);
  if (mime === "jpg") return pdfDoc.embedJpg(bytes);
  if (mime === "svg") {
    const sharpModule = await import(pathToFileURL(sharpModulePath).href);
    const sharp = sharpModule.default || sharpModule;
    const pngBytes = await sharp(bytes).png().toBuffer();
    return pdfDoc.embedPng(pngBytes);
  }
  return null;
}

async function getImageDimensionsFromDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const mime = getImageMime(dataUrl);
  if (mime === "svg") {
    const sharpModule = await import(pathToFileURL(sharpModulePath).href);
    const sharp = sharpModule.default || sharpModule;
    const bytes = Buffer.from(stripDataUrlPrefix(dataUrl), "base64");
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  }
  const imageSizeModule = await import(pathToFileURL(imageSizeModulePath).href);
  const imageSize = imageSizeModule.imageSize || imageSizeModule.default?.imageSize || imageSizeModule.default || imageSizeModule;
  const bytes = Buffer.from(stripDataUrlPrefix(dataUrl), "base64");
  const result = imageSize(bytes);
  if (!result?.width || !result?.height) return null;
  return { width: result.width, height: result.height };
}

async function rasterizeSnapshotToPngBuffer(snapshot = {}) {
  const svg = getSvgFromSnapshot(snapshot);
  if (svg) {
    const sharpModule = await import(pathToFileURL(sharpModulePath).href);
    const sharp = sharpModule.default || sharpModule;
    return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
  }
  if (typeof snapshot.dataUrl === "string" && snapshot.dataUrl.startsWith("data:image/")) {
    const mime = getImageMime(snapshot.dataUrl);
    const bytes = Buffer.from(stripDataUrlPrefix(snapshot.dataUrl), "base64");
    if (mime === "png") return bytes;
    if (mime === "jpg") {
      const sharpModule = await import(pathToFileURL(sharpModulePath).href);
      const sharp = sharpModule.default || sharpModule;
      return sharp(bytes).png().toBuffer();
    }
  }
  return null;
}

function fitContainBox(boxWidth, boxHeight, sourceWidth, sourceHeight) {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    width,
    height,
    offsetX: (boxWidth - width) / 2,
    offsetY: (boxHeight - height) / 2
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mapFontNameToPdfFont(fontName, isBold = false) {
  const name = (fontName || "Calibri").toLowerCase();
  
  if (name.includes("times")) {
    return isBold ? "TimesRomanBold" : "TimesRoman";
  }
  if (name.includes("courier")) {
    return isBold ? "CourierBold" : "Courier";
  }
  return isBold ? "HelveticaBold" : "Helvetica";
}

function getStandardFont(fontName, StandardFonts, isBold = false) {
  const name = mapFontNameToPdfFont(fontName, isBold);
  
  switch (name) {
    case "TimesRoman":
      return StandardFonts.TimesRoman;
    case "TimesRomanBold":
      return StandardFonts.TimesRomanBold;
    case "Courier":
      return StandardFonts.Courier;
    case "CourierBold":
      return StandardFonts.CourierBold;
    case "HelveticaBold":
      return StandardFonts.HelveticaBold;
    case "Helvetica":
    default:
      return StandardFonts.Helvetica;
  }
}

function drawMultiFontText(pdfPage, line, options, regularFont, mathFont, subject) {
  if (subject !== 'Math') {
    pdfPage.drawText(line, options);
    return;
  }
  
  const segments = extractMathSegments(line);
  let xOffset = 0;
  
  segments.forEach(segment => {
    const segmentFont = segment.type === 'math' ? mathFont : regularFont;
    const segmentWidth = segmentFont.widthOfTextAtSize(segment.value, options.size);
    
    pdfPage.drawText(segment.value, {
      ...options,
      x: options.x + xOffset,
      font: segmentFont
    });
    
    xOffset += segmentWidth;
  });
}

export async function buildPdfBuffer(exam) {
  const payload = exam;
  const snapshots = payload?.pageSnapshots || null;
  exam = payload?.exam || payload;
  const pdfLib = await import(pathToFileURL(pdfLibModulePath).href);
  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const pdf = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const scaleX = pageWidth / 794;
  const scaleY = pageHeight / 1123;
  const sx = (value) => value * scaleX;
  const sy = (value) => value * scaleY;
  const toPdfY = (top, height = 0) => pageHeight - sy(top + height);

  if (snapshots?.length) {
    for (const snapshot of snapshots) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      const pngBytes = await rasterizeSnapshotToPngBuffer(snapshot);
      const image = pngBytes ? await pdf.embedPng(pngBytes) : null;
      if (!image) continue;
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight
      });
    }
    return Buffer.from(await pdf.save());
  }

  const titleStyle = exam.template?.titleBlock?.style || {};
  const instructionStyle = exam.template?.instructionBlock?.style || {};
  const questionStyle = exam.questionStyle || {};
  const margins = exam.template?.pageMargins || { left: 24, right: 24, top: 20, bottom: 18 };
  
  const questionFont = await pdf.embedFont(getStandardFont(questionStyle.fontFamily, StandardFonts, false));
  const titleFont = await pdf.embedFont(getStandardFont(titleStyle.fontFamily, StandardFonts, true));
  const instructionFont = await pdf.embedFont(getStandardFont(instructionStyle.fontFamily, StandardFonts, false));
  const pageNumberFont = await pdf.embedFont(StandardFonts.Helvetica);
  const mathFont = await pdf.embedFont(StandardFonts.TimesRoman);
  const headerImage = exam.template?.headerImage?.dataUrl ? await embedDataImage(pdf, exam.template.headerImage.dataUrl) : null;
  const footerImage = exam.template?.footerImage?.dataUrl ? await embedDataImage(pdf, exam.template.footerImage.dataUrl) : null;
  const headerDimensions = await getImageDimensionsFromDataUrl(exam.template?.headerImage?.dataUrl);
  const footerDimensions = await getImageDimensionsFromDataUrl(exam.template?.footerImage?.dataUrl);
  const watermarkImage = exam.watermark?.image?.dataUrl ? await embedDataImage(pdf, exam.watermark.image.dataUrl) : null;

  const contentWidth = 794 - margins.left - margins.right;
  const columnCount = exam.pageLayout?.bodyLayoutMode === "two-column-compact" ? 2 : 1;
  const columnGap = columnCount === 2 ? exam.pageLayout?.columnGap || 18 : 0;
  const columnWidth = (contentWidth - columnGap) / columnCount;
  const titleBaseY = exam.template?.headerImage?.dataUrl
    ? numOr(exam.template?.headerBox?.y, margins.top) + numOr(exam.template?.headerBox?.height, 96)
    : margins.top;
  const titleSize = parsePx(titleStyle.fontSize, 16);
  const instructionSize = parsePx(instructionStyle.fontSize, 10.5);
  const questionSize = parsePx(questionStyle.fontSize, 11);
  const lineGap = questionSize * 0.35;
  const titleBlockY = titleBaseY + 6;
  const instructionBlockY = titleBaseY + 27 + 2;
  const instructionLines = wrapText(exam.template?.instructionBlock?.text || "", instructionFont, instructionSize, sx(730));
  const contentTop = instructionBlockY + instructionLines.length * (instructionSize + lineGap) + 12;
  const footerTop = exam.template?.footerImage?.dataUrl ? numOr(exam.template.footerBox?.y, 1078) : 1088;
  const pageNumberTop = exam.template?.pageNumberConfig?.visible !== false ? numOr(exam.template.pageNumberConfig?.y, 1048) : 1088;
  const contentBottom = Math.min(footerTop - 16, pageNumberTop - 8);
  const availableHeight = contentBottom - contentTop;

  const estimateQuestionHeight = (question) => {
    const stemLines = wrapText(`${question.number}. ${normalizeExportText(question.stem || "")}`, questionFont, questionSize, sx(columnWidth - 8));
    let height = stemLines.length * (questionSize + lineGap);
    if (question.image?.dataUrl) {
      height += Math.min(question.imageBox?.height || 120, 180) * (question.imagePosition === "top" ? 1 : 0.65);
    }
    const choiceLines = (question.choices || [])
      .filter((choice) => choice.text?.trim())
      .flatMap((choice, index) => wrapText(`${String.fromCharCode(65 + index)}. ${normalizeExportText(choice.text)}`, questionFont, questionSize, sx(columnWidth - 20)));
    height += choiceLines.length * (questionSize + lineGap);
    height += 6;
    return height;
  };

  const pages = [];
  let current = { columns: Array.from({ length: columnCount }, () => []), heights: Array.from({ length: columnCount }, () => availableHeight), cursor: 0 };
  pages.push(current);
  for (const question of exam.questions || []) {
    const height = estimateQuestionHeight(question);
    let placed = false;
    while (!placed) {
      const index = current.cursor;
      if (current.heights[index] >= height || current.columns[index].length === 0) {
        current.columns[index].push(question);
        current.heights[index] -= height;
        placed = true;
      } else if (current.cursor < columnCount - 1) {
        current.cursor += 1;
      } else {
        current = { columns: Array.from({ length: columnCount }, () => []), heights: Array.from({ length: columnCount }, () => availableHeight), cursor: 0 };
        pages.push(current);
      }
    }
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pdfPage = pdf.addPage([pageWidth, pageHeight]);
    if (watermarkImage) {
      const watermarkWidth = sx(794 * 0.8 * (exam.watermark?.scale || 1));
      const watermarkHeight = sy(794 * 0.8 * (exam.watermark?.scale || 1));
      pdfPage.drawImage(watermarkImage, {
        x: (pageWidth - watermarkWidth) / 2,
        y: (pageHeight - watermarkHeight) / 2,
        width: watermarkWidth,
        height: watermarkHeight,
        opacity: exam.watermark?.opacity || 0.08
      });
    }
    if (headerImage) {
      const boxWidth = sx(numOr(exam.template?.headerBox?.width, 770));
      const boxHeight = sy(numOr(exam.template?.headerBox?.height, 96));
      const fitted = headerDimensions
        ? fitContainBox(boxWidth, boxHeight, sx(headerDimensions.width), sy(headerDimensions.height))
        : { width: boxWidth, height: boxHeight, offsetX: 0, offsetY: 0 };
      pdfPage.drawImage(headerImage, {
        x: sx(numOr(exam.template?.headerBox?.x, 12)) + fitted.offsetX,
        y: toPdfY((numOr(exam.template?.headerBox?.y, 10)) + fitted.offsetY / scaleY, fitted.height / scaleY),
        width: fitted.width,
        height: fitted.height
      });
    }
    if (footerImage) {
      const boxWidth = sx(numOr(exam.template?.footerBox?.width, 770));
      const boxHeight = sy(numOr(exam.template?.footerBox?.height, 36));
      const fitted = footerDimensions
        ? fitContainBox(boxWidth, boxHeight, sx(footerDimensions.width), sy(footerDimensions.height))
        : { width: boxWidth, height: boxHeight, offsetX: 0, offsetY: 0 };
      pdfPage.drawImage(footerImage, {
        x: sx(numOr(exam.template?.footerBox?.x, 12)) + fitted.offsetX,
        y: toPdfY((numOr(exam.template?.footerBox?.y, 1078)) + fitted.offsetY / scaleY, fitted.height / scaleY),
        width: fitted.width,
        height: fitted.height
      });
    }

    const titleText = exam.template?.titleBlock?.text || "Untitled Exam";
    pdfPage.drawText(titleText, {
      x: (pageWidth - titleFont.widthOfTextAtSize(titleText, titleSize)) / 2,
      y: toPdfY(titleBlockY, titleSize),
      size: titleSize,
      font: titleFont,
      color: rgb(0.1, 0.14, 0.22)
    });

    instructionLines.forEach((line, index) => {
      pdfPage.drawText(line, {
        x: (pageWidth - instructionFont.widthOfTextAtSize(line, instructionSize)) / 2,
        y: toPdfY(instructionBlockY + index * (instructionSize + 2), instructionSize),
        size: instructionSize,
        font: instructionFont,
        color: rgb(0.15, 0.18, 0.22)
      });
    });

    for (const [columnIndex, questions] of pages[pageIndex].columns.entries()) {
      const columnX = margins.left + columnIndex * (columnWidth + columnGap);
      let cursorY = contentTop;
      for (const question of questions) {
        const currentFont = questionFont;
        
        const stemLines = wrapText(`${question.number}. ${normalizeExportText(question.stem || "")}`, currentFont, questionSize, sx(columnWidth - 8));
        let imageTop = cursorY;
        let textX = columnX;
        let textWidth = columnWidth;
        if (question.image?.dataUrl) {
          const qImage = await embedDataImage(pdf, question.image.dataUrl);
          const imageWidth = clamp(question.imageBox?.width || question.imageWidth || 150, 80, columnWidth - 10);
          const imageHeight = clamp(question.imageBox?.height || Math.round(imageWidth * 0.8), 60, 220);
          const imageX = columnX + clamp(question.imageBox?.x || 0, 0, columnWidth - imageWidth);
          const imageY = cursorY + clamp(question.imageBox?.y || 0, 0, 220);
          pdfPage.drawImage(qImage, {
            x: sx(imageX),
            y: toPdfY(imageY, imageHeight),
            width: sx(imageWidth),
            height: sy(imageHeight)
          });
          if ((question.imagePosition || "top") === "top") {
            cursorY = imageY + imageHeight + 8;
          } else if (question.imagePosition === "left") {
            textX = imageX + imageWidth + 10;
            textWidth = columnWidth - (textX - columnX);
          } else if (question.imagePosition === "right") {
            textWidth = Math.max(90, imageX - columnX - 10);
          }
          imageTop = imageY;
        }

        const resolvedStemLines = wrapText(`${question.number}. ${normalizeExportText(question.stem || "")}`, currentFont, questionSize, sx(textWidth - 6));
        resolvedStemLines.forEach((line, lineIndex) => {
          drawMultiFontText(pdfPage, line, {
            x: sx(textX),
            y: toPdfY(cursorY + lineIndex * (questionSize + lineGap), questionSize),
            size: questionSize,
            color: rgb(0.07, 0.07, 0.1)
          }, currentFont, mathFont, question.subject);
        });
        let localY = cursorY + resolvedStemLines.length * (questionSize + lineGap) + 4;
        const filteredChoices = (question.choices || []).filter((choice) => choice.text?.trim());
        for (const [index, choice] of filteredChoices.entries()) {
          const choiceLines = wrapText(`${String.fromCharCode(65 + index)}. ${normalizeExportText(choice.text)}`, currentFont, questionSize, sx(textWidth - 12));
          choiceLines.forEach((line, lineIndex) => {
            drawMultiFontText(pdfPage, line, {
              x: sx(textX),
              y: toPdfY(localY + lineIndex * (questionSize + lineGap), questionSize),
              size: questionSize,
              color: rgb(0.07, 0.07, 0.1)
            }, currentFont, mathFont, question.subject);
          });
          localY += choiceLines.length * (questionSize + lineGap);
        }
        cursorY = Math.max(localY + 6, imageTop + (question.imageBox?.height || 0) + 4);
      }
    }

    if (exam.template?.pageNumberConfig?.visible !== false) {
      const label = `${pageIndex + 1}`;
      const pageNumberX = numOr(exam.template?.pageNumberConfig?.x, 750);
      const pageNumberY = numOr(exam.template?.pageNumberConfig?.y, 1048);
      const pageNumberSize = parsePx(exam.template?.pageNumberConfig?.fontSize, 10);
      pdfPage.drawText(label, {
        x: sx(pageNumberX),
        y: toPdfY(pageNumberY, pageNumberSize),
        size: pageNumberSize,
        font: pageNumberFont,
        color: rgb(0.2, 0.24, 0.3)
      });
    }
  }

  return Buffer.from(await pdf.save());
}

export async function renderHtmlToPdf(html) {
  const isVercel = !!process.env.VERCEL;
  const chromiumPath = await getChromiumPath();
  let browser;
  try {
    const launchOptions = {
      executablePath: chromiumPath,
      headless: true,
      args: isVercel
        ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--single-process"]
        : ["--no-sandbox", "--disable-setuid-sandbox"]
    };
    if (isVercel) {
      const chromium = (await import("@sparticuz/chromium")).default;
      launchOptions.args = chromium.args;
    }
    browser = await puppeteer.launch(launchOptions);
    
    const page = await browser.newPage();
    
    await page.setViewport({
      width: 794,
      height: 1123
    });
    
    await page.setContent(html, { waitUntil: "networkidle0" });
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const pdfBuffer = await page.pdf({
      width: "794px",
      height: "1123px",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    
    await browser.close();
    return pdfBuffer;
  } catch (puppeteerError) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("Error closing browser:", closeError);
      }
    }
    throw puppeteerError;
  }
}
