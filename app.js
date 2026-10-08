"use strict";

// 不依赖服务器；所有提示词只写入当前来源的 localStorage。
const STORAGE_KEY = "bingxiu-ai-prompts-v1";
const MODELS = ["可灵", "Seedance", "MiniMax H3", "其他"];
const $ = (id) => document.getElementById(id);
let prompts = [];
let activeModel = "全部";
let editingId = null;
let detailId = null;
let deletingId = null;
let storageBlocked = false;
let toastTimer;

function showMessage(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3200);
}

function decodePrompts(raw) {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  const ids = new Set();
  if (!Array.isArray(data) || !data.every((item) => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) ||
      typeof item.name !== "string" || !item.name.trim() || item.name.length > 100 ||
      !MODELS.includes(item.model) || typeof item.content !== "string" ||
      !item.content.trim() || item.content.length > 50000 ||
      typeof item.notes !== "string" || item.notes.length > 10000) return false;
    ids.add(item.id);
    return true;
  })) throw new Error("INVALID_DATA");
  return data;
}

function reportStorageError(error) {
  storageBlocked = true;
  $("storage-error").textContent = error.message === "INVALID_DATA" || error instanceof SyntaxError
    ? "本地提示词数据格式异常，暂时无法读取和修改。原数据未被覆盖；请保留当前浏览器的网站数据，以便恢复。"
    : "当前浏览器不允许读取本地存储，暂时无法保存提示词。请检查浏览器的网站存储权限，或使用普通浏览窗口后刷新。";
  $("storage-error").hidden = false;
  $("add-prompt").disabled = storageBlocked;
  $("empty-add").disabled = storageBlocked;
}

function loadPrompts() {
  try {
    prompts = decodePrompts(localStorage.getItem(STORAGE_KEY));
    storageBlocked = false;
    $("storage-error").hidden = true;
    $("add-prompt").disabled = false;
    $("empty-add").disabled = false;
  } catch (error) {
    reportStorageError(error);
  }
  render();
}

// 每次写入前重新读取，保留其他标签页已经保存的记录。
function persistChange(change, errorTarget) {
  try {
    if (storageBlocked) throw new Error("STORAGE_BLOCKED");
    const latest = decodePrompts(localStorage.getItem(STORAGE_KEY));
    const next = change(latest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    prompts = next;
    errorTarget.hidden = true;
    render();
    return true;
  } catch (error) {
    if (error.message === "INVALID_DATA" || error instanceof SyntaxError) reportStorageError(error);
    errorTarget.textContent = error.message === "RECORD_MISSING"
      ? "这条提示词已在其他标签页删除。请关闭窗口后重新添加。"
      : "保存失败，数据未写入。请检查浏览器存储权限或剩余空间，再重试；当前表单内容仍保留。";
    errorTarget.hidden = false;
    return false;
  }
}

function render() {
  for (const filter of document.querySelectorAll(".filter")) {
    const model = filter.dataset.model;
    filter.classList.toggle("active", model === activeModel);
    filter.setAttribute("aria-pressed", String(model === activeModel));
    filter.querySelector(".count").textContent = model === "全部" ? prompts.length : prompts.filter((p) => p.model === model).length;
  }
  const visible = prompts.filter((p) => activeModel === "全部" || p.model === activeModel);
  $("list-title").textContent = activeModel === "全部" ? "全部提示词" : `${activeModel} 提示词`;
  $("list-summary").textContent = `共 ${visible.length} 条提示词`;
  $("prompt-list").replaceChildren();
  for (const prompt of visible) {
    const card = $("prompt-card-template").content.firstElementChild.cloneNode(true);
    card.dataset.id = prompt.id;
    card.querySelector(".model-tag").textContent = prompt.model;
    card.querySelector(".model-tag").dataset.model = prompt.model;
    // 用户输入始终用 textContent 展示，避免当作 HTML 执行。
    card.querySelector(".prompt-name").textContent = prompt.name;
    card.querySelector(".prompt-content").textContent = prompt.content;
    card.querySelector(".prompt-notes").textContent = prompt.notes ? `备注：${prompt.notes}` : "暂无备注";
    $("prompt-list").append(card);
  }
  $("empty-state").hidden = visible.length > 0;
  $("empty-title").textContent = prompts.length === 0 ? "开始整理你的第一条提示词" : `还没有 ${activeModel} 提示词`;
  $("empty-description").textContent = prompts.length === 0 ? "把创作灵感收进提示词库，下次使用时一键复制。" : "为这个模型添加一条提示词，随时取用。";
}

function openEditor(prompt = null) {
  editingId = prompt?.id ?? null;
  $("prompt-form").reset();
  $("prompt-name").setCustomValidity("");
  $("prompt-content").setCustomValidity("");
  $("editor-title").textContent = prompt ? "编辑提示词" : "添加提示词";
  $("prompt-name").value = prompt?.name ?? "";
  $("prompt-model").value = prompt?.model ?? (activeModel === "全部" ? "可灵" : activeModel);
  $("prompt-content").value = prompt?.content ?? "";
  $("prompt-notes").value = prompt?.notes ?? "";
  $("form-error").hidden = true;
  $("editor-dialog").showModal();
  $("prompt-name").focus();
}

function openDetail(prompt, manualCopy = false) {
  detailId = prompt.id;
  $("detail-title").textContent = prompt.name;
  $("detail-model").textContent = prompt.model;
  $("detail-model").dataset.model = prompt.model;
  $("detail-content").textContent = prompt.content;
  $("detail-notes").textContent = prompt.notes || "暂无备注";
  $("manual-copy-hint").hidden = !manualCopy;
  if (!$("detail-dialog").open) $("detail-dialog").showModal();
  if (manualCopy) {
    const range = document.createRange();
    range.selectNodeContents($("detail-content"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

async function copyPrompt(prompt) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
    await navigator.clipboard.writeText(prompt.content);
    showMessage("提示词正文已复制");
    return;
  } catch {
    // 对 file:// 和非 HTTPS 预览提供兼容复制方法。
    const textarea = document.createElement("textarea");
    textarea.value = prompt.content;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;";
    const previouslyFocused = document.activeElement;
    const host = $("detail-dialog").open ? $("detail-dialog") : document.body;
    host.append(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { /* 显示手动复制入口。 */ }
    textarea.remove();
    previouslyFocused?.focus();
    if (copied) showMessage("提示词正文已复制");
    else openDetail(prompt, true);
  }
}

$("model-filters").addEventListener("click", (event) => {
  const filter = event.target.closest(".filter");
  if (!filter) return;
  activeModel = filter.dataset.model;
  render();
});
$("add-prompt").addEventListener("click", () => openEditor());
$("empty-add").addEventListener("click", () => openEditor());
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
for (const field of [$("prompt-name"), $("prompt-content")]) {
  field.addEventListener("input", () => {
    field.setCustomValidity(field.value.trim() ? "" : "请输入内容，不能只填写空格。");
  });
}
$("prompt-form").addEventListener("submit", (event) => {
  event.preventDefault();
  for (const field of [$("prompt-name"), $("prompt-content")]) {
    field.setCustomValidity(field.value.trim() ? "" : "请输入内容，不能只填写空格。");
  }
  if (!$("prompt-form").reportValidity()) return;
  const record = {
    id: editingId ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name: $("prompt-name").value.trim(),
    model: $("prompt-model").value,
    content: $("prompt-content").value,
    notes: $("prompt-notes").value,
  };
  const saved = persistChange((latest) => {
    if (!editingId) return [record, ...latest];
    if (!latest.some((p) => p.id === editingId)) throw new Error("RECORD_MISSING");
    return latest.map((p) => p.id === editingId ? record : p);
  }, $("form-error"));
  if (saved) {
    // 保存后展示记录所属分类，避免修改模型后记录突然不可见。
    if (activeModel !== "全部") activeModel = record.model;
    render();
    $("editor-dialog").close();
    showMessage(editingId ? "提示词已更新" : "提示词已添加");
  }
});
$("prompt-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const prompt = prompts.find((p) => p.id === button.closest(".prompt-card").dataset.id);
  if (!prompt) return;
  switch (button.dataset.action) {
    case "view": openDetail(prompt); break;
    case "edit": openEditor(prompt); break;
    case "copy": void copyPrompt(prompt); break;
    case "delete":
      deletingId = prompt.id;
      $("delete-description").textContent = `即将删除「${prompt.name}」。`;
      $("delete-error").hidden = true;
      $("delete-dialog").showModal();
      $("delete-dialog").querySelector("[data-close]").focus();
      break;
  }
});
$("detail-copy").addEventListener("click", () => {
  const prompt = prompts.find((p) => p.id === detailId);
  if (prompt) void copyPrompt(prompt);
  else showMessage("这条提示词已删除，请关闭详情窗口");
});
$("confirm-delete").addEventListener("click", () => {
  if (persistChange((latest) => latest.filter((p) => p.id !== deletingId), $("delete-error"))) {
    $("delete-dialog").close();
    showMessage("提示词已删除");
  }
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    loadPrompts();
    if ($("detail-dialog").open) {
      const prompt = prompts.find((p) => p.id === detailId);
      if (prompt) openDetail(prompt);
      else $("detail-dialog").close();
    }
  }
});
loadPrompts();
