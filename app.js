const palette = [
  "#68f3b3", "#ffb84d", "#61a8ff", "#ff668c",
  "#c489ff", "#f5e663", "#51d6e8", "#ff835d"
];

const countryFlags = {
  MEX: "🇲🇽", RSA: "🇿🇦", KOR: "🇰🇷", CZE: "🇨🇿",
  CAN: "🇨🇦", BOS: "🇧🇦", USA: "🇺🇸", PAR: "🇵🇾",
  QAT: "🇶🇦", SUI: "🇨🇭",
  HAI: "🇭🇹",
  SCO: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  ENG: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  AUS: "🇦🇺", TUR: "🇹🇷",
  BRA: "🇧🇷", MOR: "🇲🇦", CIV: "🇨🇮", ECU: "🇪🇨",
  GER: "🇩🇪", CUR: "🇨🇼", NED: "🇳🇱", JAP: "🇯🇵",
  SWE: "🇸🇪", TUN: "🇹🇳", ESP: "🇪🇸", CPV: "🇨🇻",
  BEL: "🇧🇪", EGY: "🇪🇬", KSA: "🇸🇦", URU: "🇺🇾",
  IRI: "🇮🇷", NZE: "🇳🇿", FRA: "🇫🇷", SEN: "🇸🇳",
  IRQ: "🇮🇶", NOR: "🇳🇴", ARG: "🇦🇷", ALG: "🇩🇿",
  AUT: "🇦🇹", JOR: "🇯🇴", POR: "🇵🇹", COD: "🇨🇩",
  GHA: "🇬🇭", PAN: "🇵🇦", UZB: "🇺🇿", COL: "🇨🇴",
  CRO: "🇭🇷"
};

const canvas = document.querySelector("#race");
const ctx = canvas.getContext("2d");
const playButton = document.querySelector("#play");
const resetButton = document.querySelector("#reset");
const timeline = document.querySelector("#timeline");
const speedInput = document.querySelector("#speed");
const speedLabel = document.querySelector("#speed-label");
const graphWindowControls = document.querySelector("#graph-window-controls");
const graphWindowInput = document.querySelector("#graph-window");
const graphWindowLabel = document.querySelector("#graph-window-label");
const status = document.querySelector("#status");
const leaderboard = document.querySelector("#leaderboard");
const viewButtons = document.querySelectorAll(".view-button");

const data = window.DEFAULT_TOURNAMENT_DATA;
if (!data?.games?.length || !data?.players?.length) {
  throw new Error("Встроенные данные турнира не загрузились. Обновите страницу.");
}
let playhead = 0;
let playing = true;
let previousTime = performance.now();
let secondsPerGame = Number(speedInput.value);
let viewMode = "lanes";
let rankOrderCache = new Map();
let highlightedPlayerIndex = null;
let graphLabelHitboxes = [];
const visibleGraphMatches = 24;
let graphWindowStart = 0;
let userAdjustedGraphWindow = false;

function resetRace(autoplay = false) {
  playhead = 0;
  playing = autoplay;
  playButton.textContent = playing ? "Пауза" : "Старт";
  timeline.max = data.games.length;
  timeline.value = 0;
  graphWindowStart = 0;
  userAdjustedGraphWindow = false;
  syncGraphWindowControls();
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

function formatGame(game) {
  const codes = String(game).toUpperCase().split("-");
  if (codes.length !== 2) return game;
  return codes.map((code) => countryFlags[code] || code).join(" – ");
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

function clampGraphWindowStart(value) {
  return Math.max(0, Math.min(Math.round(value), Math.max(0, data.games.length - visibleGraphMatches)));
}

function ensurePlayheadInGraphWindow() {
  if (viewMode !== "graph" || userAdjustedGraphWindow || data.games.length <= visibleGraphMatches) return;
  const rightEdge = graphWindowStart + visibleGraphMatches;
  if (playhead > rightEdge) {
    graphWindowStart = clampGraphWindowStart(Math.ceil(playhead - visibleGraphMatches));
  } else if (playhead < graphWindowStart) {
    graphWindowStart = clampGraphWindowStart(Math.floor(playhead));
  }
  syncGraphWindowControls();
}

function syncGraphWindowControls() {
  const maxStart = Math.max(0, data.games.length - visibleGraphMatches);
  graphWindowInput.max = String(maxStart);
  graphWindowInput.value = String(clampGraphWindowStart(graphWindowStart));
  graphWindowControls.classList.toggle("visible", viewMode === "graph" && data.games.length > visibleGraphMatches);
  const startMatch = graphWindowStart + 1;
  const endMatch = Math.min(data.games.length, graphWindowStart + visibleGraphMatches);
  graphWindowLabel.textContent = `Матчи ${startMatch}–${endMatch} из ${data.games.length}`;
}

function traceGraphLine(player, xFor, yFor, currentX, windowStart, windowEnd) {
  const lastWhole = Math.min(Math.floor(playhead), windowEnd);
  ctx.beginPath();
  ctx.moveTo(xFor(windowStart), yFor(scoreAt(player, windowStart)));
  for (let stage = windowStart + 1; stage <= lastWhole; stage += 1) {
    ctx.lineTo(xFor(stage), yFor(player.scores[stage - 1]));
  }
  if (playhead > lastWhole && playhead < windowEnd) {
    ctx.lineTo(currentX, yFor(scoreAt(player, playhead)));
  }
}

function drawGraphLine(playerIndex, xFor, yFor, currentX, windowStart, windowEnd, emphasis = false) {
  const player = data.players[playerIndex];
  const color = palette[playerIndex % palette.length];
  ctx.save();
  ctx.strokeStyle = emphasis ? color : `${color}${highlightedPlayerIndex === null ? "" : "55"}`;
  ctx.lineWidth = emphasis ? 5 : 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (emphasis) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
  }
  traceGraphLine(player, xFor, yFor, currentX, windowStart, windowEnd);
  ctx.stroke();
  ctx.restore();
}

function drawGraph() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const layout = getLayout(width, height);
  const scores = data.players.flatMap((player) => player.scores);
  const maxScore = Math.max(10, ...scores) + 4;
  const windowStart = data.games.length > visibleGraphMatches ? clampGraphWindowStart(graphWindowStart) : 0;
  const windowEnd = Math.min(data.games.length, windowStart + visibleGraphMatches);
  const gameDenominator = Math.max(1, windowEnd - windowStart);
  const xFor = (position) => layout.left + ((position - windowStart) / gameDenominator) * layout.chartWidth;
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
    if (stage < windowStart + 1 || stage > windowEnd) return;
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
    ctx.font = '750 14px "Apple Color Emoji", "Segoe UI Emoji", ui-sans-serif, system-ui';
    ctx.textAlign = "right";
    ctx.fillText(formatGame(game), 0, 0);
    ctx.restore();
  });

  const playheadInWindow = playhead >= windowStart && playhead <= windowEnd;
  const currentX = xFor(Math.max(windowStart, Math.min(playhead, windowEnd)));
  if (playheadInWindow) {
    ctx.strokeStyle = "rgba(104,243,179,.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(currentX, layout.top);
    ctx.lineTo(currentX, layout.top + layout.chartHeight);
    ctx.stroke();
  }

  const standings = getStandings();

  data.players.forEach((player, playerIndex) => {
    if (playerIndex !== highlightedPlayerIndex) {
      drawGraphLine(playerIndex, xFor, yFor, currentX, windowStart, windowEnd);
    }
  });

  if (highlightedPlayerIndex !== null) {
    drawGraphLine(highlightedPlayerIndex, xFor, yFor, currentX, windowStart, windowEnd, true);
  }

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

  graphLabelHitboxes = [];
  standings.forEach((entry, rank) => {
    const color = palette[entry.index % palette.length];
    const actualY = yFor(entry.score);
    const labelY = displayY.get(entry.index);
    const isHighlighted = entry.index === highlightedPlayerIndex;
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = isHighlighted ? 2 : 1;
    ctx.beginPath();
    const connectorX = playheadInWindow ? currentX : layout.left + layout.chartWidth;
    ctx.moveTo(connectorX + 14, actualY);
    ctx.lineTo(layout.left + layout.chartWidth + 18, labelY);
    ctx.stroke();
    if (entry.index !== highlightedPlayerIndex) {
      drawCar(connectorX, actualY, color, entry.index);
    }

    ctx.fillStyle = color;
    ctx.font = `${isHighlighted ? "1000" : "900"} ${isHighlighted ? 14 : 12}px ui-sans-serif, system-ui`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const labelX = layout.left + layout.chartWidth + 25;
    ctx.fillText(`${rank + 1}. ${entry.player.name}`, labelX, labelY - 6);
    ctx.fillStyle = "rgba(235,241,252,.72)";
    ctx.font = "800 11px ui-sans-serif, system-ui";
    ctx.fillText(`${Math.round(entry.score * 10) / 10} очков`, labelX, labelY + 9);
    graphLabelHitboxes.push({
      index: entry.index,
      x: labelX - 6,
      y: labelY - 18,
      width: Math.max(120, ctx.measureText(entry.player.name).width + 48),
      height: 34
    });
  });

  if (highlightedPlayerIndex !== null) {
    const entry = standings.find((candidate) => candidate.index === highlightedPlayerIndex);
    if (entry) drawCar(playheadInWindow ? currentX : layout.left + layout.chartWidth, yFor(entry.score), palette[entry.index % palette.length], entry.index);
  }

  renderLeaderboard(standings);
}

function drawLaneRace() {
  graphLabelHitboxes = [];
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const left = 48;
  const right = 22;
  const top = 66;
  const bottom = 92;
  const trackWidth = width - left - right;
  const trackHeight = height - top - bottom;
  const laneWidth = trackWidth / data.players.length;
  const currentMaxScore = Math.max(10, ...data.players.map((player) => scoreAt(player, playhead)));
  const maxScore = currentMaxScore + Math.max(4, Math.ceil(currentMaxScore * 0.12));
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
  ctx.font = '750 11px "Apple Color Emoji", "Segoe UI Emoji", ui-sans-serif, system-ui';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(currentStage === 0 ? "Старт: 0 очков" : `Этап: ${formatGame(data.games[currentStage - 1])}`, left, top - 20);
  renderLeaderboard(getStandings());
}

function draw() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  if (viewMode === "lanes") drawLaneRace();
  else drawGraph();
}

function setHighlightedPlayer(index) {
  highlightedPlayerIndex = index;
}

function renderLeaderboard(standings) {
  leaderboard.innerHTML = standings.map((entry, rank) => `
    <div class="leader-card ${entry.index === highlightedPlayerIndex ? "active" : ""}" data-player-index="${entry.index}">
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
    : `Матч ${stage} из ${data.games.length}: ${formatGame(data.games[stage - 1])}`;
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
    ensurePlayheadInGraphWindow();
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
  ensurePlayheadInGraphWindow();
  updateStatus();
});

speedInput.addEventListener("input", () => {
  secondsPerGame = Number(speedInput.value);
  speedLabel.textContent = `${secondsPerGame.toFixed(1)} сек/матч`;
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    viewMode = button.dataset.view;
    highlightedPlayerIndex = null;
    userAdjustedGraphWindow = false;
    ensurePlayheadInGraphWindow();
    syncGraphWindowControls();
    viewButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  });
});

canvas.addEventListener("mousemove", (event) => {
  if (viewMode !== "graph") return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = graphLabelHitboxes.find((box) =>
    x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
  );
  setHighlightedPlayer(hit ? hit.index : null);
  canvas.style.cursor = hit ? "pointer" : "default";
});

canvas.addEventListener("mouseleave", () => {
  setHighlightedPlayer(null);
  canvas.style.cursor = "default";
});

leaderboard.addEventListener("mousemove", (event) => {
  const card = event.target.closest("[data-player-index]");
  setHighlightedPlayer(card ? Number(card.dataset.playerIndex) : null);
});

leaderboard.addEventListener("mouseleave", () => {
  setHighlightedPlayer(null);
});

graphWindowInput.addEventListener("input", () => {
  graphWindowStart = clampGraphWindowStart(Number(graphWindowInput.value));
  userAdjustedGraphWindow = true;
  syncGraphWindowControls();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetRace(true);
requestAnimationFrame(animate);
