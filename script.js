// === Utility functions ===
function $(q) { return document.querySelector(q); }
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

// === Settings Modal Logic ===
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const closeSettings = $('#closeSettings');
const saveSettingsBtn = $('#saveSettingsBtn');

const apiKeyInput = $('#apiKeyInput');
const modelSelect = $('#modelSelect');
const systemPromptInput = $('#systemPromptInput');
const projectModeSelect = $('#projectModeSelect');

function showSettings() { settingsModal.classList.add('show'); }
function hideSettings() { settingsModal.classList.remove('show'); }

settingsBtn.onclick = showSettings;
closeSettings.onclick = hideSettings;
settingsModal.onclick = e => { if (e.target === settingsModal) hideSettings(); };

const defaultSettings = {
  apiKey: "",
  model: "sonar",
  systemPrompt: "You are an expert AI assistant for a model agency. Respond with clear, actionable advice and use Markdown formatting.",
  projectMode: "model-brand"
};

function loadSettings() {
  const s = loadLocal('chatbotSettings', defaultSettings);
  apiKeyInput.value = s.apiKey || "";
  modelSelect.value = s.model || "sonar";
  systemPromptInput.value = s.systemPrompt || defaultSettings.systemPrompt;
  projectModeSelect.value = s.projectMode || "model-brand";
}
function saveSettings() {
  const s = {
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    systemPrompt: systemPromptInput.value.trim(),
    projectMode: projectModeSelect.value
  };
  saveLocal('chatbotSettings', s);
  hideSettings();
}
saveSettingsBtn.onclick = () => { saveSettings(); };
window.addEventListener('DOMContentLoaded', loadSettings);

// === Chat Logic ===
const chatWindow = $('#chatWindow');
const chatForm = $('#chatForm');
const userInput = $('#userInput');
const sendBtn = $('#sendBtn');
const fileInput = $('#fileInput');

let isStreaming = false;

// Markdown rendering (using marked.js CDN)
function renderMarkdown(md) {
  if (window.marked) return window.marked.parse(md);
  // fallback: basic
  return md.replace(/\n/g, "<br>");
}

// Scroll to bottom helper
function scrollChatToBottom() {
  setTimeout(() => { chatWindow.scrollTop = chatWindow.scrollHeight; }, 100);
}

// Add message to chat window
function addMessage({ role, content, files = [], isTyping = false }) {
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isTyping ? ' typing' : '');
  if (role === 'ai') {
    bubble
