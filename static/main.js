// === main.js (Add-ons ohne Entfernen bestehender Funktionen) ===

let allTrials = [];
let blockIndex = 0;
let currentIndex = 0;
let selections = [];
let selectedIndices = [];
let dataGlobal = null;
let currentLassoColorIndex = 0;
let highlightIndex = -1;
let trialGlobalIndex = 0;
let trialStartTime = null;
let pauseStartTime = null;
let totalPausedTime = 0;
let participantCode = Math.floor(100000 + Math.random() * 900000);  // 6-digit ID
let blocks = {};
let surveyDataGlobal = null;
let e5PageIndex = 0;
let e5TotalPages = 8;
const blockKeys = ["E1", "E2", "E3", "E4"];

// === PROLIFIC: URL-Parameter erfassen (NEU) ===
const _params = new URLSearchParams(window.location.search);
const prolificInfo = {
  pid: _params.get("PROLIFIC_PID") || _params.get("prolific_pid") || null,
  studyId: _params.get("STUDY_ID") || _params.get("study_id") || null,
  sessionId: _params.get("SESSION_ID") || _params.get("session_id") || null,
  preview: ["1", "true", "TRUE"].includes((_params.get("preview") || "").trim())
};
// ← HIER deinen echten Completion-Code eintragen:
const PROLIFIC_COMPLETION_URL = "https://app.prolific.com/submissions/complete?cc=REPLACE_WITH_YOUR_CODE";
// === ENDE PROLIFIC-Setup ===

// 20 vivid, grey-free colours with good hue spacing
const COLORS = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#17becf", // teal
  "#7f3c8d", // violet
  "#11a579", // teal-green
  "#3969ac", // steel blue
  "#f2b701", // amber 
  "#e73f74", // magenta
  "#80ba5a", // light green
  "#e68310", // orange-brown
  "#008695", // cyan-deep
  "#cf1c90", // fuchsia
  "#f97b72", // salmon
  "#4b4b8f", // indigo
  "#2d6a4f"  // forest green
];

const TASKS = {
  E1: "Select all clusters using the lasso tool. Each lasso selection shall represent one cluster.",
  E2: "You will see a red-highlighted point. Please select the cluster this point belongs to.",
  E3: "One cluster will be highlighted. Select the cluster that is nearest to it.",
  E4: "Select the cluster that is most compact or dense (most tightly packed points).",
  E5: "Task 5: Rank all projections from 1 (best) to 10 (worst) accordingly to their cluster separation perfomance. Same ranks allowed."
};

// ===== Helpers =====
function totalTrialsPlanned() {
  // Summe aller Trials in E1..E4 + 1 Sanity pro Block
  const trials = blockKeys.reduce((s, k) => s + (blocks[k]?.length || 0), 0);
  return trials + blockKeys.length + e5TotalPages; // + Sanity-Checks +e5
}

function ensurePauseButton() {
  // Falls kein Pause-Button im HTML existiert, füge ihn in die Button-Reihe ein
  let pauseBtn = document.getElementById("pause-btn");
  if (!pauseBtn) {
    const row = document.getElementById("button-row");
    if (row) {
      pauseBtn = document.createElement("button");
      pauseBtn.id = "pause-btn";
      pauseBtn.textContent = "Pause";
      row.insertBefore(pauseBtn, row.firstChild);
    }
  }
  return pauseBtn;
}

window.onbeforeunload = function(event) {
    event.preventDefault();
    event.returnValue = "Are you sure you want to leave this page? All data will be lost and you need to start over.";
    return event.returnValue;
};

// === NEW PAUSE LOGIC ===
let isPaused = false;
let pauseOverlay = null;

function createPauseOverlay() {
  if (pauseOverlay) return pauseOverlay;
  pauseOverlay = document.createElement("div");
  pauseOverlay.id = "pause-overlay";
  Object.assign(pauseOverlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "28px",
    zIndex: "9999",
    cursor: "pointer",
    textAlign: "center",
    userSelect: "none"
  });
  pauseOverlay.innerHTML = `
    <div>
      <div style="font-weight:700;margin-bottom:12px;">Paused</div>
      <div>Click anywhere to resume<br/>(or press Esc / Enter / Space)</div>
    </div>
  `;
  document.body.appendChild(pauseOverlay);

  // Click anywhere to resume
  pauseOverlay.addEventListener("click", () => {
    if (isPaused) setPaused(false);
  });

  // Keyboard resume
  window.addEventListener("keydown", (e) => {
    if (!isPaused) return;
    if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setPaused(false);
    }
  });

  return pauseOverlay;
}

function setPaused(state) {
  if (state === isPaused) return;
  isPaused = state;
  createPauseOverlay();
  pauseOverlay.style.display = state ? "flex" : "none";

  if (state) {
    // just paused
    pauseStartTime = Date.now();
  } else {
    // just resumed
    if (pauseStartTime) {
      totalPausedTime += Date.now() - pauseStartTime;
      pauseStartTime = null;
    }
  }

  console.log(state ? "🛑 Paused" : "▶️ Resumed");
}

// === END NEW PAUSE LOGIC ===

function updateProgressCounter() {
  const el = document.getElementById("progress-counter");
  if (!el) return;
  const total = totalTrialsPlanned();

  let current;
  if (blockIndex >= blockKeys.length) {
    // Wir sind in E5 → trialGlobalIndex bleibt stehen, nur e5PageIndex zählt
    const trialsBeforeE5 = total - e5TotalPages; 
    current = trialsBeforeE5 + e5PageIndex + 1;
  } else {
    // Normaler Fortschritt
    current = Math.min(trialGlobalIndex + 1, total);
  }

  el.innerText = `${Math.min(current, total)} of ${total}`;
}

// ===== App-Start =====
window.addEventListener("DOMContentLoaded", () => {
  // Hide default elements
  const viz = document.getElementById("viz");
  const e5c = document.getElementById("e5-container");
  const next = document.getElementById("next");
  const reset = document.getElementById("reset");
  const submit = document.getElementById("submit-now");
  const status = document.getElementById("status");
  const counter = document.getElementById("progress-counter");

  if (viz) viz.style.display = "none";
  if (e5c) e5c.style.display = "none";
  if (next) next.style.display = "none";
  if (reset) reset.style.display = "none";
  if (submit) submit.style.display = "none";
  if (status) status.style.display = "none";
  if (counter) counter.style.display = "none";

  // Build overlay once
  createPauseOverlay();

  // Pause-Button hinzufügen (falls nicht vorhanden)
  const pauseBtn = ensurePauseButton();
  if (pauseBtn) {
    // New approach: button only PAUSES; resume is via overlay click / keys
    pauseBtn.addEventListener("click", () => setPaused(true));
    pauseBtn.style.display = "none"; // erst nach Welcome anzeigen
  }

  // Zuerst Survey laden
  fetch("survey.html")
    .then(res => res.ok ? res.text() : Promise.reject("survey.html not found"))
    .then(html => {
      const td = document.getElementById("task-desc");
      if (td) td.innerHTML = html;

      const form = document.getElementById("survey-form");
      if (form) {
        form.addEventListener("submit", e => {
          e.preventDefault();
          const formData = new FormData(form);
          const surveyData = {};
          formData.forEach((value, key) => {
            surveyData[key] = value;
          });

          // global speichern
          surveyDataGlobal = surveyData;

          console.log("✅ Survey responses saved:", surveyData);

          // Danach Intro laden
          loadIntro();
        });
      }

    });

  function loadIntro() {
    fetch("intro.html")
      .then(res => res.ok ? res.text() : Promise.reject("intro.html not found"))
      .then(html => {
        const td = document.getElementById("task-desc");
        if (td) td.innerHTML = html;

        const startBtn = document.getElementById("start-btn");
        if (startBtn) {
          startBtn.addEventListener("click", () => loadStudy());
        } else {
          loadStudy(); // Fallback
        }
      });
  }

  // Reset / Submit Handler nur setzen, wenn Elemente existieren
  if (reset) {
    reset.onclick = () => {
      const exp = blockKeys[blockIndex];
      if (exp && dataGlobal) drawScatterplot(dataGlobal, exp);
    };
  }
  if (submit) {
    submit.onclick = () => {
      fetch("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: selections, survey: surveyDataGlobal,  timestamp: new Date().toISOString(), participantCode })
      }).then(() => {
        const st = document.getElementById("status");
        if (st) st.innerText = "✅ Results saved.";
      });
    };
  }
});

// ===== Bestehende Funktionen (unverändert benannt) =====
function showWelcome() {
  const viz = document.getElementById("viz");
  const e5c = document.getElementById("e5-container");
  const td = document.getElementById("task-desc");
  const next = document.getElementById("next");
  const reset = document.getElementById("reset");
  const submit = document.getElementById("submit-now");
  const counter = document.getElementById("progress-counter");
  const pauseBtn = document.getElementById("pause-btn");

  if (viz) viz.style.display = "none";
  if (e5c) e5c.style.display = "none";

  // === PROLIFIC: Welcome-Text anpassen (NEU) ===
  let welcomeHtml = `<p>Click <b>Next</b> to continue to the task blocks. Each task block includes an example first.</p>`;
  if (!prolificInfo.pid) {
    // Nur wenn NICHT Prolific → optionalen Teilnehmercode zeigen
    welcomeHtml = `<p><b>Your participant code is:</b> <code>${participantCode}</code></p>` + welcomeHtml;
  } else {
    welcomeHtml = `<p>You are participating via Prolific (<code>${prolificInfo.pid}</code>).</p>` + welcomeHtml;
  }
  if (td) td.innerHTML = welcomeHtml;
  if (next) { next.style.display = "inline-block"; next.onclick = () => showBlockIntro(); }
  if (reset) reset.style.display = "inline-block";
  if (submit) submit.style.display = "inline-block";
  if (counter) { counter.style.display = "block"; updateProgressCounter(); }
  if (pauseBtn) pauseBtn.style.display = "inline-block";
}

function showBlockIntro() {
  if (blockIndex >= blockKeys.length) {
    showE5();
    return;
  }

  const exp = blockKeys[blockIndex];
  const introText = {
    E1: `<h3>Task 1: Cluster Identification</h3><p>Select all clusters using the lasso tool. Each lasso selection shall represent one cluster.</p>`,
    E2: `<h3>Task 2: Membership Identification</h3><p>You will see a red-highlighted point. Please select the cluster this point belongs to.</p>`,
    E3: `<h3>Task 3: Distance Comparison</h3><p>One cluster will be highlighted. Select the cluster that is nearest to it.</p>`,
    E4: `<h3>Task 4: Density Comparison</h3><p>Select the cluster that is most compact or dense (most tightly packed points).</p>`
  }[exp];

  const td = document.getElementById("task-desc");
  if (td) td.innerHTML = introText + `<p>Click <b>Next</b> to try an example before real trials begin.</p>`;

  const viz = document.getElementById("viz");
  if (viz) viz.style.display = "none";

  const status = document.getElementById("status");
  if (status) status.style.display = "block";

  const next = document.getElementById("next");
  if (next) next.onclick = () => showSanityCheck(exp);
}

function showSanityCheck(experiment) {
  const svg = d3.select("#viz");
  document.getElementById("viz").style.display = "block";
  selectedIndices = [];
  currentLassoColorIndex = 0;

  svg.selectAll("*").remove();
  const width = +svg.attr("width"), height = +svg.attr("height");

  let clusters;
  if (experiment === "E1") {
    clusters = [
      d3.range(50).map(() => [Math.random() * 0.2 + 0.2, Math.random() * 0.2 + 0.2]),
      d3.range(50).map(() => [Math.random() * 0.2 + 0.6, Math.random() * 0.2 + 0.6])
    ];
  } else if (experiment === "E2") {
    clusters = [
      d3.range(50).map(() => [Math.random() * 0.2 + 0.2, Math.random() * 0.2 + 0.2]),
      d3.range(50).map(() => [Math.random() * 0.2 + 0.6, Math.random() * 0.2 + 0.6]),
      d3.range(50).map(() => [Math.random() * 0.2 + 0.4, Math.random() * 0.2 + 0.6])
    ];
  } else {
    clusters = [
      d3.range(50).map(() => [Math.random() * 0.05 + 0.25, Math.random() * 0.05 + 0.25]),
      d3.range(50).map(() => [Math.random() * 0.2 + 0.6, Math.random() * 0.2 + 0.6]),
      d3.range(50).map(() => [Math.random() * 0.1 + 0.4, Math.random() * 0.1 + 0.2])
    ];
  }

  const all = clusters.flat().map((d, i) => ({
    x: d[0] * width, y: d[1] * height, label: Math.floor(i / 50), index: i
  }));

  const circles = svg.selectAll("circle").data(all).enter()
    .append("circle")
    .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 4)
    .attr("fill", "grey")
    .attr("fill-opacity", 0.7)
    .attr("stroke", "none");

  // Highlight passend zur Aufgabe
  if (experiment === "E2") {
    const redIdx = 80;
    d3.select(circles.nodes()[redIdx]).attr("fill", "red").attr("fill-opacity", 0.9);
  } else if (experiment === "E3") {
    all.forEach((p, i) => {
      if (p.label === 0) d3.select(circles.nodes()[i]).attr("fill", "red").attr("fill-opacity", 0.9);
    });
  }

  setupUnifiedLasso(svg, all, circles, { multiSelect: experiment === "E1" });

  const next = document.getElementById("next");
  if (next) {
    next.onclick = () => {
      let correct = false;

      if (experiment === "E1") {
        // Erwartet: genau 2 Gruppen (0–49 und 50–99)
        if (selectedIndices.length === 2) {
          const groupA = new Set([...Array(50).keys()]);        
          const groupB = new Set([...Array(50).keys()].map(i => i + 50)); 

          const selGroups = selectedIndices.map(g => new Set(g));
          const matchA = selGroups.some(g => groupA.size === g.size && [...groupA].every(i => g.has(i)));
          const matchB = selGroups.some(g => groupB.size === g.size && [...groupB].every(i => g.has(i)));

          correct = matchA && matchB;
        }
      } else if (experiment === "E2") {
        // Erwartet: Punkte 50–149
        const required = new Set([...Array(100).keys()].map(i => i + 50));
        const selected = new Set(selectedIndices.flat());
        correct = required.size === selected.size && [...required].every(i => selected.has(i));
      } else if (experiment === "E3") {
        // Erwartet: Punkte 100–149
        const required = new Set([...Array(50).keys()].map(i => i + 100));
        const selected = new Set(selectedIndices.flat());
        correct = required.size === selected.size && [...required].every(i => selected.has(i));
      } else if (experiment === "E4") {
        // Erwartet: Punkte 0–49
        const required = new Set([...Array(50).keys()]);
        const selected = new Set(selectedIndices.flat());
        correct = required.size === selected.size && [...required].every(i => selected.has(i));
      }

      if (correct) {
        selections.push({
          experiment: experiment + "_sanity",
          selected: selectedIndices.map(g => g.slice())
        });
        currentIndex = 0;
        trialGlobalIndex++;
        updateProgressCounter();
        loadTrial();
      } else {
        alert("That was not correct. Read the task and try it again.");
        selectedIndices = []; // Reset Selections
        svg.selectAll("circle").attr("stroke", null).attr("stroke-width", null); // Reset visuals
      }
    };
  }
}


function loadTrial() {
  const exp = blockKeys[blockIndex];
  const block = blocks[exp];
  const trial = block[currentIndex];
  if (!trial) {
    blockIndex++;
    showBlockIntro();
    return;
  }

  document.getElementById("viz").style.display = "block";
  const td = document.getElementById("task-desc");
  if (td) td.innerText = TASKS[trial.experiment];

  updateProgressCounter();
  currentLassoColorIndex = 0;

  fetch(`/data/${trial.dataset}/${trial.projection}`)
    .then(res => res.json())
    .then(data => {
      dataGlobal = data;
      trialStartTime = Date.now();
      totalPausedTime = 0;
      pauseStartTime = null;
      drawScatterplot(data, trial.experiment);
    });

  const next = document.getElementById("next");
  if (next) {
    next.onclick = () => {
          // 🚨 Check: wurde etwas ausgewählt?
      if (selectedIndices.length === 0) {
        alert("Please select at least one point before continuing.");
        return; // Stoppe hier, nicht weitermachen
      }
      const duration = Date.now() - trialStartTime - totalPausedTime;
      selections.push({
        experiment: trial.experiment,
        dataset: trial.dataset,
        projection: trial.projection,
        selected: selectedIndices.map(g => g.slice()),
        time_ms: duration
      });
      currentIndex++;
      trialGlobalIndex++;
      updateProgressCounter();
      loadTrial();
    };
  }
}

function drawScatterplot(data, experiment) {
  selectedIndices = [];
  const svg = d3.select("#viz");
  svg.selectAll("*").remove();

  const width = +svg.attr("width");
  const height = +svg.attr("height");
  const x = d3.scaleLinear().domain(d3.extent(data.X, d => d[0])).range([40, width - 40]);
  const y = d3.scaleLinear().domain(d3.extent(data.X, d => d[1])).range([height - 40, 40]);

  const points = data.X.map((d, i) => ({ x: x(d[0]), y: y(d[1]), label: data.y[i], index: i }));

  // Use worst_point_index if available and valid
  if (data.worst_point_index !== null && !isNaN(data.worst_point_index) && data.worst_point_index >= 0 && data.worst_point_index < points.length) {
    highlightIndex = data.worst_point_index;
    console.log(`Using worst_point_index: ${highlightIndex}`);
  } else {
    highlightIndex = Math.floor(Math.random() * points.length);
    console.warn("No valid worst_point_index found, using random index:", highlightIndex);
  }

  let targetLabel = points[highlightIndex].label;

  const circles = svg.selectAll("circle").data(points).enter()
    .append("circle")
    .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 3.5)
    .attr("fill", d => {
      if (experiment === "E1" || experiment === "E4") return "grey";
      if (experiment === "E2") return d.index === highlightIndex ? "red" : "grey";
      if (data.nearest_pair && data.nearest_pair.nearest_cluster !== undefined) {
          return d.label === data.nearest_pair.nearest_cluster ? "red" : "grey";
        }
      return COLORS[d.label % COLORS.length];
    })
    .attr("fill-opacity", 0.6)
    .attr("stroke", "none");

  if (experiment === "E2" && highlightIndex != null) {
    svg.append("circle")
      .attr("class", "highlight-point")
      .attr("cx", points[highlightIndex].x)
      .attr("cy", points[highlightIndex].y)
      .attr("r", 3.5)
      .attr("fill", "red")
      .attr("stroke", "#900")
      .attr("stroke-width", 1.5);
  }

  setupUnifiedLasso(svg, points, circles, { multiSelect: experiment === "E1" });
}

// === Einzige Lasso-Implementierung für Sanity & Trials ===
function setupUnifiedLasso(svg, points, circles, opts = { multiSelect: true }) {
  let lassoPath = svg.append("path")
    .attr("fill", "rgba(0,0,255,0.10)")
    .attr("stroke", "blue")
    .attr("stroke-width", 1)
    .attr("visibility", "hidden");

  let lassoPolygon = [], isLassoing = false;

  function repaint() {
    // Alle Strokes löschen
    circles.attr("stroke", "none").attr("stroke-width", 0);
    // Gruppen farbig umranden
    selectedIndices.forEach((group, gi) => {
      const color = COLORS[gi % COLORS.length];
      group.forEach(idx => {
        const node = circles.nodes()[idx];
        if (node) d3.select(node).attr("stroke", color).attr("stroke-width", 2);
      });
    });
  }

  svg.on("mousedown", (event) => {
    if (isPaused) return;
    lassoPolygon = [d3.pointer(event)];
    isLassoing = true;
    lassoPath.attr("visibility", "visible").attr("d", null);
  });

  svg.on("mousemove", (event) => {
    if (isPaused || !isLassoing) return;
    lassoPolygon.push(d3.pointer(event));
    lassoPath.attr("d", "M" + lassoPolygon.map(p => p.join(",")).join("L") + "Z");
  });

  svg.on("mouseup", () => {
    if (isPaused) return;
    isLassoing = false;

    // Indizes, die in der Lasso-Polygon liegen
    const sel = [];
    for (let i = 0; i < points.length; i++) {
      if (d3.polygonContains(lassoPolygon, [points[i].x, points[i].y])) sel.push(points[i].index);
    }
    if (sel.length === 0) {
      lassoPath.attr("visibility", "hidden");
      return;
    }

    // Einzigartige Zugehörigkeit: zuerst alle gewählten Indizes aus bestehenden Gruppen entfernen
    selectedIndices = selectedIndices.map(g => g.filter(idx => !sel.includes(idx)));

    if (opts.multiSelect) {
      // Mehrere Cluster erlaubt (E1): neuen Cluster hinzufügen
      selectedIndices.push(sel);
      currentLassoColorIndex++;
    } else {
      // Single-Cluster-Modus (E2/E3/E4): ersetze Auswahl vollständig
      selectedIndices = [sel];
      currentLassoColorIndex = 1;
    }

    repaint();
    lassoPath.attr("visibility", "hidden");
  });
}

// === E5 FINAL RANKING ===

function showE5() {
  const viz = document.getElementById("viz");
  if (viz) viz.style.display = "none";
  
  const td = document.getElementById("task-desc");
  if (td) td.innerText = TASKS["E5"];

  const div = document.getElementById("e5-container");
  if (div) {
    div.style.display = "block";
    div.innerHTML = "";
  }

  const datasets = [...new Set(Object.values(blocks).flat().map(t => t.dataset))];
  datasets.sort(() => Math.random() - 0.5);

  e5PageIndex = 0;
  let rankings = {};
  datasets.forEach(ds => { rankings[ds] = {}; });

  const nextBtn = document.getElementById("next");
  if (nextBtn) nextBtn.style.display = "inline-block";

  function renderPage() {
    div.innerHTML = `<h3>Please rank the following projections</h3>`;
    
    const projections = [...new Set(Object.values(blocks).flat()
      .filter(t => t.dataset === datasets[e5PageIndex])
      .map(t => t.projection))];
    projections.sort(() => Math.random() - 0.5); // Randomisierung pro Seite

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(5, 1fr)";
    grid.style.gridTemplateRows = "repeat(2, auto)";
    grid.style.gap = "10px";

    projections.forEach(proj => {
      const cell = document.createElement("div");
      cell.style.border = "1px solid #ccc";
      cell.style.padding = "5px";
      cell.style.textAlign = "center";

      // SVG für Projection
      const svg = d3.create("svg")
        .attr("width", 200)
        .attr("height", 200);
      
      fetch(`/data/${datasets[e5PageIndex]}/${proj}`)
        .then(res => res.json())
        .then(data => {
          const width = 200, height = 200;
          const x = d3.scaleLinear()
            .domain(d3.extent(data.X, d => d[0]))
            .range([10, width - 10]);
          const y = d3.scaleLinear()
            .domain(d3.extent(data.X, d => d[1]))
            .range([height - 10, 10]);

          const points = data.X.map(d => ({ x: x(d[0]), y: y(d[1]) }));
          svg.selectAll("circle").data(points).enter()
            .append("circle")
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("r", 2.5)
            .attr("fill", "grey")
            .attr("fill-opacity", 0.6);
        });

      cell.appendChild(svg.node());

      // Ranking-Dropdown
      const select = document.createElement("select");
      select.innerHTML = `<option value="">Rank</option>` + 
        Array.from({length: 10}, (_,i) => `<option value="${i+1}">${i+1}</option>`).join("");
      select.value = rankings[datasets[e5PageIndex]][proj] || "";
      select.addEventListener("change", () => {
        rankings[datasets[e5PageIndex]][proj] = parseInt(select.value);
      });

      cell.appendChild(document.createElement("br"));
      cell.appendChild(select);
      grid.appendChild(cell);
    });

    div.appendChild(grid);

    // Fortschritt updaten
    updateProgressCounter();

    // Button-Logik
    if (e5PageIndex < datasets.length - 1) {
      nextBtn.innerText = "Next";
      nextBtn.onclick = () => {
        e5PageIndex++;
        trialGlobalIndex++; // zählt E5-Seiten als Trials
        renderPage();
      };
    } else {
      nextBtn.innerText = "Submit Rankings";
      nextBtn.onclick = () => {
        selections.push({ experiment: "E5", preference: rankings });
        // === PROLIFIC: Ergebnisse inkl. Survey & Prolific-Felder senden (NEU) ===
        const payload = {
          results: selections,
          survey: surveyDataGlobal || {},
          prolific: prolificInfo,
          timestamp: new Date().toISOString(),
          participantCode
        };

        fetch("/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results: selections, survey: surveyDataGlobal, timestamp: new Date().toISOString(), participantCode })
        }).then(res => {
          if (res.ok) {
            // === PROLIFIC: Redirect auf Completion-URL, falls über Prolific (NEU) ===
            if (prolificInfo.pid && PROLIFIC_COMPLETION_URL.includes("complete?cc=")) {
              window.location.replace(PROLIFIC_COMPLETION_URL);
              return;
            }
            // Fallback: lokale „Danke“-Seite

            document.body.innerHTML = `
              <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;">
                <h1 style="font-size:2em; margin-bottom:20px;">Thanks for participating!</h1>
                <p style="font-size:1.2em;">Your responses have been recorded.</p>
              </div>
            `;
          } else {
            alert("Submission failed. Please try again.");
            nextBtn.disabled = false;

          }
        }).catch(err => {
          console.error(err);
          alert("Submission failed. Please try again.");
          nextBtn.disabled = false;
        });
      };
    }
  }

  renderPage();
}


function loadStudy() {
  fetch("/projections")
    .then(res => res.json())
    .then(data => {
      blockKeys.forEach(key => {
        let trials = [];
        for (const dataset of Object.keys(data)) {
          for (const proj of data[dataset]) {
                        // ❌ Unerwünschte Dateien rausfiltern
            if (
              proj === "labels" ||
              proj.startsWith("E2_") ||
              proj.startsWith("E3_") ||
              proj.startsWith("E4_")
            ) {
              continue;
            }
            trials.push({ dataset, projection: proj, experiment: key });
          }
        }
        trials.sort(() => Math.random() - 0.5);
        blocks[key] = trials;
      });
      showWelcome();
    });
}
