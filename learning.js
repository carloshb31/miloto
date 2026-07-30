// ============================================================
// MiLoto Learning Engine v1
// Sistema de evaluación y aprendizaje continuo por estrategia
// Almacenamiento: localStorage (persiste entre sesiones)
// ============================================================

const LEARNING_KEY = 'miloto_learning_v1';
const MODES = ['hot', 'balanced', 'cold', 'recent', 'adaptive'];

// ============================================================
// STORAGE
// ============================================================
function loadLearning() {
  try {
    const raw = localStorage.getItem(LEARNING_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    records: [],      // [{fecha, mode, combo, result, hits, distance, winner}]
    strategy: {},     // {mode: {wins,totalHits,totalDistance,played,bestStreak,currentStreak}}
    lastEvaluated: null
  };
}

function saveLearning(data) {
  try { localStorage.setItem(LEARNING_KEY, JSON.stringify(data)); } catch(e) {}
}

// ============================================================
// RECORD — guarda la primera combinación generada por cada estrategia
// Se llama al generar combinaciones
// ============================================================
function recordGeneration(fecha, mode, combo) {
  const L = loadLearning();
  // Solo registrar una vez por fecha+modo
  const exists = L.records.find(r => r.fecha === fecha && r.mode === mode);
  if (exists) return;
  L.records.push({ fecha, mode, combo: [...combo], result: null, hits: null, distance: null, winner: false });
  saveLearning(L);
}

// ============================================================
// EVALUATE — compara combinaciones guardadas con resultado real
// Se llama automáticamente al cargar nuevos datos
// ============================================================
function evaluateAll(DB) {
  const L = loadLearning();
  let changed = false;

  L.records.forEach(rec => {
    if (rec.result !== null) return; // ya evaluado

    // Buscar resultado real para esa fecha
    const sorteo = DB.find(s => s.fecha === rec.fecha);
    if (!sorteo) return;

    const result = sorteo.nums;
    const hits = rec.combo.filter(n => result.includes(n)).length;

    // Distancia estadística = suma de diferencias mínimas entre cada número de la combo y el resultado
    const distance = rec.combo.reduce((acc, n) => {
      const minDist = Math.min(...result.map(r => Math.abs(r - n)));
      return acc + minDist;
    }, 0);

    rec.result   = result;
    rec.hits     = hits;
    rec.distance = distance;
    changed = true;
  });

  if (!changed) return L;

  // Determinar ganador por fecha (estrategia con más hits, desempate por menor distancia)
  const byFecha = {};
  L.records.filter(r => r.result !== null).forEach(r => {
    if (!byFecha[r.fecha]) byFecha[r.fecha] = [];
    byFecha[r.fecha].push(r);
  });

  Object.values(byFecha).forEach(group => {
    const maxHits = Math.max(...group.map(r => r.hits));
    const candidates = group.filter(r => r.hits === maxHits);
    const minDist = Math.min(...candidates.map(r => r.distance));
    group.forEach(r => { r.winner = false; });
    const winner = candidates.find(r => r.distance === minDist);
    if (winner) winner.winner = true;
  });

  // Recalcular estadísticas por estrategia
  L.strategy = {};
  MODES.forEach(m => {
    L.strategy[m] = { wins:0, totalHits:0, totalDistance:0, played:0, bestStreak:0, currentStreak:0, hits5:0, hits4:0, hits3:0, hits2:0, hits1:0, hits0:0 };
  });

  // Sort records by fecha for streak calculation
  const evaluated = L.records.filter(r => r.result !== null).sort((a,b) => a.fecha.localeCompare(b.fecha));

  evaluated.forEach(r => {
    const s = L.strategy[r.mode];
    if (!s) return;
    s.played++;
    s.totalHits += r.hits;
    s.totalDistance += r.distance;
    s[`hits${r.hits}`] = (s[`hits${r.hits}`] || 0) + 1;
    if (r.winner) {
      s.wins++;
      s.currentStreak++;
      s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
    } else {
      s.currentStreak = 0;
    }
  });

  // Compute performance score for each strategy (used to adjust weights)
  MODES.forEach(m => {
    const s = L.strategy[m];
    if (!s || s.played === 0) return;
    s.avgHits     = Math.round(s.totalHits / s.played * 100) / 100;
    s.avgDistance = Math.round(s.totalDistance / s.played * 100) / 100;
    s.winRate     = Math.round(s.wins / s.played * 1000) / 10;
    // Performance score 0-100
    s.perfScore   = Math.min(100, Math.round(
      (s.avgHits / 5) * 50 +
      (s.wins / s.played) * 30 +
      Math.max(0, 1 - s.avgDistance / 100) * 20
    ));
  });

  saveLearning(L);
  return L;
}

// ============================================================
// ADAPTIVE WEIGHT BOOST — ajusta pesos según desempeño histórico
// Estrategias con mejor desempeño tienen más influencia
// ============================================================
function getStrategyBoost(mode) {
  const L = loadLearning();
  const s = L.strategy[mode];
  if (!s || s.played < 5) return 1.0; // sin datos suficientes
  // Boost entre 0.7 y 1.4 según performance score
  return 0.7 + (s.perfScore / 100) * 0.7;
}

function getBestStrategy() {
  const L = loadLearning();
  let best = null, bestScore = -1;
  MODES.forEach(m => {
    const s = L.strategy[m];
    if (s && s.played >= 5 && s.perfScore > bestScore) {
      bestScore = s.perfScore;
      best = m;
    }
  });
  return best;
}

// ============================================================
// RENDER — Panel de ranking de estrategias
// ============================================================
function renderLearningPanel() {
  const L = loadLearning();
  const container = document.getElementById('learning-panel');
  if (!container) return;

  const modeNames  = { hot:'🔥 Calientes', balanced:'⚖ Equilibrado', cold:'🧊 Fríos', recent:'📈 Reciente', adaptive:'🤖 Adaptativo' };
  const modeColors = { hot:'var(--accent2)', balanced:'var(--accent)', cold:'var(--accent4)', recent:'var(--accent3)', adaptive:'#c847ff' };

  const totalEvaluated = L.records.filter(r => r.result !== null).length;

  if (totalEvaluated === 0) {
    container.innerHTML = `
      <div class="panel-title">// Ranking de estrategias · Aprendizaje continuo</div>
      <div style="text-align:center;padding:24px;color:var(--muted);font-family:'Orbitron',monospace;font-size:10px;letter-spacing:0.2em;">
        Aún no hay evaluaciones.<br>Genera combinaciones cada día de sorteo<br>para que el sistema aprenda.
      </div>`;
    return;
  }

  // Sort strategies by perfScore
  const sorted = MODES
    .map(m => ({ mode: m, stats: L.strategy[m] || {} }))
    .filter(x => x.stats.played > 0)
    .sort((a, b) => (b.stats.perfScore || 0) - (a.stats.perfScore || 0));

  const bestMode = sorted[0]?.mode;

  let html = `<div class="panel-title">// Ranking de estrategias · ${totalEvaluated} evaluaciones acumuladas</div>`;

  // Strategy cards
  html += `<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">`;

  sorted.forEach((item, rank) => {
    const { mode, stats } = item;
    const col   = modeColors[mode];
    const name  = modeNames[mode];
    const score = stats.perfScore || 0;
    const isBest = mode === bestMode;

    html += `
    <div style="background:var(--bg);border:1px solid ${isBest ? col : 'var(--border)'};border-radius:8px;padding:14px;position:relative;${isBest ? `box-shadow:0 0 12px ${col}22` : ''}">
      ${isBest ? `<div style="position:absolute;top:0;left:0;width:100%;height:2px;background:linear-gradient(90deg,transparent,${col},transparent)"></div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-family:'Orbitron',monospace;font-size:18px;color:${col};font-weight:900;width:24px;">#${rank+1}</div>
          <div>
            <div style="font-family:'Orbitron',monospace;font-size:10px;color:${col};letter-spacing:0.15em;">${name}</div>
            <div style="font-family:'Orbitron',monospace;font-size:8px;color:var(--muted);margin-top:2px;">${stats.played || 0} sorteos evaluados</div>
          </div>
          ${isBest ? `<div style="background:${col}22;border:1px solid ${col};border-radius:3px;padding:2px 8px;font-family:'Orbitron',monospace;font-size:8px;color:${col};">★ MEJOR</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Orbitron',monospace;font-size:22px;color:${col};font-weight:700;">${score}</div>
          <div style="font-family:'Orbitron',monospace;font-size:8px;color:var(--muted);">SCORE</div>
        </div>
      </div>
      <!-- Score bar -->
      <div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:12px;overflow:hidden;">
        <div style="height:100%;width:${score}%;background:${col};border-radius:2px;transition:width 1s;"></div>
      </div>
      <!-- Metrics grid -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">
        ${[
          ['Win Rate', (stats.winRate||0)+'%'],
          ['Prom. Hits', (stats.avgHits||0)],
          ['Victorias', stats.wins||0],
          ['Racha', stats.bestStreak||0],
          ['Dist. Prom', (stats.avgDistance||0)]
        ].map(([lbl,val]) => `
          <div style="background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:4px;padding:6px;text-align:center;">
            <div style="font-family:'Orbitron',monospace;font-size:12px;color:${col};">${val}</div>
            <div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;">${lbl}</div>
          </div>`).join('')}
      </div>
      <!-- Hits distribution -->
      <div style="margin-top:10px;display:flex;gap:4px;align-items:flex-end;height:32px;">
        ${[0,1,2,3,4,5].map(h => {
          const cnt = stats[`hits${h}`] || 0;
          const pct = stats.played ? Math.round(cnt/stats.played*100) : 0;
          const barH = Math.max(4, pct * 0.32);
          const barCol = h===0?'#2a2a4a':h===1?'#1a3050':h===2?'#004466':h===3?'#006688':h===4?'var(--accent3)':'var(--accent4)';
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;" title="${cnt}x con ${h} aciertos">
            <div style="font-family:'Orbitron',monospace;font-size:7px;color:var(--muted);">${cnt}</div>
            <div style="width:100%;height:${barH}px;background:${barCol};border-radius:2px;"></div>
            <div style="font-family:'Orbitron',monospace;font-size:7px;color:var(--muted);">${h}✓</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });

  html += `</div>`;

  // Recent evaluations table
  const recent = [...L.records]
    .filter(r => r.result !== null)
    .sort((a,b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 10);

  if (recent.length > 0) {
    html += `<div class="panel-title" style="margin-top:20px;">// Historial de evaluaciones recientes</div>`;
    html += `<div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-family:'Orbitron',monospace;font-size:9px;">
      <thead>
        <tr style="color:var(--muted);border-bottom:1px solid var(--border);">
          <th style="padding:8px 4px;text-align:left;">Fecha</th>
          <th style="padding:8px 4px;text-align:left;">Estrategia</th>
          <th style="padding:8px 4px;text-align:left;">Combo</th>
          <th style="padding:8px 4px;text-align:center;">✓</th>
          <th style="padding:8px 4px;text-align:center;">Dist</th>
          <th style="padding:8px 4px;text-align:center;">🏆</th>
        </tr>
      </thead>
      <tbody>
        ${recent.map(r => {
          const col = modeColors[r.mode] || 'var(--muted)';
          const hitCells = r.combo.map(n => {
            const isHit = r.result && r.result.includes(n);
            return `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:8px;font-weight:700;${isHit ? `background:${col}33;border:1px solid ${col};color:${col}` : 'background:var(--border);color:var(--muted);'};">${String(n).padStart(2,'0')}</span>`;
          }).join(' ');
          return `<tr style="border-bottom:1px solid var(--border);${r.winner?`background:${col}08`:''}" >
            <td style="padding:8px 4px;color:var(--muted);">${r.fecha}</td>
            <td style="padding:8px 4px;color:${col};">${(modeNames[r.mode]||r.mode).replace(/^\S+\s/,'')}</td>
            <td style="padding:8px 4px;">${hitCells}</td>
            <td style="padding:8px 4px;text-align:center;color:${r.hits>0?col:'var(--muted)'};">${r.hits}</td>
            <td style="padding:8px 4px;text-align:center;color:var(--muted);">${r.distance}</td>
            <td style="padding:8px 4px;text-align:center;">${r.winner ? '🏆' : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  container.innerHTML = html;
}

// ============================================================
// AUTO-EVALUATE on data load
// ============================================================
function onDataLoaded(DB) {
  const L = evaluateAll(DB);
  renderLearningPanel();

  // Auto-select best strategy if enough data
  const best = getBestStrategy();
  if (best && typeof setMode === 'function') {
    // Only suggest, don't force
    const bestEl = document.getElementById('best-strategy-hint');
    if (bestEl) {
      const modeNames = { hot:'Calientes', balanced:'Equilibrado', cold:'Fríos', recent:'Reciente', adaptive:'Adaptativo' };
      bestEl.textContent = `★ Mejor históricamente: ${modeNames[best] || best}`;
      bestEl.style.display = 'block';
    }
  }
}

// Called after generate() to register the first combo per mode per date
function afterGenerate(fecha, mode, firstCombo) {
  recordGeneration(fecha, mode, firstCombo);
}
