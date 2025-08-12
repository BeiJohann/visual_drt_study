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
let participantCode = Math.floor(100000 + Math.random() * 900000);  // 6-digit ID
let blocks = {};
const blockKeys = ["E1", "E2", "E3", "E4"];
const COLORS = d3.schemeCategory10;
const TASKS = {
  E1: "Task 1: Select all visually separate clusters using lasso. Multiple selections are allowed.",
  E2: "Task 2: Select the cluster that contains the red-highlighted point.",
  E3: "Task 3: Select the cluster that is closest to the red-highlighted cluster.",
  E4: "Task 4: Select the densest cluster (the one with highest point density).",
  E5: "Task 5: Rank all projections from 1 (best) to 10 (worst). Same ranks allowed."
};

window.addEventListener("DOMContentLoaded", () => {
  // Hide default elements
  document.getElementById("viz").style.display = "none";
  document.getElementById("e5-container").style.display = "none";
  document.getElementById("next").style.display = "none";
  document.getElementById("reset").style.display = "none";
  document.getElementById("submit-now").style.display = "none";
  document.getElementById("status").style.display = "none";
  document.getElementById("progress-counter").style.display = "none";

  fetch("intro.html")
    .then(res => res.text())
    .then(html => {
      document.getElementById("task-desc").innerHTML = html;
      document.getElementById("start-btn").addEventListener("click", () => {
        loadStudy();
      });
    });
});

function showWelcome() {
  document.getElementById("viz").style.display = "none";
  document.getElementById("e5-container").style.display = "none";
  document.getElementById("task-desc").innerHTML = `
    <p><b>Your participant code is:</b> <code>${participantCode}</code> — please remember or save this!</p>
    <p>Click <b>Next</b> to continue to the task blocks. Each task block includes an example first.</p>
  `;
  document.getElementById("next").style.display = "inline-block";
  document.getElementById("reset").style.display = "inline-block";
  document.getElementById("submit-now").style.display = "inline-block";

  document.getElementById("progress-counter").style.display = "block";
  document.getElementById("next").onclick = () => showBlockIntro();
}

function showBlockIntro() {
  if (blockIndex >= blockKeys.length) {
    showE5();
    return;
  }

  const exp = blockKeys[blockIndex];
  const introText = {
    E1: `<h3>Task 1: Cluster Identification</h3><p>You will select all clearly visible clusters. Use the lasso tool to draw around points. Multiple selections are allowed.</p>`,
    E2: `<h3>Task 2: Target Cluster</h3><p>You will see a red-highlighted point. Please select the cluster this point belongs to.</p>`,
    E3: `<h3>Task 3: Closest Cluster</h3><p>One cluster will be highlighted. Select the cluster that is nearest to it.</p>`,
    E4: `<h3>Task 4: Densest Cluster</h3><p>Select the cluster that is most compact or dense (most tightly packed points).</p>`
  }[exp];

  document.getElementById("task-desc").innerHTML = introText + `<p>Click <b>Next</b> to try an example before real trials begin.</p>`;
  document.getElementById("viz").style.display = "none";
  document.getElementById("status").style.display = "block";
  document.getElementById("next").onclick = () => showSanityCheck(exp);
}

function showSanityCheck(experiment) {
  document.getElementById("viz").style.display = "block";
  currentLassoColorIndex = 0;
  selectedIndices = [];
  const svg = d3.select("#viz");
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
    .attr("fill", (d, i) => {
      if (experiment === "E2" && d.index === 20) return "red";
      if (experiment === "E3" && d.label === 0) return "red";
      return "grey";
    }).attr("fill-opacity", 0.6);

  document.getElementById("task-desc").innerHTML =
    `<h3>Example Task (${experiment})</h3><p>Use the lasso tool on the cluster(s) as instructed. After lassoing, click <b>Next</b> to continue.</p>`;

  let lassoPath = svg.append("path")
    .attr("fill", "rgba(0,0,255,0.1)").attr("stroke", "blue")
    .attr("stroke-width", 1).attr("visibility", "hidden");

  let lassoPolygon = [], isLassoing = false;
  svg.on("mousedown", (event) => {
    lassoPolygon = [d3.pointer(event)];
    isLassoing = true;
    lassoPath.attr("visibility", "visible");
  });
  svg.on("mousemove", (event) => {
    if (!isLassoing) return;
    lassoPolygon.push(d3.pointer(event));
    lassoPath.attr("d", "M" + lassoPolygon.map(p => p.join(",")).join("L") + "Z");
  });
  svg.on("mouseup", () => {
    isLassoing = false;
    let selection = [];
    all.forEach((p, i) => {
      if (d3.polygonContains(lassoPolygon, [p.x, p.y])) {
        selection.push(p.index);
        d3.select(circles.nodes()[i]).attr("stroke", COLORS[currentLassoColorIndex % 10]).attr("stroke-width", 2);
      }
    });
    selectedIndices.push(selection);
    currentLassoColorIndex++;
    lassoPath.attr("visibility", "hidden");
  });

  document.getElementById("next").onclick = () => {
    selections.push({
      experiment: experiment + "_sanity",
      selected: selectedIndices
    });
    currentIndex = 0;
    trialGlobalIndex++;
    loadTrial();
  };
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
  document.getElementById("task-desc").innerText = TASKS[trial.experiment];
  document.getElementById("progress-counter").innerText =
    `Experiment ${trial.experiment} | Trial ${trialGlobalIndex + 1}`;
  currentLassoColorIndex = 0;

  fetch(`/data/${trial.dataset}/${trial.projection}`)
    .then(res => res.json())
    .then(data => {
      dataGlobal = data;
      trialStartTime = Date.now();
      drawScatterplot(data, trial.experiment);
    });

  document.getElementById("next").onclick = () => {
    const duration = Date.now() - trialStartTime;
    selections.push({
      experiment: trial.experiment,
      dataset: trial.dataset,
      projection: trial.projection,
      selected: selectedIndices,
      time_ms: duration
    });
    currentIndex++;
    trialGlobalIndex++;
    loadTrial();
  };
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
  highlightIndex = Math.floor(Math.random() * points.length);
  let targetLabel = points[highlightIndex].label;

  const circles = svg.selectAll("circle").data(points).enter()
    .append("circle")
    .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 3.5)
    .attr("fill", d => {
      if (experiment === "E1" || experiment === "E4") return "grey";
      if (experiment === "E2") return d.index === highlightIndex ? "red" : "grey";
      if (experiment === "E3") return d.label === targetLabel ? "red" : "grey";
      return COLORS[d.label % 10];
    }).attr("fill-opacity", 0.6).attr("stroke", "none");

  let lassoPath = svg.append("path")
    .attr("fill", "rgba(0,0,255,0.1)").attr("stroke", "blue")
    .attr("stroke-width", 1).attr("visibility", "hidden");

  let lassoPolygon = [], isLassoing = false;
  svg.on("mousedown", (event) => {
    lassoPolygon = [d3.pointer(event)];
    isLassoing = true;
    lassoPath.attr("visibility", "visible");
  });
  svg.on("mousemove", (event) => {
    if (!isLassoing) return;
    lassoPolygon.push(d3.pointer(event));
    lassoPath.attr("d", "M" + lassoPolygon.map(p => p.join(",")).join("L") + "Z");
  });
  svg.on("mouseup", () => {
    isLassoing = false;
    const color = COLORS[currentLassoColorIndex % COLORS.length];
    let selection = [];
    for (let i = 0; i < points.length; i++) {
      if (d3.polygonContains(lassoPolygon, [points[i].x, points[i].y])) {
        selection.push(points[i].index);
      }
    }
    if (experiment === "E1") {
      currentLassoColorIndex++;
      selectedIndices.push(selection);
      selection.forEach(idx => {
        d3.select(circles.nodes()[idx]).attr("stroke", color).attr("stroke-width", 2);
      });
    } else {
      selectedIndices = [selection];
      svg.selectAll("circle").attr("stroke", null).attr("stroke-width", null);
      selection.forEach(idx => {
        d3.select(circles.nodes()[idx]).attr("stroke", "black").attr("stroke-width", 2);
      });
    }
    lassoPath.attr("visibility", "hidden");
  });
}

// === RESET & SUBMIT ===
document.getElementById("reset").onclick = () => {
  const exp = blockKeys[blockIndex];
  if (exp) drawScatterplot(dataGlobal, exp);
};

document.getElementById("submit-now").onclick = () => {
  fetch("/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results: selections, timestamp: new Date().toISOString(), participantCode })
  }).then(() => {
    document.getElementById("status").innerText = "✅ Results saved.";
  });
};

// === E5 FINAL RANKING ===
function showE5() {
  document.getElementById("viz").style.display = "none";
  document.getElementById("task-desc").innerText = TASKS["E5"];
  document.getElementById("next").style.display = "none";
  document.getElementById("reset").style.display = "none";
  const div = document.getElementById("e5-container");
  div.style.display = "block";
  div.innerHTML = "<h3>Rank each projection for every dataset:</h3>";

  const datasets = [...new Set(Object.values(blocks).flat().map(t => t.dataset))];
  datasets.forEach(dataset => {
    const header = document.createElement("h4");
    header.innerText = dataset;
    div.appendChild(header);
    const projections = [...new Set(Object.values(blocks).flat()
      .filter(t => t.dataset === dataset)
      .map(t => t.projection))];
    projections.forEach(proj => {
      const label = document.createElement("label");
      label.innerText = proj + ": ";
      const select = document.createElement("select");
      select.id = `rank-${dataset}-${proj}`;
      for (let i = 1; i <= 10; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.innerText = i;
        select.appendChild(option);
      }
      label.appendChild(select);
      div.appendChild(label);
      div.appendChild(document.createElement("br"));
    });
  });

  const btn = document.createElement("button");
  btn.innerText = "Submit Rankings";
  btn.onclick = () => {
    const pref = {};
    datasets.forEach(dataset => {
      pref[dataset] = {};
      const projections = [...new Set(Object.values(blocks).flat()
        .filter(t => t.dataset === dataset)
        .map(t => t.projection))];
      projections.forEach(proj => {
        const val = document.getElementById(`rank-${dataset}-${proj}`).value;
        pref[dataset][proj] = parseInt(val);
      });
    });
    selections.push({ experiment: "E5", preference: pref });
    fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: selections, timestamp: new Date().toISOString(), participantCode })
    }).then(() => {
      document.getElementById("status").innerText = "✅ Final submission complete.";
    });
  };
  div.appendChild(btn);
}

function loadStudy() {
  fetch("/projections")
    .then(res => res.json())
    .then(data => {
      blockKeys.forEach(key => {
        let trials = [];
        for (const dataset of Object.keys(data)) {
          for (const proj of data[dataset]) {
            trials.push({ dataset, projection: proj, experiment: key });
          }
        }
        trials.sort(() => Math.random() - 0.5);
        blocks[key] = trials;
      });
      showWelcome();
    });
}