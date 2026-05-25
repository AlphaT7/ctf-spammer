"use strict";

import geckos from "@geckos.io/client";

const newGameButton = document.getElementById("btn-new-game");
const joinGameButton = document.getElementById("btn-join-small");
const gameListElement = document.getElementById("game-list");
const connectionStatusElement = document.getElementById("connection-status");

const serverUrl = import.meta.env.VITE_SERVER_URL;
const serverPort = Number(import.meta.env.VITE_SERVER_PORT ?? 3000);
const serverTarget = serverUrl
  ? `${serverUrl}:${serverPort}`
  : `${window.location.protocol}//${window.location.hostname}:${serverPort}`;
const geckosOptions = serverUrl
  ? { url: serverUrl, port: serverPort }
  : { port: serverPort };

const channel = geckos(geckosOptions);
const games = [];
let isNavigatingToGame = false;
let isConnected = false;

function setStatus(text, colorVar) {
  connectionStatusElement.textContent = text;
  connectionStatusElement.style.color = `var(${colorVar})`;
}

function setLobbyActionsEnabled(enabled) {
  newGameButton.disabled = !enabled;
  joinGameButton.disabled = !enabled;
}

function openGame(gameId) {
  isNavigatingToGame = true;
  channel.close();
  window.location.href = `./game.html?id=${encodeURIComponent(gameId)}`;
}

function renderGames() {
  gameListElement.innerHTML = "";

  if (games.length === 0) {
    gameListElement.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◈</span>
        <span>No games detected</span>
      </div>
    `;
    return;
  }

  for (const game of games) {
    const gameItem = document.createElement("div");
    gameItem.className = "game-item";
    gameItem.dataset.gameId = game.id;
    gameItem.innerHTML = `
      <label class="game-radio">
        <input type="radio" name="selected-game" value="${game.id}" />
        <span class="radio-dot"></span>
      </label>
      <div class="game-info">
        <div class="game-name">${game.name}</div>
        <div class="game-meta">host: ${game.host}</div>
      </div>
      <div class="game-players">${game.players}/${game.maxPlayers}</div>
    `;

    gameItem.addEventListener("click", (event) => {
      if (event.target.tagName !== "INPUT") {
        gameItem.querySelector("input").checked = true;
      }
    });

    gameListElement.appendChild(gameItem);
  }
}

channel.onConnect((error) => {
  if (error) {
    isConnected = false;
    setLobbyActionsEnabled(false);
    setStatus("SERVER OFFLINE", "--accent-red");
    console.error(`Unable to reach game server at ${serverTarget}`, error);
    return;
  }

  isConnected = true;
  setLobbyActionsEnabled(true);
  setStatus("SERVER CONNECTION ESTABLISHED", "--accent-green");
  channel.emit("request-game-list");
});

channel.onDisconnect(() => {
  isConnected = false;
  setLobbyActionsEnabled(false);

  if (!isNavigatingToGame) {
    setStatus("DISCONNECTED", "--accent-red");
  }
});

channel.on("game-list", (list) => {
  games.length = 0;
  games.push(...list);
  renderGames();
});

channel.on("game-created", (payload) => {
  openGame(payload.id);
});

channel.on("game-joined", (payload) => {
  openGame(payload.id);
});

channel.on("join-error", (payload) => {
  setStatus(`ERROR: ${payload.message}`, "--accent-red");
});

newGameButton.addEventListener("click", () => {
  if (!isConnected) {
    setStatus("START SERVER: PORT 3000", "--accent-red");
    return;
  }

  setStatus("CREATING GAME...", "--accent-cyan");
  channel.emit("new-game");
});

joinGameButton.addEventListener("click", () => {
  if (!isConnected) {
    setStatus("START SERVER: PORT 3000", "--accent-red");
    return;
  }

  const selectedGame = document.querySelector(
    'input[name="selected-game"]:checked',
  );

  if (!selectedGame) {
    setStatus("SELECT A GAME", "--accent-red");
    return;
  }

  setStatus("JOINING...", "--accent-cyan");
  channel.emit("join-game", { gameId: selectedGame.value });
});

window.addEventListener("beforeunload", () => {
  channel.close();
});

setLobbyActionsEnabled(false);
renderGames();
