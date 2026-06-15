const palette = [
  "#68f3b3", "#ffb84d", "#61a8ff", "#ff668c",
  "#c489ff", "#f5e663", "#51d6e8", "#ff835d"
];

const canvas = document.querySelector("#race");
const ctx = canvas.getContext("2d");
const playButton = document.querySelector("#play");
const resetButton = document.querySelector("#reset");
const timeline = document.querySelector("#timeline");
const speedInput = document.querySelector("#speed");
const speedLabel = document.querySelector("#speed-label");
const fileInput = document.querySelector("#excel-file");
const status = document.querySelector("#status");
const leaderboard = document.querySelector("#leaderboard");
const viewButtons = document.querySelectorAll(".view-button");

let data = loadSavedData() || window.DEFAULT_TOURNAMENT_DATA;
let playhead = 0;
let playing = true;
let previousTime = performance.now();
let secondsPerGame = Number(speedInput.value);
let viewMode = "lanes";
let rankOrderCache = new Map();

function loadSavedData() {
  try {
    return JSON.parse(localStorage.getItem("ludology-race-data"));
  } catch {
    return null;
  }
}

function validateData(candidate) {
  if (!candidate || !Array.isArray(candidate.games) || candidate.games.length === 0) {
    throw new Error("Не найдены названия матчей в строке 2, начиная с колонки D.");
  }
  if (!Array.isArray(candidate.players) || candidate.players.length !== 8) {
    throw new Error("В накопительной таблице должно быть ровно 8 игроков.");
  }
  if (candidate.players.some((player) => player.scores.length !== candidate.games.length)) {
    throw new Error("Количество накопительных результатов не совпадает с количеством матчей.");
  }
  return candidate;
}

function parseWorkbook(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const gameRow = rows[1] || [];
  const games = [];
  for (let col = 3; col < gameRow.length; col += 1) {
    if (gameRow[col] === null || gameRow[col] === "") break;
    games.push(String(gameRow[col]));
  }

  const cumulativeByName = new Map();
  for (let row = 12; row < 20; row += 1) {
    const name = rows[row]?.[1];
    if (!name) continue;
    const scores = games.map((_, index) => Number(rows[row]?.[index + 3] ?? 0));
    cumulativeByName.set(String(name), scores);
  }
  const players = rows.slice(2, 10)
    .map((row) => String(row?.[1] ?? ""))
    .filter(Boolean)
    .map((name) => ({ name, scores: cumulativeByName.get(name) || [] }));
  return validateData({ title: "Ludology WC 2026", games, players });
}

function resetRace(autoplay = false) {
  playhead = 0;
  playing = autoplay;
  playButton.textContent = playing ? "Пауза" : "Старт";
  timeline.max = data.games.length;
  timeline.value = 0;
  updateStatus();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function scoreAt(player, position) {
  if (position <= 0) return 0;
  const leftStage = Math.min(Math.floor(position), player.scores.length);
  const rightStage = Math.min(leftStage + 1, player.scores.length);
  const leftScore = leftStage === 0 ? 0 : player.scores[leftStage - 1];
  const rightScore = rightStage === 0 ? 0 : player.scores[rightStage - 1];
  return leftScore + (rightScore - leftScore) * (position - leftStage);
}

function getLayout(width, height) {
  return {
    left: 54,
    right: Math.max(150, Math.min(235, width * 0.19)),
    top: 72,
    bottom: 64,
    chartWidth: width - 54 - Math.max(150, Math.min(235, width * 0.19)),
    chartHeight: height - 72 - 64
  };
}

function drawCar(x, y, color, index) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,.72)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-15, -7, 30, 14, 5);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#071019";
  ctx.fillRect(-10, -10, 7, 4);
  ctx.fillRect(4, -10, 7, 4);
  ctx.fillRect(-10, 6, 7, 4);
  ctx.fillRect(4, 6, 7, 4);
  ctx.fillStyle = "#f7fbff";
  ctx.font = "900 8px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index + 1), 0, 0);
  ctx.restore();
}

function drawVerticalCar(x, y, color, index) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-8, -17, 16, 34, 6);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#071019";
  ctx.fillRect(-12, -11, 5, 8);
  ctx.fillRect(7, -11, 5, 8);
  ctx.fillRect(-12, 5, 5, 8);
  ctx.fillRect(7, 5, 5, 8);
  ctx.fillStyle = "rgba(247,251,255,.88)";
  ctx.fillRect(-5, -9, 10, 7);
  ctx.fillStyle = "#071019";
  ctx.font = "900 8px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index + 1), 0, 7);
  ctx.restore();
}

function getStandings() {
  return data.players
    .map((player, index) => ({ player, index, score: scoreAt(player, playhead) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function rankOrderAtStage(stage) {
  const boundedStage = Math.max(0, Math.min(stage, data.games.length));
  if (rankOrderCache.has(boundedStage)) return rankOrderCache.get(boundedStage);

  const previousOrder = boundedStage === 0
    ? data.players.map((_, index) => index)
    : rankOrderAtStage(boundedStage - 1);
  const previousRank = new Map(previousOrder.map((index, rank) => [index, rank]));
  const order = data.players
    .map((player, index) => ({
      index,
      score: boundedStage === 0 ? 0 : player.scores[boundedStage - 1]
    }))
    .sort((a, b) => b.score - a.score || previousRank.get(a.index) - previousRank.get(b.index))
    .map((entry) => entry.index);
  rankOrderCache.set(boundedStage, order);
  return order;
}

function lanePositionAt(playerIndex, position) {
  const leftStage = Math.min(Math.floor(position), data.games.length);
  const rightStage = Math.min(leftStage + 1, data.games.length);
  const fraction = position - leftStage;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const leftRank = rankOrderAtStage(leftStage).indexOf(playerIndex);
  const rightRank = rankOrderAtStage(rightStage).indexOf(playerIndex);
  return leftRank + (rightRank - leftRank) * eased;
}

function drawGraph() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const layout = getLayout(width, height);
  const scores = data.players.flatMap((player) => player.scores);
  const maxScore = Math.max(10, ...scores) + 4;
  const gameDenominator = Math.max(1, data.games.length);
  const xFor = (position) => layout.left + (position / gameDenominator) * layout.chartWidth;
  const yFor = (score) => layout.top + layout.chartHeight - (score / maxScore) * layout.chartHeight;

  const gradient = ctx.createLinearGradient(0, layout.top, 0, height);
  gradient.addColorStop(0, "rgba(255,255,255,.045)");
  gradient.addColorStop(1, "rgba(255,255,255,.005)");
  ctx.fillStyle = gradient;
  ctx.fillRect(layout.left, layout.top, layout.chartWidth, layout.chartHeight);

  ctx.font = "700 11px ui-sans-serif, system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let value = 0; value <= maxScore; value += 5) {
    const y = yFor(value);
    ctx.strokeStyle = value % 10 === 0 ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.065)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.left, y);
    ctx.lineTo(layout.left + layout.chartWidth, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(214,222,239,.55)";
    ctx.fillText(String(value), layout.left - 10, y);
  }

  data.games.forEach((game, index) => {
    const stage = index + 1;
    const x = xFor(stage);
    ctx.fillStyle = stage <= playhead ? "rgba(104,243,179,.1)" : "rgba(255,255,255,.018)";
    if (index % 2 === 0) {
      const previousX = xFor(index);
      ctx.fillRect(previousX, layout.top, x - previousX, layout.chartHeight);
    }
    ctx.save();
    ctx.translate(x, layout.top + layout.chartHeight + 14);
    ctx.rotate(-0.55);
    ctx.fillStyle = stage <= playhead ? "rgba(235,241,252,.86)" : "rgba(235,241,252,.35)";
    ctx.font = "750 10px ui-sans-serif, system-ui";
    ctx.textAlign = "right";
    ctx.fillText(game, 0, 0);
    ctx.restore();
  });

  const currentX = xFor(playhead);
  ctx.strokeStyle = "rgba(104,243,179,.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(currentX, layout.top);
  ctx.lineTo(currentX, layout.top + layout.chartHeight);
  ctx.stroke();

  const standings = getStandings();

  data.players.forEach((player, playerIndex) => {
    const color = palette[playerIndex % palette.length];
    const lastWhole = Math.min(Math.floor(playhead), data.games.length);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(xFor(0), yFor(0));
    for (let stage = 1; stage <= lastWhole; stage += 1) {
      ctx.lineTo(xFor(stage), yFor(player.scores[stage - 1]));
    }
    if (playhead > lastWhole && lastWhole < data.games.length) {
      ctx.lineTo(currentX, yFor(scoreAt(player, playhead)));
    }
    ctx.stroke();
  });

  const displayY = new Map();
  const minGap = 25;
  standings.forEach((entry, rank) => {
    let target = yFor(entry.score);
    if (rank > 0) target = Math.max(target, displayY.get(standings[rank - 1].index) + minGap);
    displayY.set(entry.index, target);
  });
  const overflow = Math.max(0, displayY.get(standings.at(-1).index) - (layout.top + layout.chartHeight));
  if (overflow) {
    for (const [key, value] of displayY) displayY.set(key, value - overflow);
  }

  standings.forEach((entry, rank) => {
    const color = palette[entry.index % palette.length];
    const actualY = yFor(entry.score);
    const labelY = displayY.get(entry.index);
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(currentX + 14, actualY);
    ctx.lineTo(layout.left + layout.chartWidth + 18, labelY);
    ctx.stroke();
    drawCar(currentX, actualY, color, entry.index);

    ctx.fillStyle = color;
    ctx.font = "900 12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${rank + 1}. ${entry.player.name}`, layout.left + layout.chartWidth + 25, labelY - 6);
    ctx.fillStyle = "rgba(235,241,252,.72)";
    ctx.font = "800 11px ui-sans-serif, system-ui";
    ctx.fillText(`${Math.round(entry.score * 10) / 10} очков`, layout.left + layout.chartWidth + 25, labelY + 9);
  });

  renderLeaderboard(standings);
}

function drawLaneRace() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const left = 48;
  const right = 22;
  const top = 66;
  const bottom = 92;
  const trackWidth = width - left - right;
  const trackHeight = height - top - bottom;
  const laneWidth = trackWidth / data.players.length;
  const scores = data.players.flatMap((player) => player.scores);
  const maxScore = Math.max(10, ...scores) + 4;
  const yFor = (score) => top + trackHeight - (score / maxScore) * trackHeight;
  const currentStage = Math.min(Math.round(playhead), data.games.length);

  const gradient = ctx.createLinearGradient(0, top, 0, top + trackHeight);
  gradient.addColorStop(0, "rgba(255,255,255,.055)");
  gradient.addColorStop(1, "rgba(255,255,255,.012)");
  ctx.fillStyle = gradient;
  ctx.fillRect(left, top, trackWidth, trackHeight);

  for (let lane = 0; lane < data.players.length; lane += 1) {
    ctx.fillStyle = lane % 2 === 0 ? "rgba(255,255,255,.022)" : "rgba(0,0,0,.06)";
    ctx.fillRect(left + laneWidth * lane, top, laneWidth, trackHeight);
  }

  ctx.font = "700 11px ui-sans-serif, system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let value = 0; value <= maxScore; value += 5) {
    const y = yFor(value);
    ctx.strokeStyle = value % 10 === 0 ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + trackWidth, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(214,222,239,.6)";
    ctx.fillText(String(value), left - 9, y);
  }

  data.players.forEach((player, index) => {
    const color = palette[index % palette.length];
    const laneCenter = left + laneWidth * (lanePositionAt(index, playhead) + 0.5);

    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = Math.max(2, Math.min(5, laneWidth * 0.07));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(laneCenter, yFor(0));
    const lastWhole = Math.min(Math.floor(playhead), data.games.length);
    for (let stage = 1; stage <= lastWhole; stage += 1) {
      ctx.lineTo(laneCenter, yFor(player.scores[stage - 1]));
    }
    if (playhead > lastWhole && lastWhole < data.games.length) {
      ctx.lineTo(laneCenter, yFor(scoreAt(player, playhead)));
    }
    ctx.stroke();

    const score = scoreAt(player, playhead);
    const carY = yFor(score);
    drawVerticalCar(laneCenter, carY, color, index);

    ctx.fillStyle = color;
    ctx.font = `900 ${Math.max(9, Math.min(12, laneWidth * 0.14))}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const shortName = player.name.length > 11 ? `${player.name.slice(0, 10)}…` : player.name;
    ctx.fillText(shortName, laneCenter, top + trackHeight + 20);
    ctx.fillStyle = "rgba(235,241,252,.72)";
    ctx.font = "800 10px ui-sans-serif, system-ui";
    ctx.fillText(`${Math.round(score * 10) / 10} очков`, laneCenter, top + trackHeight + 38);
  });

  for (let lane = 0; lane <= data.players.length; lane += 1) {
    const x = left + laneWidth * lane;
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + trackHeight);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.strokeRect(left, top, trackWidth, trackHeight);
  ctx.fillStyle = "rgba(235,241,252,.5)";
  ctx.font = "750 11px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(currentStage === 0 ? "Старт: 0 очков" : `Этап: ${data.games[currentStage - 1]}`, left, top - 20);
  renderLeaderboard(getStandings());
}

function draw() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  if (viewMode === "lanes") drawLaneRace();
  else drawGraph();
}

function renderLeaderboard(standings) {
  leaderboard.innerHTML = standings.map((entry, rank) => `
    <div class="leader-card">
      <span class="rank">${rank + 1}</span>
      <span class="swatch" style="background:${palette[entry.index % palette.length]}"></span>
      <span class="player-name">${escapeHtml(entry.player.name)}</span>
      <span class="points">${Math.round(entry.score * 10) / 10}</span>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function updateStatus(message) {
  if (message) {
    status.textContent = message;
    return;
  }
  const stage = Math.min(Math.round(playhead), data.games.length);
  status.textContent = stage === 0
    ? "Старт: у всех 0 очков"
    : `Матч ${stage} из ${data.games.length}: ${data.games[stage - 1]}`;
}

function animate(time) {
  const delta = Math.min(0.1, (time - previousTime) / 1000);
  previousTime = time;
  if (playing && data.games.length > 1) {
    playhead += delta / secondsPerGame;
    if (playhead >= data.games.length) {
      playhead = data.games.length;
      playing = false;
      playButton.textContent = "Старт";
    }
    timeline.value = playhead;
    updateStatus();
  }
  draw();
  requestAnimationFrame(animate);
}

playButton.addEventListener("click", () => {
  if (playhead >= data.games.length) playhead = 0;
  playing = !playing;
  playButton.textContent = playing ? "Пауза" : "Старт";
});

resetButton.addEventListener("click", () => resetRace(false));

timeline.addEventListener("input", () => {
  playhead = Number(timeline.value);
  playing = false;
  playButton.textContent = "Старт";
  updateStatus();
});

speedInput.addEventListener("input", () => {
  secondsPerGame = Number(speedInput.value);
  speedLabel.textContent = `${secondsPerGame.toFixed(1)} сек/матч`;
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    viewMode = button.dataset.view;
    viewButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  });
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    updateStatus("Читаю Excel...");
    if (!window.XLSX) throw new Error("Не удалось загрузить модуль чтения Excel. Проверьте подключение к интернету.");
    const bytes = await file.arrayBuffer();
    data = parseWorkbook(XLSX.read(bytes, { type: "array" }));
    rankOrderCache = new Map();
    localStorage.setItem("ludology-race-data", JSON.stringify(data));
    resetRace(true);
    updateStatus(`Загружено: ${data.games.length} матчей, ${data.players.length} игроков`);
  } catch (error) {
    updateStatus(error.message);
  } finally {
    fileInput.value = "";
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetRace(true);
requestAnimationFrame(animate);
