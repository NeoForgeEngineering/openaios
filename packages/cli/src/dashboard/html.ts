export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>openAIOS Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d0d; color: #e0e0e0; font-family: 'Courier New', monospace; font-size: 13px; }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #161616; border-bottom: 1px solid #2a2a2a; }
  header h1 { font-size: 15px; font-weight: bold; color: #fff; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf50; }
  .uptime { margin-left: auto; color: #888; font-size: 12px; }
  .version { color: #555; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-bottom: 1px solid #2a2a2a; }
  .panel { padding: 12px 16px; border-right: 1px solid #2a2a2a; }
  .panel:last-child { border-right: none; }
  .panel-title { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .agent-card { background: #161616; border: 1px solid #2a2a2a; border-radius: 3px; padding: 10px 12px; margin-bottom: 8px; }
  .agent-name { font-weight: bold; color: #fff; }
  .agent-model { color: #888; font-size: 12px; margin-top: 2px; }
  .agent-sessions { color: #aaa; font-size: 12px; margin-top: 2px; }
  .budget-bar-wrap { margin-top: 6px; }
  .budget-bar-bg { background: #2a2a2a; border-radius: 2px; height: 4px; width: 100%; }
  .budget-bar { height: 4px; border-radius: 2px; transition: width 0.3s; }
  .budget-bar.ok    { background: #4caf50; }
  .budget-bar.warn  { background: #ff9800; }
  .budget-bar.over  { background: #f44336; }
  .budget-text { color: #666; font-size: 11px; margin-top: 3px; }
  #log-panel { height: 220px; overflow-y: auto; font-size: 12px; line-height: 1.5; }
  .log-line { white-space: pre-wrap; word-break: break-all; padding: 1px 0; }
  .log-debug { color: #555; }
  .log-info  { color: #ccc; }
  .log-warn  { color: #ff9800; }
  .log-error { color: #f44336; }
  .sessions-section { padding: 12px 16px; border-bottom: 1px solid #2a2a2a; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding: 4px 8px 6px 0; border-bottom: 1px solid #2a2a2a; }
  td { padding: 5px 8px 5px 0; color: #aaa; font-size: 12px; border-bottom: 1px solid #1a1a1a; }
  td:first-child { color: #e0e0e0; }
  .security-section { padding: 12px 16px; }
  .security-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .finding { padding: 6px 10px; background: #161616; border-left: 3px solid #ff9800; margin-bottom: 4px; border-radius: 0 2px 2px 0; }
  .finding.error { border-left-color: #f44336; }
  .finding.info  { border-left-color: #555; }
  .finding-title { color: #e0e0e0; font-size: 12px; }
  .finding-msg   { color: #888; font-size: 11px; margin-top: 2px; }
  .no-findings { color: #4caf50; font-size: 12px; }
</style>
</head>
<body>
<header>
  <div class="status-dot" id="status-dot"></div>
  <h1>openAIOS</h1>
  <span id="status-text" style="color:#4caf50">● Running</span>
  <span class="uptime" id="uptime-text">uptime: —</span>
  <span class="version">v0.1</span>
</header>

<div class="grid">
  <div class="panel">
    <div class="panel-title">Agents</div>
    <div id="agents-list"><div style="color:#555">Loading...</div></div>
  </div>
  <div class="panel">
    <div class="panel-title">Live Logs</div>
    <div id="log-panel"></div>
  </div>
</div>

<div class="sessions-section">
  <div class="panel-title" style="margin-bottom:8px">Sessions</div>
  <table>
    <thead><tr>
      <th>agent</th><th>userId</th><th>model</th><th>cost</th><th>updated</th>
    </tr></thead>
    <tbody id="sessions-body"><tr><td colspan="5" style="color:#555">Loading...</td></tr></tbody>
  </table>
</div>

<div class="security-section">
  <div class="security-header">
    <div class="panel-title" style="margin-bottom:0">Security</div>
    <span id="audit-summary" style="color:#555;font-size:12px">—</span>
  </div>
  <div id="audit-findings"></div>
</div>

<script>
const MAX_LOG_LINES = 200

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return s + 's ago'
  if (s < 3600) return Math.floor(s/60) + 'm ago'
  return Math.floor(s/3600) + 'h ago'
}

function formatUptime(s) {
  if (s < 60) return s + 's'
  if (s < 3600) return Math.floor(s/60) + 'm ' + (s%60) + 's'
  const h = Math.floor(s/3600)
  const m = Math.floor((s%3600)/60)
  return h + 'h ' + m + 'm'
}

function appendLogLine(entry) {
  const panel = document.getElementById('log-panel')
  const line = document.createElement('div')
  line.className = 'log-line log-' + entry.level
  const ts = entry.ts.replace('T',' ').slice(0,19)
  line.textContent = ts + ' ' + entry.level.toUpperCase().padEnd(5) + ' ' + entry.tag + ' ' + entry.msg
  panel.appendChild(line)
  // Keep at most MAX_LOG_LINES
  while (panel.children.length > MAX_LOG_LINES) {
    panel.removeChild(panel.firstChild)
  }
  panel.scrollTop = panel.scrollHeight
}

function renderAgents(agents) {
  const el = document.getElementById('agents-list')
  if (!agents || agents.length === 0) {
    el.innerHTML = '<div style="color:#555">No agents</div>'
    return
  }
  el.innerHTML = agents.map(a => {
    const pct = ((a.budget?.fraction ?? 0) * 100).toFixed(1)
    const barClass = (a.budget?.fraction ?? 0) >= 1 ? 'over' : (a.budget?.isWarning ? 'warn' : 'ok')
    const barWidth = Math.min((a.budget?.fraction ?? 0) * 100, 100).toFixed(1)
    const budgetHtml = a.budget ? \`
      <div class="budget-bar-wrap">
        <div class="budget-bar-bg"><div class="budget-bar \${barClass}" style="width:\${barWidth}%"></div></div>
        <div class="budget-text">$\${(a.budget.spentUsd||0).toFixed(4)} / $\${(a.budget.limitUsd||0).toFixed(2)} (\${pct}%)</div>
      </div>\` : ''
    return \`<div class="agent-card">
      <div class="agent-name">\${a.name}</div>
      <div class="agent-model">\${a.model}</div>
      <div class="agent-sessions">sessions: \${a.sessionCount}</div>
      \${budgetHtml}
    </div>\`
  }).join('')
}

function renderSessions(sessions) {
  const tbody = document.getElementById('sessions-body')
  if (!sessions || sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#555">No sessions yet</td></tr>'
    return
  }
  tbody.innerHTML = sessions.map(s => \`<tr>
    <td>\${s.agentName}</td>
    <td>\${s.userId}</td>
    <td>\${s.currentModel}</td>
    <td>$\${(s.totalCostUsd||0).toFixed(4)}</td>
    <td>\${timeAgo(s.updatedAt)}</td>
  </tr>\`).join('')
}

function renderAudit(result) {
  const summary = document.getElementById('audit-summary')
  const findings = document.getElementById('audit-findings')
  if (!result) {
    summary.textContent = 'No audit data'
    findings.innerHTML = ''
    return
  }
  const lastScan = result.ts ? timeAgo(new Date(result.ts).getTime()) : '—'
  summary.textContent = \`Last scan: \${lastScan}  ✓ \${result.passed} passed  ⚠ \${result.warned}  ✗ \${result.errors}\`
  if (!result.findings || result.findings.length === 0) {
    findings.innerHTML = '<div class="no-findings">✓ All checks passed</div>'
    return
  }
  findings.innerHTML = result.findings.map(f => \`
    <div class="finding \${f.severity.toLowerCase()}">
      <div class="finding-title">\${f.severity}  \${f.agentName}  \${f.code}</div>
      <div class="finding-msg">\${f.message}</div>
    </div>
  \`).join('')
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status')
    const data = await res.json()
    document.getElementById('uptime-text').textContent = 'uptime: ' + formatUptime(data.uptime || 0)
    renderAgents(data.agents || [])
  } catch {}
}

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions')
    const data = await res.json()
    renderSessions(data.sessions || [])
  } catch {}
}

async function loadLogs() {
  try {
    const res = await fetch('/api/logs')
    const data = await res.json()
    const panel = document.getElementById('log-panel')
    panel.innerHTML = ''
    for (const entry of (data.entries || [])) {
      appendLogLine(entry)
    }
  } catch {}
}

async function loadAudit() {
  try {
    const res = await fetch('/api/audit')
    if (res.ok) {
      const data = await res.json()
      renderAudit(data)
    }
  } catch {}
}

// Initial load
loadStatus()
loadSessions()
loadLogs()
loadAudit()

// Auto-refresh every 10s
setInterval(() => {
  loadStatus()
  loadSessions()
  loadAudit()
}, 10000)

// SSE live log stream
const evtSource = new EventSource('/api/events')
evtSource.onmessage = (e) => {
  try {
    const entry = JSON.parse(e.data)
    appendLogLine(entry)
  } catch {}
}
evtSource.onerror = () => {
  // Reconnection is automatic
}
</script>
</body>
</html>`
