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
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }
  msg.appendChild(bubble);

  // Show attached files (images or names)
  if (files && files.length) {
    const fileList = document.createElement('div');
    fileList.className = 'file-list';
    files.forEach(f => {
      if (f.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = f.preview || '';
        img.alt = f.name;
        fileList.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.textContent = `📄 ${f.name}`;
        fileList.appendChild(span);
      }
    });
    bubble.appendChild(fileList);
  }

  chatWindow.appendChild(msg);
  scrollChatToBottom();
  return bubble;
}

// Typing animation
function showTyping() {
  return addMessage({ role: 'ai', content: '...', isTyping: true });
}
function removeTyping(bubble) {
  if (bubble && bubble.parentNode) bubble.parentNode.remove();
}

// File handling
let attachedFiles = [];
fileInput.onchange = function() {
  attachedFiles = Array.from(fileInput.files).map(f => {
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => { f.preview = e.target.result; };
      reader.readAsDataURL(f);
    }
    return f;
  });
};

// Prepare Perplexity API call
async function fetchPerplexityStream({ messages, apiKey, model }) {
  const url = "https://api.perplexity.ai/chat/completions";
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  const body = JSON.stringify({
    model,
    messages,
    stream: true
  });

  const response = await fetch(url, { method: "POST", headers, body });
  if (!response.ok) throw new Error(`API error: ${response.status}`);

  // Stream reader
  const reader = response.body.getReader();
  let decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let onData = () => {};
  let onError = () => {};
  let onDone = () => {};

  async function processStream() {
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      // Perplexity streams JSON lines, one per delta
      let lines = buffer.split('\n');
      buffer = lines.pop();
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            onData(data.choices[0].delta.content);
          }
        } catch (e) {
          // ignore malformed lines
        }
      }
    }
    onDone();
  }
  setTimeout(processStream, 0);
  return {
    onData: fn => { onData = fn; return this; },
    onError: fn => { onError = fn; return this; },
    onDone: fn => { onDone = fn; return this; }
  };
}

// Compose system prompt based on project mode
function getSystemPrompt(settings) {
  let prompt = settings.systemPrompt;
  if (settings.projectMode === 'model-brand') {
    prompt += "\nYou assist with model-brand compatibility. When the user uploads a model image and details (ethnicity, measurements), analyze compatibility with brands and suggest best matches. Respond in Markdown.";
  } else if (settings.projectMode === 'contracts') {
    prompt += "\nYou assist with contract simplification and compliance for model agencies, especially mother agent contracts. Provide concise, actionable advice. Respond in Markdown.";
  } else if (settings.projectMode === 'hairstyles') {
    prompt += "\nYou are a fashion and hair trends expert. When the user uploads a model image and brand type, suggest on-trend hairstyles that fit the model and brand. Respond in Markdown.";
  }
  return prompt;
}

// Main chat submit handler
chatForm.onsubmit = async function(e) {
  e.preventDefault();
  if (isStreaming) return;
  const settings = {
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    systemPrompt: getSystemPrompt({
      systemPrompt: systemPromptInput.value,
      projectMode: projectModeSelect.value
    }),
    projectMode: projectModeSelect.value
  };
  if (!settings.apiKey) {
    alert("Please enter your Perplexity API key in settings.");
    showSettings();
    return;
  }
  let userMsg = userInput.value.trim();
  if (!userMsg && !attachedFiles.length) return;

  // Attach files to message (show in chat)
  let filesToShow = [];
  for (let f of attachedFiles) {
    if (f.type.startsWith('image/')) {
      // Wait for preview to be loaded
      if (!f.preview) {
        await new Promise(res => {
          const reader = new FileReader();
          reader.onload = e => { f.preview = e.target.result; res(); };
          reader.readAsDataURL(f);
        });
      }
    }
    filesToShow.push({
      name: f.name,
      type: f.type,
      preview: f.preview || null
    });
  }

  addMessage({ role: 'user', content: userMsg, files: filesToShow });
  userInput.value = '';
  attachedFiles = [];
  fileInput.value = '';

  // Prepare messages for API
  let messages = [
    { role: "system", content: settings.systemPrompt }
  ];
  // If files, describe them for the AI
  if (filesToShow.length) {
    let desc = filesToShow.map(f => {
      if (f.type.startsWith('image/')) return `[Image file: ${f.name}]`;
      else return `[File: ${f.name}]`;
    }).join(' ');
    userMsg += `\n\nAttached files: ${desc}`;
  }
  messages.push({ role: "user", content: userMsg });

  // Show typing animation
  isStreaming = true;
  const typingBubble = showTyping();

  try {
    let aiContent = '';
    const stream = await fetchPerplexityStream({
      messages,
      apiKey: settings.apiKey,
      model: settings.model
    });
    stream.onData(chunk => {
      aiContent += chunk;
      typingBubble.innerHTML = renderMarkdown(aiContent);
      scrollChatToBottom();
    }).onDone(() => {
      typingBubble.classList.remove('typing');
      isStreaming = false;
    }).onError(err => {
      typingBubble.innerHTML = `<span style="color:#e00;">Error: ${err.message}</span>`;
      typingBubble.classList.remove('typing');
      isStreaming = false;
    });
  } catch (err) {
    typingBubble.innerHTML = `<span style="color:#e00;">${err.message}</span>`;
    typingBubble.classList.remove('typing');
    isStreaming = false;
  }
};

// Markdown rendering library (marked.js) via CDN
(function loadMarked(){
  if (window.marked) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  document.head.appendChild(s);
})();

// Auto-expand textarea
userInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
});

// Save settings on change
[apiKeyInput, modelSelect, systemPromptInput, projectModeSelect].forEach(el => {
  el.addEventListener('change', saveSettings);
  el.addEventListener('input', saveSettings);
});

// Keyboard shortcut for settings (Ctrl+,)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === ',') {
    e.preventDefault();
    showSettings();
  }
});
