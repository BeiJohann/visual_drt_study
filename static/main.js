let trials = [];
let currentIndex = 0;
let selections = [];
let selectedIndices = [];
let dataGlobal = null;
let currentLassoColorIndex = 0;

const COLORS = d3.schemeCategory10;
const TASKS = {
  E1: "T1: Select all visually separate clusters using lasso. You may select multiple clusters.",
  E2: "T2: Select the cluster containing the red-highlighted point.",
  E3: "T3: Select the cluster closest to the red-highlighted cluster.",
  E4: "T4: Select the densest cluster.",
  E5: "T5: Distribute 10 points among all projections based on preference."
};

fetch("/projections").then(res => res.json()).then(data => {
  for (const dataset of Object.keys(data)) {
    for (const proj of data[dataset]) {
      ["E1", "E2", "E3", "E4"].forEach(exp => {
        trials.push({ dataset, projection: proj, experiment: exp });
      });
    }
  }
  trials.sort((a, b) => a.experiment.localeCompare(b.experiment));
  loadTrial(currentIndex);
});

function loadTrial(index) {
  const trial = trials[index];
  if (!trial) return showE5();

  document.getElementById("task-desc").innerText = TASKS[trial.experiment];
  document.getElementById("progress-counter").innerText =
    `Experiment ${trial.experiment} | Trial ${index + 1} of ${trials.length}`;
  currentLassoColorIndex = 0;

  fetch(`/data/${trial.dataset}/${trial.projection}`)
    .then(res => res.json())
    .then(data => {
      dataGlobal = data;
      drawScatterplot(data, trial.experiment);
    });
}

function drawScatterplot(data, experiment) {
  selectedIndices = [];
  const svg = d3.select("#viz");
  svg.selectAll("*").remove();

  const width = +svg.attr("width");
  const height = +svg.attr("height");

  const x = d3.scaleLinear().domain(d3.extent(data.X, d => d[0])).range([40, width - 40]);
  const y = d3.scaleLinear().domain(d3.extent(data.X, d => d[1])).range([height - 40, 40]);

  const points = data.X.map((d, i) => ({
    x: x(d[0]),
    y: y(d[1]),
    label: data.y[i],
    index: i
  }));

  let highlightIndex = Math.floor(Math.random() * points.length);
  let targetLabel = points[highlightIndex].label;

  const circles = svg.selectAll("circle")
    .data(points)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 3.5)
    .attr("fill", d => {
      if (experiment === "E1" || experiment === "E4") return "grey";
      if (experiment === "E2") return d.index === highlightIndex ? "red" : "grey";
      if (experiment === "E3") return d.label === targetLabel ? "red" : "grey";
      return COLORS[d.label % 10];
    })
    .attr("fill-opacity", 0.6)
    .attr("stroke", "none");

  let lassoPath = svg.append("path").attr("fill", "rgba(0,0,255,0.1)").attr("stroke", "blue")
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
      const p = [points[i].x, points[i].y];
      if (d3.polygonContains(lassoPolygon, p)) {
        selection.push(points[i].index);
      }
    }

    if (experiment === "E1") {
      currentLassoColorIndex++;
      selectedIndices.push(selection);
      selection.forEach(idx => {
        d3.select(circles.nodes()[idx])
          .attr("stroke", color)
          .attr("stroke-width", 2);
      });
    } else {
      selectedIndices = [selection]; // override any previous
      svg.selectAll("circle").attr("stroke", null).attr("stroke-width", null);
      selection.forEach(idx => {
        d3.select(circles.nodes()[idx])
          .attr("stroke", "black")
          .attr("stroke-width", 2);
      });
    }

    lassoPath.attr("visibility", "hidden");
  });
}

document.getElementById("reset").onclick = () => {
  drawScatterplot(dataGlobal, trials[currentIndex].experiment);
};

document.getElementById("next").onclick = () => {
  const trial = trials[currentIndex];
  selections.push({
    experiment: trial.experiment,
    dataset: trial.dataset,
    projection: trial.projection,
    selected: selectedIndices
  });
  currentIndex++;
  loadTrial(currentIndex);
};

document.getElementById("submit-now").onclick = () => {
  fetch("/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results: selections, timestamp: new Date().toISOString() })
  }).then(() => {
    document.getElementById("status").innerText = "✅ Results saved.";
  });
};

function showE5() {
  document.getElementById("viz").style.display = "none";
  document.getElementById("task-desc").innerText = TASKS["E5"];
  document.getElementById("next").style.display = "none";
  document.getElementById("reset").style.display = "none";

  const div = document.getElementById("e5-container");
  div.style.display = "block";
  div.innerHTML = "<h3>Distribute 10 Points</h3>";

  const projections = [...new Set(trials.map(t => t.projection))];
  const inputs = projections.map(proj => {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "10";
    input.value = "0";
    input.id = `rank-${proj}`;
    const label = document.createElement("label");
    label.innerText = proj;
    label.appendChild(input);
    div.appendChild(label);
    div.appendChild(document.createElement("br"));
    return input;
  });

  const btn = document.createElement("button");
  btn.innerText = "Submit Preferences";
  btn.onclick = () => {
    const pref = {};
    inputs.forEach(input => {
      pref[input.id.replace("rank-", "")] = parseInt(input.value || 0);
    });
    selections.push({ experiment: "E5", preference: pref });
    fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: selections, timestamp: new Date().toISOString() })
    }).then(() => {
      document.getElementById("status").innerText = "✅ Final submission complete.";
    });
  };
  div.appendChild(btn);
}