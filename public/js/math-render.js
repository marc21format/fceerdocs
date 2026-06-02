import { escapeHtml } from './utils.js';

export function extractMathSegments(text) {
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

export function applyMathStyling(text, subject) {
  if (subject !== 'Math') {
    return document.createTextNode(text);
  }

  const segments = extractMathSegments(text);
  const fragment = document.createDocumentFragment();

  segments.forEach(segment => {
    if (segment.type === 'math') {
      const span = document.createElement('span');
      span.style.fontFamily = 'Times New Roman, serif';
      span.textContent = segment.value;
      fragment.append(span);
    } else {
      fragment.append(document.createTextNode(segment.value));
    }
  });

  return fragment;
}

export function renderMathExpression(source) {
  const math = normalizeMathText(source.trim());
  const span = document.createElement("span");
  span.className = "math-inline";
  let html = escapeHtml(math)
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>')
    .replace(/([A-Za-z0-9)\]])\^(\{[^}]+\}|[A-Za-z0-9+\-]+)/g, (_, base, exp) => `${base}<sup>${stripMathBraces(exp)}</sup>`)
    .replace(/([A-Za-z0-9)\]])_(\{[^}]+\}|[A-Za-z0-9+\-]+)/g, (_, base, sub) => `${base}<sub>${stripMathBraces(sub)}</sub>`)
    .replace(/sqrt\(([^)]+)\)/gi, '&radic;<span class="math-root">$1</span>')
    .replace(/âˆš\(([^)]+)\)/g, '&radic;<span class="math-root">$1</span>');
  span.innerHTML = html;
  return span;
}

export function stripMathBraces(value) {
  return escapeHtml(String(value).replace(/^\{|\}$/g, ""));
}

export function normalizeMathText(text) {
  return text
    .replace(/\\times|\\cdot/gi, "Ã—")
    .replace(/\\pm/gi, "Â±")
    .replace(/\\div/gi, "Ã·")
    .replace(/\\leq?|<=/gi, "â‰¤")
    .replace(/\\geq?|>=/gi, "â‰¥")
    .replace(/\\neq|!=/gi, "â‰ ")
    .replace(/\\approx/gi, "â‰ˆ")
    .replace(/\\pi/gi, "Ï€")
    .replace(/\\theta/gi, "Î¸")
    .replace(/\\alpha/gi, "Î±")
    .replace(/\\beta/gi, "Î²")
    .replace(/\\sqrt\{([^{}]+)\}/gi, "âˆš($1)");
}

export function renderStyledTextParts(text, subject) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;
  const regex = /(\*\*(.+?)\*\*)|(~~(.+?)~~)|(\*(.+?)\*)|(__(.+?)__)|(\[\[(.+?)::(.+?)\]\])|(%%([\s\S]+?)%%)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const beforeText = text.slice(lastIndex, match.index);
    if (beforeText) {
      fragment.append(applyMathStyling(beforeText, subject));
    }
    if (match[1]) {
      const el = document.createElement("b");
      el.append(renderStyledTextParts(match[2], subject));
      fragment.append(el);
    } else if (match[3]) {
      const el = document.createElement("i");
      el.append(renderStyledTextParts(match[4], subject));
      fragment.append(el);
    } else if (match[5]) {
      const el = document.createElement("i");
      el.append(renderStyledTextParts(match[6], subject));
      fragment.append(el);
    } else if (match[7]) {
      const el = document.createElement("u");
      el.append(renderStyledTextParts(match[8], subject));
      fragment.append(el);
    } else if (match[9]) {
      const wrapper = document.createElement("span");
      wrapper.className = "inline-annotation";
      const word = document.createElement("span");
      word.className = "annotation-word";
      word.textContent = match[10];
      const label = document.createElement("span");
      label.className = "annotation-label";
      label.textContent = match[11];
      wrapper.append(word, label);
      fragment.append(wrapper);
    } else if (match[12]) {
      fragment.append(renderMathExpression(match[13] || ""));
    }
    lastIndex = regex.lastIndex;
  }
  const remainingText = text.slice(lastIndex);
  if (remainingText) {
    fragment.append(applyMathStyling(remainingText, subject));
  }
  return fragment;
}
