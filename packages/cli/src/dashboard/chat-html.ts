interface AgentInfo {
  name: string
  webhookPath?: string
}

export function CHAT_HTML(agents: AgentInfo[]): string {
  const agentOptions = agents
    .filter((a) => a.webhookPath)
    .map(
      (a) =>
        `<option value="${a.webhookPath}" data-name="${a.name}">${a.name}</option>`,
    )
    .join('\n        ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>openAIOS Chat</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0d0d; --bg2: #161616; --bg3: #1e1e1e;
    --border: #2a2a2a; --text: #e0e0e0; --text2: #888;
    --accent: #4f8fff; --accent2: #3a6fd8;
    --user-bg: #1a2a40; --agent-bg: #1a1a2a;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  html, body { height: 100%; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; display: flex; flex-direction: column; }

  /* Header */
  header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
  header a { color: var(--text2); text-decoration: none; font-size: 12px; }
  header a:hover { color: var(--text); }
  header h1 { font-size: 16px; font-weight: 600; color: #fff; }
  header select { background: var(--bg3); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 13px; margin-left: auto; }
  .status { font-size: 12px; color: #4caf50; display: flex; align-items: center; gap: 6px; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4caf50; }

  /* Messages */
  #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 80%; padding: 12px 16px; border-radius: 12px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; }
  .msg.user { align-self: flex-end; background: var(--user-bg); border: 1px solid #2a4060; border-bottom-right-radius: 4px; }
  .msg.agent { align-self: flex-start; background: var(--agent-bg); border: 1px solid #2a2a40; border-bottom-left-radius: 4px; }
  .msg.agent .name { font-size: 11px; color: var(--accent); font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .msg.error { color: #f44336; font-style: italic; }
  .msg.system { align-self: center; color: var(--text2); font-size: 12px; background: none; padding: 4px; }
  .msg code { background: #2a2a2a; padding: 2px 5px; border-radius: 3px; font-family: var(--mono); font-size: 13px; }
  .msg pre { background: #111; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin: 8px 0; overflow-x: auto; font-family: var(--mono); font-size: 12px; line-height: 1.5; }
  .msg pre code { background: none; padding: 0; font-size: 12px; }
  .msg h1, .msg h2, .msg h3, .msg h4 { color: #fff; margin: 12px 0 6px; }
  .msg h1 { font-size: 18px; } .msg h2 { font-size: 16px; } .msg h3 { font-size: 14px; }
  .msg ul, .msg ol { margin: 6px 0; padding-left: 20px; }
  .msg li { margin: 3px 0; }
  .msg p { margin: 6px 0; }
  .msg blockquote { border-left: 3px solid var(--accent); padding-left: 12px; color: var(--text2); margin: 8px 0; }
  .msg strong { color: #fff; }
  .msg a { color: var(--accent); }
  .msg hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
  .msg table { border-collapse: collapse; margin: 8px 0; width: 100%; }
  .msg th, .msg td { border: 1px solid var(--border); padding: 6px 10px; font-size: 12px; text-align: left; }
  .msg th { background: #1a1a1a; color: #fff; }
  .thinking { align-self: flex-start; color: var(--text2); font-size: 13px; padding: 8px 16px; }
  .thinking::after { content: ''; animation: dots 1.5s infinite; }
  @keyframes dots { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }

  /* Input */
  #input-area { padding: 16px 20px; background: var(--bg2); border-top: 1px solid var(--border); flex-shrink: 0; }
  #input-wrap { display: flex; gap: 10px; max-width: 900px; margin: 0 auto; }
  #input { flex: 1; background: var(--bg3); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; font-size: 14px; font-family: var(--font); resize: none; outline: none; min-height: 44px; max-height: 200px; }
  #input:focus { border-color: var(--accent); }
  #send { background: var(--accent); color: #fff; border: none; border-radius: 10px; padding: 0 20px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  #send:hover { background: var(--accent2); }
  #send:disabled { opacity: 0.4; cursor: not-allowed; }
  .hint { text-align: center; color: var(--text2); font-size: 11px; margin-top: 8px; }
</style>
</head>
<body>
  <header>
    <a href="/">&larr; Dashboard</a>
    <h1>openAIOS Chat</h1>
    <div class="status"><span class="status-dot"></span> Connected</div>
    <select id="agent-select">
      ${agentOptions}
    </select>
  </header>

  <div id="messages">
    <div class="msg system">Send a message to start chatting with your agent.</div>
  </div>

  <div id="input-area">
    <div id="input-wrap">
      <textarea id="input" rows="1" placeholder="Type a message..." autofocus></textarea>
      <button id="send">Send</button>
    </div>
    <div class="hint">Enter to send &middot; Shift+Enter for newline</div>
  </div>

<script>
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const agentSelect = document.getElementById('agent-select');
let sending = false;

function getWebhookPath() {
  return agentSelect.value || '/webhook';
}

function getAgentName() {
  return agentSelect.selectedOptions[0]?.dataset.name || 'agent';
}

function addMessage(text, type, name) {
  const el = document.createElement('div');
  el.className = 'msg ' + type;
  if (type === 'agent' && name) {
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = name;
    el.appendChild(nameEl);
  }
  const content = document.createElement('div');
  content.innerHTML = renderMarkdown(text);
  el.appendChild(content);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function renderMarkdown(text) {
  // Fenced code blocks first (preserve content)
  const codeBlocks = [];
  let s = text.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
    codeBlocks.push('<pre><code>' + esc(code.trim()) + '</code></pre>');
    return '%%CODE' + (codeBlocks.length - 1) + '%%';
  });

  // Inline code (preserve content)
  s = s.replace(/\`([^\`]+)\`/g, (_, code) => '<code>' + esc(code) + '</code>');

  // Escape remaining HTML
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // But restore our code/pre tags
  s = s.replace(/&lt;(\\/?(?:code|pre))&gt;/g, '<$1>');

  // Block elements
  // Headers
  s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  s = s.replace(/^---$/gm, '<hr>');

  // Blockquotes
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  s = s.replace(/^[\\-\\*] (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\\/li>\\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  s = s.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');

  // Tables (simple: | col | col |)
  s = s.replace(/^\\|(.+)\\|$/gm, (match, inner) => {
    const cells = inner.split('|').map(c => c.trim());
    if (cells.every(c => /^[\\-:]+$/.test(c))) return ''; // separator row
    const tag = cells.length > 0 ? 'td' : 'td';
    return '<tr>' + cells.map(c => '<' + tag + '>' + c + '</' + tag + '>').join('') + '</tr>';
  });
  s = s.replace(/(<tr>.*<\\/tr>\\n?)+/g, '<table>$&</table>');

  // Inline formatting
  s = s.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
  s = s.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
  s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');

  // Paragraphs — convert double newlines to <p> breaks
  s = s.replace(/\\n\\n+/g, '</p><p>');
  s = '<p>' + s + '</p>';
  // Clean up empty paragraphs
  s = s.replace(/<p><\\/p>/g, '');
  s = s.replace(/<p>(<h[1-4]>)/g, '$1');
  s = s.replace(/(<\\/h[1-4]>)<\\/p>/g, '$1');
  s = s.replace(/<p>(<pre>)/g, '$1');
  s = s.replace(/(<\\/pre>)<\\/p>/g, '$1');
  s = s.replace(/<p>(<ul>)/g, '$1');
  s = s.replace(/(<\\/ul>)<\\/p>/g, '$1');
  s = s.replace(/<p>(<table>)/g, '$1');
  s = s.replace(/(<\\/table>)<\\/p>/g, '$1');
  s = s.replace(/<p>(<hr>)/g, '$1');
  s = s.replace(/<p>(<blockquote>)/g, '$1');

  // Restore code blocks
  s = s.replace(/%%CODE(\\d+)%%/g, (_, i) => codeBlocks[parseInt(i)] || '');

  return s;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || sending) return;

  addMessage(text, 'user');
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sending = true;
  sendBtn.disabled = true;

  const thinking = document.createElement('div');
  thinking.className = 'thinking';
  thinking.textContent = getAgentName() + ' is thinking';
  messagesEl.appendChild(thinking);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const res = await fetch(getWebhookPath(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    thinking.remove();

    if (!res.ok) {
      addMessage('Error: ' + res.status + ' ' + res.statusText, 'error');
    } else {
      const data = await res.json();
      addMessage(data.output || 'No response.', 'agent', getAgentName());
    }
  } catch (err) {
    thinking.remove();
    addMessage('Connection error: ' + err.message, 'error');
  } finally {
    sending = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Auto-resize textarea
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
});
</script>
</body>
</html>`
}
