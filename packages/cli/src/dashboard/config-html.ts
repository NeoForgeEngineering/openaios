export const CONFIG_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>openAIOS Config</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0a; --bg2: #111; --bg3: #181818; --bg4: #222;
    --border: #252525; --border2: #333;
    --text: #ddd; --text2: #888; --text3: #555;
    --accent: #4f8fff; --accent2: #3a6fd8;
    --green: #4caf50; --red: #e53935; --orange: #ff9800; --purple: #9c27b0; --cyan: #00bcd4;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'SF Mono', Consolas, monospace;
  }
  html, body { height: 100%; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 13px; display: flex; flex-direction: column; }

  /* Header */
  header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
  header a { color: var(--text2); text-decoration: none; font-size: 12px; }
  header a:hover { color: var(--text); }
  header h1 { font-size: 15px; font-weight: 600; color: #fff; }
  .spacer { flex: 1; }
  .nav a { color: var(--text2); text-decoration: none; padding: 4px 10px; font-size: 12px; }
  .nav a:hover { color: var(--text); }

  /* Layout */
  .layout { display: flex; flex: 1; overflow: hidden; }
  .sidebar { width: 200px; border-right: 1px solid var(--border); overflow-y: auto; background: var(--bg2); }
  .sidebar-item { padding: 10px 16px; cursor: pointer; color: var(--text2); font-size: 13px; border-left: 3px solid transparent; }
  .sidebar-item:hover { background: var(--bg3); color: var(--text); }
  .sidebar-item.active { background: var(--bg3); color: #fff; border-left-color: var(--accent); }
  .sidebar-item .si-sub { font-size: 10px; color: var(--text3); margin-top: 2px; }
  .sidebar-section { padding: 8px 16px 4px; font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; }

  .main { flex: 1; overflow-y: auto; padding: 24px 32px; max-width: 800px; }

  /* Toast */
  .toast { position: fixed; top: 16px; right: 16px; padding: 10px 16px; border-radius: 6px; font-size: 12px; z-index: 100; display: none; }
  .toast.success { background: #1a3a1a; color: var(--green); border: 1px solid #2a4a2a; }
  .toast.error { background: #3a1a1a; color: var(--red); border: 1px solid #4a2a2a; }
  .toast.info { background: #1a2a3a; color: var(--accent); border: 1px solid #2a3a4a; }

  /* Section titles */
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
  .section-title .badge { font-size: 9px; padding: 2px 6px; border-radius: 3px; background: var(--bg4); color: var(--text2); }
  .section-title .badge.warn { background: #2a2000; color: var(--orange); }
  .section-title .badge.ok { background: #1a2a1a; color: var(--green); }

  /* Forms */
  label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 4px; margin-top: 12px; }
  label:first-child { margin-top: 0; }
  .label-hint { font-size: 10px; color: var(--text3); margin-left: 4px; }
  input, textarea, select { width: 100%; background: var(--bg3); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: var(--font); outline: none; }
  input:focus, textarea:focus, select:focus { border-color: var(--accent); }
  textarea { min-height: 80px; resize: vertical; font-family: var(--mono); font-size: 12px; line-height: 1.5; }
  select { cursor: pointer; }
  .input-row { display: flex; gap: 10px; align-items: flex-end; }
  .input-row > * { flex: 1; }

  /* Tool chips */
  .tool-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .tool-chip { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 5px; font-size: 12px; cursor: pointer; border: 1px solid var(--border); background: var(--bg3); user-select: none; transition: all 0.15s; }
  .tool-chip:hover { border-color: var(--border2); }
  .tool-chip.on { background: #1a2a1a; border-color: #2d5a2d; color: var(--green); }
  .tool-chip.denied { background: #2a1a1a; border-color: #4a2a2a; color: var(--red); text-decoration: line-through; }
  .tool-category { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 10px; margin-bottom: 4px; }

  /* Channel cards */
  .ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
  .ch-card { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.15s; position: relative; }
  .ch-card:hover { border-color: var(--border2); }
  .ch-card.active { border-color: var(--green); }
  .ch-card .ch-icon { font-size: 18px; margin-bottom: 6px; }
  .ch-card .ch-name { font-weight: 600; font-size: 13px; }
  .ch-card .ch-status { font-size: 10px; color: var(--text3); margin-top: 4px; }
  .ch-card.active .ch-status { color: var(--green); }
  .ch-card .ch-remove { position: absolute; top: 8px; right: 8px; color: var(--text3); cursor: pointer; font-size: 14px; display: none; }
  .ch-card:hover .ch-remove { display: block; }
  .ch-card .ch-remove:hover { color: var(--red); }

  /* Runner selector */
  .runner-cards { display: flex; gap: 8px; }
  .runner-card { flex: 1; padding: 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: var(--bg3); text-align: center; transition: all 0.15s; }
  .runner-card:hover { border-color: var(--border2); }
  .runner-card.active { border-color: var(--accent); background: #111828; }
  .runner-card .rc-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .runner-card .rc-desc { font-size: 10px; color: var(--text3); }

  /* Provider selector */
  .prov-cards { display: flex; gap: 8px; flex-wrap: wrap; }
  .prov-card { padding: 10px 16px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; background: var(--bg3); text-align: center; transition: all 0.15s; min-width: 120px; }
  .prov-card:hover { border-color: var(--border2); }
  .prov-card.active { border-color: var(--purple); background: #1a1028; }
  .prov-card .pc-name { font-weight: 600; font-size: 13px; }
  .prov-card .pc-desc { font-size: 10px; color: var(--text3); margin-top: 2px; }

  /* Buttons */
  .btn { padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--border); background: var(--bg3); color: var(--text); }
  .btn:hover { background: var(--bg4); }
  .btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn.primary:hover { background: var(--accent2); }
  .btn.danger { color: var(--red); }
  .btn.danger:hover { background: #2a1a1a; }
  .save-bar { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }

  /* Modal */
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 50; display: none; align-items: center; justify-content: center; }
  .modal-bg.open { display: flex; }
  .modal { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 24px; width: 420px; max-width: 90vw; }
  .modal h3 { font-size: 15px; margin-bottom: 16px; }
  .modal .btn-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }

  /* Audit inline */
  .audit-warn { padding: 6px 10px; background: #1a1800; border-left: 3px solid var(--orange); border-radius: 0 4px 4px 0; margin-bottom: 6px; font-size: 11px; color: var(--orange); }
</style>
</head>
<body>
<header>
  <a href="/">&larr; Dashboard</a>
  <h1>Agent Configuration</h1>
  <div class="spacer"></div>
  <div class="nav">
    <a href="/live">Live Flow</a>
    <a href="/chat">Chat</a>
    <a href="/">Status</a>
  </div>
</header>
<div class="toast" id="toast"></div>

<div class="layout">
  <div class="sidebar" id="sidebar"></div>
  <div class="main" id="main">
    <div style="color:var(--text3)">Select an agent to configure</div>
  </div>
</div>

<div class="modal-bg" id="modal-bg">
  <div class="modal" id="modal"></div>
</div>

<script>
let config = { agents: [] };
let selected = null;

const TOOLS = {
  'Claude Code (advisory)': ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch', 'NotebookEdit'],
  'Filesystem (governed)': ['filesystem_read', 'filesystem_write', 'filesystem_edit', 'filesystem_glob', 'filesystem_grep'],
  'Shell (governed)': ['shell_exec'],
  'Web (governed)': ['web_fetch', 'web_search', 'pdf_parse', 'image_analyze'],
  'Memory (governed)': ['memory_search', 'memory_get'],
  'Browser (governed)': ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_fill', 'browser_screenshot'],
  'Agent': ['call_agent'],
};

const PROVIDERS = [
  { id: 'claude-code', name: 'Claude Code', desc: 'Full agentic runtime with filesystem', env: 'native', governed: false, models: ['claude-opus-4-6-20250514','claude-sonnet-4-6-20250514','claude-haiku-4-5-20251001'], note: 'Agent owns tool execution. openAIOS governs via CLI permissions — advisory only.' },
  { id: 'anthropic-api', name: 'Anthropic API', desc: 'Claude models via governed SDK', env: 'governed', governed: true, models: ['claude-opus-4-6-20250514','claude-sonnet-4-6-20250514','claude-haiku-4-5-20251001'], note: 'Every tool call passes through openAIOS ToolExecutor + governance. No escape hatches.', apiKey: 'ANTHROPIC_API_KEY' },
  { id: 'ollama', name: 'Ollama', desc: 'Local models, fully governed', env: 'governed', governed: true, models: [], note: 'OpenAI-compatible API at localhost:11434. Models auto-discovered. All tool calls governed.' },
  { id: 'openai-api', name: 'OpenAI API', desc: 'GPT + o-series via governed SDK', env: 'governed', governed: true, models: [], note: 'Every tool call passes through openAIOS ToolExecutor + governance. Models auto-discovered.', apiKey: 'OPENAI_API_KEY' },
  { id: 'requesty', name: 'Requesty', desc: 'Multi-model gateway, fully governed', env: 'governed', governed: true, models: [], note: 'Routes to 400+ models (Gemini, Claude, GPT, Llama, etc). Models auto-discovered. All tool calls governed.', apiKey: 'REQUESTY_API_KEY' },
  { id: 'openrouter', name: 'OpenRouter', desc: '200+ models, fully governed', env: 'governed', governed: true, models: [], note: 'Model marketplace. Models auto-discovered. All tool calls governed.', apiKey: 'OPENROUTER_API_KEY' },
];

const CHANNELS = [
  { id: 'telegram', name: 'Telegram', icon: '✈', fields: [{k:'token',l:'Bot Token',t:'password',req:1}] },
  { id: 'slack', name: 'Slack', icon: '#', fields: [{k:'token',l:'Bot Token',t:'password',req:1},{k:'app_token',l:'App Token',t:'password',req:1},{k:'signing_secret',l:'Signing Secret',t:'password'}] },
  { id: 'webhook', name: 'Webhook', icon: '⚡', fields: [{k:'path',l:'Path',t:'text',req:1,ph:'/webhook'},{k:'secret',l:'Secret',t:'password'}] },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬', fields: [{k:'session_name',l:'Session Name',t:'text',ph:'default'}] },
  { id: 'signal', name: 'Signal', icon: '🔒', fields: [{k:'phone_number',l:'Phone Number',t:'text',req:1,ph:'+1234567890'}] },
  { id: 'discord', name: 'Discord', icon: '🎮', fields: [{k:'token',l:'Bot Token',t:'password',req:1},{k:'guildId',l:'Guild ID',t:'text'}] },
  { id: 'google_chat', name: 'Google Chat', icon: '💬', fields: [{k:'path',l:'Webhook Path',t:'text',ph:'/google-chat'}] },
  { id: 'imessage', name: 'iMessage', icon: '🍎', fields: [{k:'poll_interval_ms',l:'Poll Interval (ms)',t:'number',ph:'5000'}] },
];

const RUNNERS = [
  { id: 'docker', name: 'Docker', desc: 'Sandboxed container', icon: '🐳' },
  { id: 'native', name: 'Native', desc: 'Host access (dev only)', icon: '💻' },
  { id: 'external', name: 'External', desc: 'Remote API endpoint', icon: '🌐' },
];

const liveModels = {};   // provider → [{id, name}]
const loadingModels = {}; // provider → boolean
let roles = [];          // loaded from /api/roles

async function load() {
  const [cfgRes, rolesRes] = await Promise.all([fetch('/api/config'), fetch('/api/roles')]);
  config = await cfgRes.json();
  const rolesData = await rolesRes.json();
  roles = rolesData.roles || [];
  renderSidebar();
  if (selected) selectAgent(selected);
}

async function fetchModels(agentName, provId) {
  loadingModels[provId] = true;
  if (agentName) { const a = getAgent(agentName); if (a) renderMain(a); }

  try {
    const res = await fetch('/api/models/' + provId);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      liveModels[provId] = data.models;
      toast(data.models.length + ' models loaded from ' + provId, 'success');
    } else {
      toast('No models returned from ' + provId + (data.error ? ': ' + data.error : ''), 'info');
    }
  } catch (err) {
    toast('Failed to fetch models: ' + err.message, 'error');
  }

  loadingModels[provId] = false;
  if (agentName) { const a = getAgent(agentName); if (a) renderMain(a); }
}

function renderSidebar() {
  const sb = document.getElementById('sidebar');
  sb.innerHTML = '<div class="sidebar-section">Agents</div>' +
    (config.agents || []).map(a => {
      const active = selected === a.name ? ' active' : '';
      const chCount = Object.keys(a.channels || {}).filter(k => k !== 'group_routing' && k !== 'dm_allowlist' && a.channels[k]).length;
      return '<div class="sidebar-item' + active + '" onclick="selectAgent(\\'' + a.name + '\\')">' +
        '<div>' + esc(a.name) + '</div>' +
        '<div class="si-sub">' + (a.model?.default || '?') + ' · ' + chCount + ' ch</div>' +
      '</div>';
    }).join('');
}

function selectAgent(name) {
  selected = name;
  renderSidebar();
  const a = config.agents.find(x => x.name === name);
  if (!a) return;
  renderMain(a);
}

function renderMain(a) {
  const m = document.getElementById('main');
  m.innerHTML = renderRoleSection(a) + renderProviderSection(a) + renderModelSection(a) +
    renderPersonaSection(a) + renderToolsSection(a) + renderChannelsSection(a) +
    renderRunnerSection(a) + renderSaveBar(a);
}

function renderRoleSection(a) {
  const currentRole = a.role || '';
  const options = roles.map(r => {
    const sel = r.id === currentRole ? ' selected' : '';
    return '<option value="' + esc(r.id) + '"' + sel + '>' + esc(r.name) + ' — ' + esc(r.description) + '</option>';
  }).join('');

  let html = '<div class="section"><div class="section-title">Role <span class="badge">' + (currentRole || 'custom') + '</span></div>';
  html += '<select onchange="setRole(\\'' + a.name + '\\', this.value)">';
  html += '<option value=""' + (!currentRole ? ' selected' : '') + '>Custom (manual config)</option>';
  html += options;
  html += '</select>';

  if (currentRole) {
    const role = roles.find(r => r.id === currentRole);
    if (role) {
      html += '<div style="margin-top:8px;padding:10px;background:var(--bg3);border-radius:6px;border-left:3px solid var(--accent);font-size:12px">';
      html += '<strong>' + esc(role.name) + '</strong><br>';
      html += '<span style="color:var(--text2)">' + esc(role.description) + '</span><br>';
      html += '<span style="color:var(--text3);font-size:11px">Tools: ' + role.tools.allow.join(', ') + '</span>';
      if (role.tools.deny.length > 0) {
        html += '<br><span style="color:var(--red);font-size:11px">Denied: ' + role.tools.deny.join(', ') + '</span>';
      }
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

function setRole(agentName, roleId) {
  const a = getAgent(agentName);
  if (!a) return;

  if (!roleId) {
    delete a.role;
    renderMain(a);
    return;
  }

  const role = roles.find(r => r.id === roleId);
  if (!role) return;

  a.role = roleId;
  a.persona = role.persona;
  a.permissions = a.permissions || { allow: [], deny: [] };
  a.permissions.allow = [...role.tools.allow];
  a.permissions.deny = [...role.tools.deny];

  if (role.suggested_model) {
    // Map tier to a sensible default if no model set
    const tierModels = { fast: 'claude-haiku-4-5-20251001', standard: 'claude-sonnet-4-6-20250514', premium: 'claude-opus-4-6-20250514' };
    const prov = detectProvider(a);
    if (prov === 'claude-code' || prov === 'anthropic-api') {
      a.model = a.model || {};
      if (!a.model.default) a.model.default = tierModels[role.suggested_model] || a.model.default;
    }
  }

  renderMain(a);
  renderSidebar();
  toast('Role "' + role.name + '" applied — review and save', 'info');
}

function renderProviderSection(a) {
  const prov = detectProvider(a);
  const activeProv = PROVIDERS.find(p => p.id === prov);
  let html = '<div class="section"><div class="section-title">Provider</div>' +
    '<div class="prov-cards">' +
    PROVIDERS.map(p => {
      const active = p.id === prov ? ' active' : '';
      const badge = p.governed
        ? '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#1a2a1a;color:#4caf50;margin-left:4px">governed</span>'
        : '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#2a2000;color:#ff9800;margin-left:4px">advisory</span>';
      return '<div class="prov-card' + active + '" onclick="setProvider(\\'' + a.name + '\\',\\'' + p.id + '\\')">' +
        '<div class="pc-name">' + p.name + badge + '</div><div class="pc-desc">' + p.desc + '</div></div>';
    }).join('') +
    '</div>';
  // Show note for active provider
  if (activeProv?.note) {
    html += '<div style="margin-top:8px;padding:8px 10px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--text2);border-left:3px solid var(--accent)">' + activeProv.note + '</div>';
  }
  if (activeProv?.apiKey) {
    html += '<div style="margin-top:6px;font-size:11px;color:var(--text3)">Requires <code style=\\"background:var(--bg4);padding:1px 4px;border-radius:3px\\">' + activeProv.apiKey + '</code> in .env</div>';
  }
  html += '</div>';
  return html;
}

function renderModelSection(a) {
  const prov = detectProvider(a);
  const provDef = PROVIDERS.find(p => p.id === prov);
  const fallbackModels = provDef?.models || [];
  const current = a.model?.default || '';

  // Use cached live models if available, otherwise fallback
  const models = liveModels[prov] || fallbackModels;
  const options = models.map(m => {
    const id = typeof m === 'string' ? m : m.id;
    const name = typeof m === 'string' ? m : (m.name || m.id);
    return '<option value="' + esc(id) + '"' + (id === current ? ' selected' : '') + '>' + esc(name) + '</option>';
  }).join('');
  const customMatch = models.some(m => (typeof m === 'string' ? m : m.id) === current) ? '' : current;
  const loading = loadingModels[prov] ? '<span style="color:var(--text3);font-size:11px;margin-left:8px">loading...</span>' : '';

  return '<div class="section"><div class="section-title">Model' + loading + '</div>' +
    '<div class="input-row">' +
      '<div><label>Default Model <span class="label-hint">(' + models.length + ' available)</span></label>' +
        '<select id="model-select-' + a.name + '" onchange="updateModel(\\'' + a.name + '\\', this.value)">' +
        (customMatch ? '<option value="' + esc(current) + '" selected>' + esc(current) + ' (current)</option>' : '') +
        options + '</select></div>' +
      '<div><label>Premium <span class="label-hint">(for deep reasoning)</span></label>' +
        '<input value="' + esc(a.model?.premium || '') + '" placeholder="none" onchange="getAgent(\\'' + a.name + '\\').model.premium = this.value || undefined"></div>' +
    '</div>' +
    '<button class="btn" style="margin-top:8px;font-size:11px" onclick="fetchModels(\\'' + a.name + '\\',\\'' + prov + '\\')">Refresh models from provider</button>' +
    '</div>';
}

function renderPersonaSection(a) {
  return '<div class="section"><div class="section-title">Persona</div>' +
    '<textarea onchange="getAgent(\\'' + a.name + '\\').persona = this.value">' + esc(a.persona || '') + '</textarea></div>';
}

function renderToolsSection(a) {
  const allow = new Set(a.permissions?.allow || []);
  const deny = new Set(a.permissions?.deny || []);
  const hasWildcard = allow.has('*');
  const prov = detectProvider(a);
  const isClaudeCode = prov === 'claude-code';

  const CLAUDE_CODE_TOOLS = {
    'File Tools': ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    'System': ['Bash', 'NotebookEdit'],
    'Web': ['WebSearch', 'WebFetch'],
    'Agent': ['call_agent'],
  };
  const GOVERNED_TOOLS = {
    'Filesystem': ['filesystem_read', 'filesystem_write', 'filesystem_edit', 'filesystem_glob', 'filesystem_grep'],
    'Shell': ['shell_exec'],
    'Web': ['web_fetch', 'web_search', 'pdf_parse', 'image_analyze'],
    'Memory': ['memory_search', 'memory_get'],
    'Browser': ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_fill', 'browser_screenshot'],
    'Agent': ['call_agent'],
  };

  const toolSet = isClaudeCode ? CLAUDE_CODE_TOOLS : GOVERNED_TOOLS;
  const badgeLabel = isClaudeCode ? 'advisory' : 'governed';
  const badgeClass = isClaudeCode ? 'warn' : 'ok';

  let html = '<div class="section"><div class="section-title">Tools ' +
    '<span class="badge ' + badgeClass + '">' + badgeLabel + '</span> ' +
    (hasWildcard ? '<span class="badge warn">wildcard *</span>' : '<span class="badge">' + allow.size + ' allowed</span>') +
    '</div>';

  if (isClaudeCode) {
    html += '<div style="margin-bottom:10px;padding:8px 10px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--text2);border-left:3px solid var(--orange)">' +
      'Claude Code manages its own tool execution. Permissions are passed as <code>--allowedTools</code> CLI flags — Claude Code enforces them, not openAIOS.</div>';
  } else {
    html += '<div style="margin-bottom:10px;padding:8px 10px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--text2);border-left:3px solid var(--green)">' +
      'Every tool call goes through openAIOS governance. <code>checkPolicy()</code> is called before each execution.</div>';
  }

  html += '<div style="margin-bottom:10px"><label style="margin:0"><input type="checkbox"' + (hasWildcard ? ' checked' : '') +
    ' onchange="toggleWildcard(\\'' + a.name + '\\', this.checked)"> Allow all tools (wildcard *)</label></div>';

  for (const [cat, tools] of Object.entries(toolSet)) {
    html += '<div class="tool-category">' + cat + '</div><div class="tool-grid">';
    for (const tool of tools) {
      const isDenied = deny.has(tool);
      const isAllowed = hasWildcard || allow.has(tool);
      let cls = '';
      if (isDenied) cls = ' denied';
      else if (isAllowed) cls = ' on';
      html += '<div class="tool-chip' + cls + '" onclick="toggleTool(\\'' + a.name + '\\',\\'' + tool + '\\')">' + tool + '</div>';
    }
    html += '</div>';
  }

  html += '<div style="margin-top:10px"><div class="input-row"><input id="custom-tool-' + a.name + '" placeholder="Custom tool name...">' +
    '<button class="btn" onclick="addCustomTool(\\'' + a.name + '\\')">Add</button></div></div>';

  html += '</div>';
  return html;
}

function renderChannelsSection(a) {
  const active = Object.entries(a.channels || {}).filter(([k,v]) => v && k !== 'group_routing' && k !== 'dm_allowlist');
  const inactive = CHANNELS.filter(ch => !a.channels?.[ch.id]);

  let html = '<div class="section"><div class="section-title">Channels <span class="badge">' + active.length + ' active</span></div>';
  html += '<div class="ch-grid">';

  for (const [type, cfg] of active) {
    const ch = CHANNELS.find(c => c.id === type);
    html += '<div class="ch-card active" onclick="editChannel(\\'' + a.name + '\\',\\'' + type + '\\')">' +
      '<span class="ch-remove" onclick="event.stopPropagation();removeChannel(\\'' + a.name + '\\',\\'' + type + '\\')">&times;</span>' +
      '<div class="ch-icon">' + (ch?.icon || '📡') + '</div>' +
      '<div class="ch-name">' + (ch?.name || type) + '</div>' +
      '<div class="ch-status">Connected</div></div>';
  }

  for (const ch of inactive) {
    html += '<div class="ch-card" onclick="addChannel(\\'' + a.name + '\\',\\'' + ch.id + '\\')">' +
      '<div class="ch-icon">' + ch.icon + '</div>' +
      '<div class="ch-name">' + ch.name + '</div>' +
      '<div class="ch-status">Click to add</div></div>';
  }

  html += '</div></div>';
  return html;
}

function renderRunnerSection(a) {
  const env = a.runner?.env || 'docker';
  const prov = detectProvider(a);
  const provDef = PROVIDERS.find(p => p.id === prov);

  let badge, warning;
  if (env === 'docker') {
    badge = '<span class="badge ok">sandboxed</span>';
    warning = '';
  } else if (env === 'native') {
    badge = '<span class="badge warn">unsandboxed</span>';
    warning = '<div class="audit-warn" style="margin-top:8px">Agent runs with full host access to filesystem and network. Use Docker for production.</div>';
  } else {
    // external — governed tools but no filesystem sandbox
    badge = provDef?.governed
      ? '<span class="badge ok">governed</span>'
      : '<span class="badge warn">advisory</span>';
    warning = '<div style="margin-top:8px;padding:8px 10px;background:var(--bg3);border-radius:6px;font-size:11px;color:var(--text2);border-left:3px solid var(--accent)">LLM runs externally. ' +
      (provDef?.governed ? 'All tool calls governed by openAIOS ToolExecutor.' : 'Tool governance is advisory only.') + '</div>';
  }

  let html = '<div class="section"><div class="section-title">Runner ' + badge + '</div>';
  html += '<div class="runner-cards">';
  for (const r of RUNNERS) {
    const active = r.id === env ? ' active' : '';
    html += '<div class="runner-card' + active + '" onclick="setRunner(\\'' + a.name + '\\',\\'' + r.id + '\\')">' +
      '<div>' + r.icon + '</div><div class="rc-title">' + r.name + '</div><div class="rc-desc">' + r.desc + '</div></div>';
  }
  html += '</div>';
  html += warning;

  html += '</div>';
  return html;
}

function renderSaveBar(a) {
  return '<div class="save-bar"><button class="btn" onclick="load()">Reset</button>' +
    '<button class="btn primary" onclick="saveAgent(\\'' + a.name + '\\')">Save Changes</button></div>';
}

// --- Actions ---

function getAgent(name) { return config.agents.find(a => a.name === name); }

function detectProvider(a) {
  // Check for SDK runners (stored as a marker in runner config)
  if (a.runner?._provider) return a.runner._provider;
  if (a.runner?.env === 'external') {
    try {
      const host = new URL(a.runner.external?.base_url || '').hostname;
      const parts = host.split('.');
      return parts.length >= 2 ? parts[parts.length - 2] : 'external';
    } catch { return 'external'; }
  }
  return a.runner?.llm || 'claude-code';
}

function setProvider(name, provId) {
  const a = getAgent(name);
  if (!a) return;
  const prov = PROVIDERS.find(p => p.id === provId);
  if (!prov) return;

  a.runner = a.runner || {};
  a.runner._provider = provId; // track selection for UI

  // Provider → runner config mapping
  const BASE_URLS = {
    'anthropic-api': 'https://api.anthropic.com',
    'openai-api': 'https://api.openai.com/v1',
    'ollama': 'http://localhost:11434/v1',
    'requesty': 'https://router.requesty.ai/v1',
    'openrouter': 'https://openrouter.ai/api/v1',
  };
  const API_KEYS = {
    'anthropic-api': '\${ANTHROPIC_API_KEY}',
    'openai-api': '\${OPENAI_API_KEY}',
    'requesty': '\${REQUESTY_API_KEY}',
    'openrouter': '\${OPENROUTER_API_KEY}',
  };

  if (provId === 'claude-code') {
    // Claude Code CLI — advisory governance only
    a.runner.env = 'native';
    a.runner.llm = 'claude-code';
    a.runner.native = { allow_host_access: true };
    delete a.runner.external;
  } else {
    // All other providers → external runner (OpenAI-compat)
    // Uses governed OpenAI SDK runner with ToolExecutor
    a.runner.env = 'external';
    a.runner.external = { base_url: BASE_URLS[provId] || '' };
    if (API_KEYS[provId]) a.runner.external.api_key = API_KEYS[provId];
    delete a.runner.native;
  }

  // Set first model as default if current doesn't match
  if (prov.models.length > 0 && !prov.models.includes(a.model?.default)) {
    a.model = a.model || {};
    a.model.default = prov.models[0];
  }

  renderMain(a);

  // Auto-fetch live models from provider if not cached
  if (!liveModels[provId]) {
    fetchModels(name, provId);
  }
}

function updateModel(name, model) {
  const a = getAgent(name);
  if (!a) return;
  a.model = a.model || {};
  a.model.default = model;
  renderSidebar();
}

function toggleWildcard(name, on) {
  const a = getAgent(name);
  if (!a) return;
  a.permissions = a.permissions || { allow: [], deny: [] };
  if (on) {
    if (!a.permissions.allow.includes('*')) a.permissions.allow = ['*'];
  } else {
    a.permissions.allow = a.permissions.allow.filter(t => t !== '*');
  }
  renderMain(a);
}

function toggleTool(name, tool) {
  const a = getAgent(name);
  if (!a) return;
  a.permissions = a.permissions || { allow: [], deny: [] };
  const deny = a.permissions.deny;
  const allow = a.permissions.allow;

  if (deny.includes(tool)) {
    // denied → remove from deny (becomes allowed if wildcard or in allow)
    a.permissions.deny = deny.filter(t => t !== tool);
  } else if (allow.includes(tool) || allow.includes('*')) {
    // allowed → add to deny
    a.permissions.deny.push(tool);
    a.permissions.allow = allow.filter(t => t !== tool);
  } else {
    // not allowed → add to allow
    a.permissions.allow.push(tool);
  }
  renderMain(a);
}

function addCustomTool(name) {
  const input = document.getElementById('custom-tool-' + name);
  if (!input?.value.trim()) return;
  const a = getAgent(name);
  if (!a) return;
  a.permissions = a.permissions || { allow: [], deny: [] };
  if (!a.permissions.allow.includes(input.value.trim())) {
    a.permissions.allow.push(input.value.trim());
  }
  input.value = '';
  renderMain(a);
}

function setRunner(name, env) {
  const a = getAgent(name);
  if (!a) return;
  a.runner = a.runner || {};
  a.runner.env = env;
  if (env === 'native') {
    a.runner.native = { allow_host_access: true };
  }
  renderMain(a);
}

function addChannel(name, chId) {
  const ch = CHANNELS.find(c => c.id === chId);
  if (!ch) return;
  showChannelModal(name, chId, ch, {});
}

function editChannel(name, chId) {
  const a = getAgent(name);
  const ch = CHANNELS.find(c => c.id === chId);
  if (!a || !ch) return;
  showChannelModal(name, chId, ch, a.channels?.[chId] || {});
}

function showChannelModal(agentName, chId, ch, current) {
  const modal = document.getElementById('modal');
  let html = '<h3>' + ch.icon + ' ' + ch.name + '</h3>';
  html += ch.fields.map(f =>
    '<label>' + f.l + (f.req ? ' *' : '') + '</label>' +
    '<input id="ch-' + f.k + '" type="' + (f.t || 'text') + '" value="' + esc(String(current[f.k] || '')) + '" placeholder="' + (f.ph || '') + '">'
  ).join('');
  html += '<div class="btn-row"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn primary" onclick="saveChannel(\\'' + agentName + '\\',\\'' + chId + '\\')">Save</button></div>';
  modal.innerHTML = html;
  document.getElementById('modal-bg').classList.add('open');
}

function saveChannel(agentName, chId) {
  const ch = CHANNELS.find(c => c.id === chId);
  if (!ch) return;
  const a = getAgent(agentName);
  if (!a) return;
  const values = {};
  for (const f of ch.fields) {
    const el = document.getElementById('ch-' + f.k);
    const val = el?.value.trim() || '';
    if (f.req && !val) { toast(f.l + ' is required', 'error'); return; }
    if (val) values[f.k] = f.t === 'number' ? Number(val) : val;
  }
  a.channels = a.channels || {};
  a.channels[chId] = values;
  closeModal();
  renderMain(a);
  toast('Channel added — save to apply', 'info');
}

function removeChannel(agentName, chId) {
  const a = getAgent(agentName);
  if (!a?.channels) return;
  delete a.channels[chId];
  renderMain(a);
  toast('Channel removed — save to apply', 'info');
}

async function saveAgent(name) {
  const a = getAgent(name);
  if (!a) return;
  try {
    const res = await fetch('/api/config/agents/' + name, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona: a.persona,
        model: a.model,
        permissions: a.permissions,
        channels: a.channels,
      }),
    });
    if (res.ok) {
      toast('Saved! Restart required for channel/runner changes.', 'success');
    } else {
      toast('Save failed: ' + res.status, 'error');
    }
  } catch (err) {
    toast('Save failed: ' + err.message, 'error');
  }
}

function closeModal() { document.getElementById('modal-bg').classList.remove('open'); }

function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type || 'success');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.getElementById('modal-bg').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

load();
</script>
</body>
</html>`
