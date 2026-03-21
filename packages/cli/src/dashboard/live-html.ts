interface AgentInfo {
  name: string
  channels: string[]
  model: string
  runner: string
  llm: string
}

export function LIVE_HTML(agents: AgentInfo[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>openAIOS Live</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0a; --bg2: #111; --bg3: #1a1a1a;
    --border: #222; --text: #ccc; --text2: #666;
    --green: #4caf50; --blue: #4f8fff; --orange: #ff9800;
    --red: #f44336; --purple: #9c27b0; --cyan: #00bcd4;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'SF Mono', Consolas, monospace;
  }
  html, body { height: 100%; overflow: hidden; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 13px; display: flex; flex-direction: column; }

  header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
  header a { color: var(--text2); text-decoration: none; font-size: 12px; }
  header h1 { font-size: 15px; font-weight: 600; color: #fff; }
  .spacer { flex: 1; }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red); animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .nav a { color: var(--text2); text-decoration: none; padding: 4px 10px; font-size: 12px; }
  .nav a:hover { color: var(--text); }

  .layout { display: flex; flex: 1; overflow: hidden; }

  /* Topology panel */
  .topology { flex: 1; padding: 20px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
  canvas#flow { width: 100%; height: 100%; }

  /* Event feed */
  .feed { width: 360px; border-left: 1px solid var(--border); display: flex; flex-direction: column; }
  .feed-header { padding: 10px 14px; background: var(--bg2); border-bottom: 1px solid var(--border); font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 1px; }
  .feed-list { flex: 1; overflow-y: auto; padding: 8px; }
  .feed-item { padding: 8px 10px; margin-bottom: 4px; border-radius: 6px; background: var(--bg3); border-left: 3px solid var(--border); font-size: 12px; line-height: 1.5; }
  .feed-item.start { border-left-color: var(--blue); }
  .feed-item.complete { border-left-color: var(--green); }
  .feed-item.error { border-left-color: var(--red); }
  .feed-item.budget { border-left-color: var(--orange); }
  .feed-time { color: var(--text2); font-size: 10px; font-family: var(--mono); }
  .feed-type { font-weight: 600; margin: 0 4px; }
  .feed-type.start { color: var(--blue); }
  .feed-type.complete { color: var(--green); }
  .feed-type.error { color: var(--red); }
  .feed-type.budget { color: var(--orange); }
  .feed-detail { color: var(--text2); margin-top: 2px; }

  /* Stats bar */
  .stats { display: flex; gap: 0; border-top: 1px solid var(--border); flex-shrink: 0; background: var(--bg2); }
  .stat { flex: 1; padding: 8px 16px; border-right: 1px solid var(--border); text-align: center; }
  .stat:last-child { border-right: none; }
  .stat-val { font-size: 20px; font-weight: 700; color: #fff; }
  .stat-label { font-size: 10px; color: var(--text2); text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
</style>
</head>
<body>
<header>
  <a href="/">&larr;</a>
  <div class="live-dot"></div>
  <h1>Live Flow</h1>
  <div class="spacer"></div>
  <div class="nav">
    <a href="/">Status</a>
    <a href="/config">Config</a>
    <a href="/chat">Chat</a>
  </div>
</header>

<div class="layout">
  <div class="topology">
    <canvas id="flow"></canvas>
  </div>
  <div class="feed">
    <div class="feed-header">Event Feed</div>
    <div class="feed-list" id="feed"></div>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-val" id="s-turns">0</div><div class="stat-label">Turns (total)</div></div>
  <div class="stat"><div class="stat-val" id="s-active">0</div><div class="stat-label">Active</div></div>
  <div class="stat"><div class="stat-val" id="s-tokens">0</div><div class="stat-label">Tokens</div></div>
  <div class="stat"><div class="stat-val" id="s-cost">$0.00</div><div class="stat-label">Cost (total)</div></div>
  <div class="stat"><div class="stat-val" id="s-avg">—</div><div class="stat-label">Avg Duration</div></div>
  <div class="stat"><div class="stat-val" id="s-errors">0</div><div class="stat-label">Errors</div></div>
</div>

<script>
const AGENTS = ${JSON.stringify(agents)};
const CHANNEL_COLORS = {
  telegram: '#0088cc', slack: '#4a154b', whatsapp: '#25d366',
  signal: '#3a76f0', webhook: '#666', discord: '#5865f2',
  google_chat: '#1a73e8', imessage: '#34c759', mock: '#666'
};

// Stats
let stats = { turns: 0, active: 0, cost: 0, tokens: 0, errors: 0, durations: [] };

// Load historical metrics on page load
async function loadHistoricalMetrics() {
  try {
    const res = await fetch('/api/metrics');
    const data = await res.json();
    for (const m of (data.metrics || [])) {
      stats.turns += m.turns || 0;
      stats.cost += m.totalCostUsd || 0;
      stats.tokens += (m.totalInputTokens || 0) + (m.totalOutputTokens || 0);
      stats.errors += m.errors || 0;
    }
    updateStats();
  } catch {}
}
loadHistoricalMetrics();

// Topology nodes
const nodes = [];
const edges = [];
const particles = []; // animated message particles

function buildTopology() {
  nodes.length = 0;
  edges.length = 0;

  // Collect unique channels
  const channels = new Set();
  AGENTS.forEach(a => a.channels.forEach(c => channels.add(c)));
  const chArr = [...channels];

  const W = canvas.width / devicePixelRatio;
  const H = canvas.height / devicePixelRatio;

  // Layout — enough vertical space for node + label + subtitle + stats
  const colX = [W * 0.12, W * 0.36, W * 0.60, W * 0.84];
  const maxItems = Math.max(chArr.length, AGENTS.length, 1);
  const nodeSlot = 100; // min vertical space per node (circle + labels)
  const spacing = Math.max(nodeSlot, (H - 100) / Math.max(maxItems, 2));
  const centerY = H / 2;

  function columnYPositions(count) {
    const positions = [];
    const totalHeight = (count - 1) * spacing;
    const startY = centerY - totalHeight / 2;
    for (let i = 0; i < count; i++) {
      positions.push(startY + i * spacing);
    }
    return positions;
  }

  // Column 0: Channels
  const chYs = columnYPositions(chArr.length);
  chArr.forEach((ch, i) => {
    nodes.push({ id: 'ch:' + ch, label: ch, x: colX[0], y: chYs[i], col: 0, color: CHANNEL_COLORS[ch] || '#666', radius: 18 });
  });

  // Column 1: Router (always centered)
  nodes.push({ id: 'router', label: 'Router', x: colX[1], y: centerY, col: 1, color: '#4caf50', radius: 26 });

  // Column 2: Agents — show model as subtitle
  const agentYs = columnYPositions(AGENTS.length);
  AGENTS.forEach((a, i) => {
    const shortModel = a.model.replace(/^claude-/, '').replace(/-d{8}$/, '');
    nodes.push({ id: 'agent:' + a.name, label: a.name, x: colX[2], y: agentYs[i], col: 2, color: '#ff9800', radius: 20, subtitle: shortModel, stats: { turns: 0, tokens: 0, cost: 0 } });
  });

  // Column 3: Providers — one node per unique LLM provider
  const PROVIDER_LABELS = {
    'claude-code': 'Anthropic', 'openai-compat': 'OpenAI-compat',
    'ollama': 'Ollama', 'gemini': 'Gemini',
    'requesty': 'Requesty', 'openrouter': 'OpenRouter',
    'groq': 'Groq', 'openai': 'OpenAI', 'external': 'External',
  };
  const PROVIDER_COLORS = {
    'claude-code': '#d4a574', 'openai-compat': '#74aa9c',
    'ollama': '#888', 'gemini': '#4285f4',
    'requesty': '#6c5ce7', 'openrouter': '#ff6b6b',
    'groq': '#f39c12', 'openai': '#74aa9c', 'external': '#95a5a6',
  };
  const providers = [...new Set(AGENTS.map(a => a.llm))];
  const providerYs = columnYPositions(providers.length);
  providers.forEach((p, i) => {
    const label = PROVIDER_LABELS[p] || p;
    const color = PROVIDER_COLORS[p] || '#9c27b0';
    nodes.push({ id: 'prov:' + p, label, x: colX[3], y: providerYs[i], col: 3, color, radius: 24, subtitle: p, stats: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 } });
  });

  // Edges: channels → router
  chArr.forEach(ch => {
    edges.push({ from: 'ch:' + ch, to: 'router' });
  });

  // Edges: router → agents
  AGENTS.forEach(a => {
    edges.push({ from: 'router', to: 'agent:' + a.name });
  });

  // Edges: agents → their provider
  AGENTS.forEach(a => {
    edges.push({ from: 'agent:' + a.name, to: 'prov:' + a.llm });
  });
}

// Canvas
const canvas = document.getElementById('flow');
const ctx = canvas.getContext('2d');

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(devicePixelRatio, devicePixelRatio);
  buildTopology();
}

function getNode(id) { return nodes.find(n => n.id === id); }

function draw() {
  const W = canvas.width / devicePixelRatio;
  const H = canvas.height / devicePixelRatio;
  ctx.clearRect(0, 0, W, H);

  // Column labels
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#444';
  ctx.textAlign = 'center';
  const colLabels = ['Channels', 'Router', 'Agents', 'Providers'];
  [W*0.12, W*0.38, W*0.62, W*0.88].forEach((x, i) => {
    ctx.fillText(colLabels[i], x, 28);
  });

  // Draw edges as curves
  for (const e of edges) {
    const from = getNode(e.from);
    const to = getNode(e.to);
    if (!from || !to) continue;
    const midX = (from.x + to.x) / 2;
    ctx.beginPath();
    ctx.moveTo(from.x + from.radius, from.y);
    ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x - to.radius, to.y);
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Draw particles along bezier curves
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += 0.025;
    if (p.t >= 1) { particles.splice(i, 1); continue; }
    const from = getNode(p.from);
    const to = getNode(p.to);
    if (!from || !to) { particles.splice(i, 1); continue; }
    const t = p.t;
    const midX = (from.x + to.x) / 2;
    // Cubic bezier interpolation
    const x = (1-t)*(1-t)*(1-t)*(from.x+from.radius) + 3*(1-t)*(1-t)*t*midX + 3*(1-t)*t*t*midX + t*t*t*(to.x-to.radius);
    const y = (1-t)*(1-t)*(1-t)*from.y + 3*(1-t)*(1-t)*t*from.y + 3*(1-t)*t*t*to.y + t*t*t*to.y;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Draw nodes
  for (const n of nodes) {
    const isActive = n._active && Date.now() - n._active < 2000;

    // Node circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? n.color + '33' : '#131313';
    ctx.strokeStyle = isActive ? n.color : n.color + '88';
    ctx.lineWidth = isActive ? 2.5 : 1.5;
    if (isActive) { ctx.shadowColor = n.color; ctx.shadowBlur = 16; }
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label inside node (first letter, uppercase)
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = n.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.label.charAt(0).toUpperCase(), n.x, n.y);

    // Label below node
    ctx.font = '11px sans-serif';
    ctx.fillStyle = isActive ? '#fff' : '#aaa';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(n.label, n.x, n.y + n.radius + 14);

    // Subtitle (runner type, LLM label)
    if (n.subtitle) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#444';
      ctx.fillText(n.subtitle, n.x, n.y + n.radius + 25);
    }

    // Stats below (for LLM and agent nodes)
    if (n.stats) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#383838';
      if (n.col === 3) {
        // LLM stats
        const s = n.stats;
        if (s.calls > 0) {
          ctx.fillStyle = '#555';
          ctx.fillText(s.calls + ' calls', n.x, n.y + n.radius + 36);
          ctx.fillText((s.inputTokens + s.outputTokens).toLocaleString() + ' tok', n.x, n.y + n.radius + 47);
          if (s.cost > 0) {
            ctx.fillStyle = '#ff9800';
            ctx.fillText('$' + s.cost.toFixed(4), n.x, n.y + n.radius + 58);
          }
        }
      } else if (n.col === 2) {
        // Agent stats
        const s = n.stats;
        if (s.turns > 0) {
          ctx.fillStyle = '#555';
          ctx.fillText(s.turns + ' turns', n.x, n.y + n.radius + 36);
        }
      }
    }
  }

  requestAnimationFrame(draw);
}

// Event handling
function handleEvent(evt) {
  const type = evt.type?.replace('turn:', '').replace('budget:', '') || 'unknown';
  addFeedItem(evt);

  if (evt.type === 'turn:start') {
    stats.turns++;
    stats.active++;
    // Find the agent's model to route to correct LLM node
    const agentCfg = AGENTS.find(a => a.name === evt.agentName);
    const provId = agentCfg?.llm || '';

    const chNode = nodes.find(n => n.id === 'ch:' + evt.channel);
    const routerNode = getNode('router');
    const agentNode = getNode('agent:' + evt.agentName);
    const provNode = nodes.find(n => n.id === 'prov:' + provId) || nodes.find(n => n.col === 3);

    // Update agent stats
    if (agentNode?.stats) agentNode.stats.turns++;

    // Animate: channel → router → agent → provider
    if (chNode) { chNode._active = Date.now(); particles.push({ from: chNode.id, to: 'router', t: 0, color: chNode.color }); }
    if (routerNode) routerNode._active = Date.now();
    if (agentNode) {
      agentNode._active = Date.now();
      setTimeout(() => particles.push({ from: 'router', to: agentNode.id, t: 0, color: '#4caf50' }), 300);
      if (provNode) setTimeout(() => particles.push({ from: agentNode.id, to: provNode.id, t: 0, color: '#ff9800' }), 600);
    }
    if (provNode) setTimeout(() => { provNode._active = Date.now(); }, 800);
  }

  if (evt.type === 'turn:complete') {
    stats.active = Math.max(0, stats.active - 1);
    if (evt.costUsd) stats.cost += evt.costUsd;
    if (evt.durationMs) stats.durations.push(evt.durationMs);

    // Find provider node from agent config
    const completeCfg = AGENTS.find(a => a.name === evt.agentName);
    const completeProvId = completeCfg?.llm || '';
    const provNode = nodes.find(n => n.id === 'prov:' + completeProvId) || nodes.find(n => n.col === 3);
    const agentNode = getNode('agent:' + evt.agentName);

    // Update LLM stats
    if (provNode?.stats) {
      provNode.stats.calls++;
      if (evt.costUsd) provNode.stats.cost += evt.costUsd;
    }

    // Animate: provider → agent → router → channel
    if (provNode) { provNode._active = Date.now(); }
    if (agentNode && provNode) {
      particles.push({ from: provNode.id, to: agentNode.id, t: 0, color: provNode.color });
      setTimeout(() => particles.push({ from: agentNode.id, to: 'router', t: 0, color: '#ff9800' }), 300);
    }
    const chNode = nodes.find(n => n.id === 'ch:' + evt.channel);
    if (chNode) setTimeout(() => particles.push({ from: 'router', to: chNode.id, t: 0, color: '#4caf50' }), 600);
  }

  if (evt.type === 'turn:error') {
    stats.active = Math.max(0, stats.active - 1);
    stats.errors++;
  }

  updateStats();
}

function addFeedItem(evt) {
  const feed = document.getElementById('feed');
  const type = evt.type?.split(':')[1] || 'event';
  const time = new Date(evt.timestampMs).toLocaleTimeString();
  const el = document.createElement('div');
  el.className = 'feed-item ' + type;

  let detail = '';
  if (evt.type === 'turn:start') detail = evt.channel + ' → ' + evt.agentName + ' (' + evt.userId.split(':').pop() + ')';
  else if (evt.type === 'turn:complete') detail = evt.agentName + ' → ' + evt.channel + ' [' + evt.model + '] ' + (evt.durationMs ? evt.durationMs + 'ms' : '') + (evt.costUsd ? ' $' + evt.costUsd.toFixed(4) : '');
  else if (evt.type === 'turn:error') detail = evt.agentName + ': ' + evt.error;
  else if (evt.type === 'budget:check') detail = evt.agentName + (evt.allowed ? ' ✓' : ' ✗ blocked') + (evt.effectiveModel ? ' → ' + evt.effectiveModel : '');
  else detail = JSON.stringify(evt).slice(0, 100);

  el.innerHTML = '<span class="feed-time">' + time + '</span><span class="feed-type ' + type + '">' + type + '</span><div class="feed-detail">' + detail + '</div>';
  feed.prepend(el);
  while (feed.children.length > 100) feed.removeChild(feed.lastChild);
}

function updateStats() {
  document.getElementById('s-turns').textContent = stats.turns.toLocaleString();
  document.getElementById('s-active').textContent = stats.active;
  document.getElementById('s-tokens').textContent = stats.tokens > 1000000 ? (stats.tokens / 1000000).toFixed(1) + 'M' : stats.tokens > 1000 ? (stats.tokens / 1000).toFixed(1) + 'K' : stats.tokens;
  document.getElementById('s-cost').textContent = '$' + stats.cost.toFixed(4);
  document.getElementById('s-errors').textContent = stats.errors;
  if (stats.durations.length > 0) {
    const avg = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
    document.getElementById('s-avg').textContent = (avg / 1000).toFixed(1) + 's';
  }
}

// SSE connection
const evtSource = new EventSource('/api/flow');
evtSource.onmessage = (e) => {
  try {
    const evt = JSON.parse(e.data);
    handleEvent(evt);
  } catch (err) {
    console.error('Flow event parse error:', err, e.data);
  }
};
evtSource.onerror = (e) => {
  console.warn('Flow SSE error — reconnecting...', e);
};

// Init
window.addEventListener('resize', () => { resize(); });
resize();
draw();
</script>
</body>
</html>`
}
