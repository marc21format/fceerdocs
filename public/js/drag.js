import {
  PAGE,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  PAGE_MIN_WIDTH
} from './config.js';
import {
  state,
  saveState,
  getHeaderAspectRatio,
  getFooterAspectRatio
} from './state.js';
import { clamp } from './utils.js';
import { uiState } from './ui-state.js';
import { getQuestionImageAspectRatio } from './layout.js';

let callbacks = {
  renderPages: () => {},
  applySidebarWidth: () => {}
};

export function registerDragCallbacks(cbs) {
  Object.assign(callbacks, cbs);
}

export function startDatabaseSidebarResize(event) {
  event.preventDefault();
  event.stopPropagation();
  const layout = document.querySelector('.database-modal-layout');
  if (!layout) return;
  const currentWidth = layout.querySelector('.database-list-panel')?.getBoundingClientRect().width || 320;
  uiState.activePointerAction = {
    mode: "database-sidebar-resize",
    startX: event.clientX,
    initialWidth: currentWidth
  };
  document.body.classList.add("modal-resize-active");
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopPointerAction, { once: true });
}

export function startSidebarResize(event) {
  event.preventDefault();
  event.stopPropagation();
  uiState.activePointerAction = {
    mode: "sidebar-resize",
    startX: event.clientX,
    initialWidth: state.ui.sidebarWidth
  };
  document.body.classList.add("sidebar-resizing");
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopPointerAction, { once: true });
}

export function startDragAction(event, node) {
  const handle = event.target.closest(".resize-handle");
  const kind = node.dataset.kind;
  const rect = node.getBoundingClientRect();
  const page = node.closest(".exam-page");
  if (!page) return;
  event.preventDefault();
  event.stopPropagation();
  state.ui.selected = kind === "question-image" ? `image:${node.dataset.questionId}` : kind;
  const pageRect = page.getBoundingClientRect();
  const referenceRect = kind === "question-image"
    ? node.offsetParent?.getBoundingClientRect() || pageRect
    : pageRect;
  uiState.activePointerAction = {
    mode: handle ? "resize" : "drag",
    kind,
    questionId: node.dataset.questionId,
    startX: event.clientX,
    startY: event.clientY,
    initial: {
      left: rect.left - referenceRect.left,
      top: rect.top - referenceRect.top,
      width: rect.width,
      height: rect.height,
      fontSize: kind === "page-number" ? parseFloat(getComputedStyle(node).fontSize) : 0
    }
  };
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopPointerAction, { once: true });
}

export function handlePointerMove(event) {
  if (!uiState.activePointerAction) return;
  const dx = event.clientX - uiState.activePointerAction.startX;
  const dy = event.clientY - uiState.activePointerAction.startY;
  const action = uiState.activePointerAction;
  if (action.mode === "sidebar-resize") {
    callbacks.applySidebarWidth(action.initialWidth - dx);
    return;
  }
  if (action.mode === "database-sidebar-resize") {
    const newWidth = clamp(action.initialWidth + dx, 220, 600);
    const layout = document.querySelector('.database-modal-layout');
    if (layout) layout.style.setProperty('--db-sidebar-width', newWidth + 'px');
    return;
  }
  if (action.kind === "header") {
    mutateAspectLockedBox(state.template.headerBox, action, dx, dy, PAGE.width, PAGE.height, getHeaderAspectRatio());
  } else if (action.kind === "footer") {
    mutateAspectLockedBox(state.template.footerBox, action, dx, dy, PAGE.width, PAGE.height, getFooterAspectRatio());
  } else if (action.kind === "page-number") {
    if (action.mode === "resize") {
      state.template.pageNumberConfig.fontSize = clamp(action.initial.fontSize + dy * -0.12 + dx * 0.04, 8, 28);
    } else {
      state.template.pageNumberConfig.x = clamp(action.initial.left + dx, 0, PAGE.width - 8);
      state.template.pageNumberConfig.y = clamp(action.initial.top + dy, 0, PAGE.height - 8);
    }
  } else if (action.kind === "question-image") {
    const question = state.questions.find((item) => item.id === action.questionId);
    if (!question || !uiState.currentPagination) return;
    const columnWidth = uiState.currentPagination.metrics.columnWidth;
    const ratio = getQuestionImageAspectRatio(question);
    mutateAspectLockedBox(question.imageBox, action, dx, dy, columnWidth, 1200, ratio, 40);
    question.imageWidth = question.imageBox.width;
  }
  callbacks.renderPages();
}

export function mutateBox(box, action, dx, dy, maxWidth, maxHeight, minWidth = 10, minHeight = 10) {
  if (action.mode === "resize") {
    box.width = Math.max(minWidth, action.initial.width + dx);
    box.height = Math.max(minHeight, action.initial.height + dy);
  } else {
    const imgW = box.width || action.initial.width;
    const imgH = box.height || action.initial.height;
    box.x = clamp(action.initial.left + dx, 0, Math.max(0, maxWidth - imgW));
    box.y = clamp(action.initial.top + dy, 0, Math.max(0, maxHeight - imgH));
  }
}

export function mutateAspectLockedBox(box, action, dx, dy, maxWidth, maxHeight, ratio, minWidth = 80) {
  if (action.mode === "resize") {
    const dominantDelta = Math.abs(dx) > Math.abs(dy * ratio) ? dx : dy * ratio;
    const maxAllowedWidth = Math.max(
      minWidth,
      Math.min(maxWidth - action.initial.left, (maxHeight - action.initial.top) * ratio)
    );
    const width = clamp(action.initial.width + dominantDelta, minWidth, maxAllowedWidth);
    box.width = width;
    box.height = Math.max(24, Math.round(width / ratio));
  } else {
    box.x = clamp(action.initial.left + dx, 0, maxWidth - (box.width || action.initial.width));
    box.y = clamp(action.initial.top + dy, 0, maxHeight - (box.height || action.initial.height));
  }
}

export function stopPointerAction() {
  window.removeEventListener("pointermove", handlePointerMove);
  const mode = uiState.activePointerAction?.mode;
  uiState.activePointerAction = null;
  document.body.classList.remove("sidebar-resizing");
  document.body.classList.remove("modal-resize-active");
  if (mode === "sidebar-resize") {
    callbacks.applySidebarWidth(state.ui.sidebarWidth);
    callbacks.renderPages();
  }
  saveState(mode === "sidebar-resize" ? "Sidebar width updated" : "Position updated");
}
