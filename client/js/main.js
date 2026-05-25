"use strict";

import geckos from "@geckos.io/client";
import * as LJS from "littlejsengine";

const { rgb, vec2 } = LJS;

const gameId = new URLSearchParams(window.location.search).get("id");
const hudPlayers = document.getElementById("hud-players");
const hudScore = document.getElementById("hud-score");
const overlayContent = document.getElementById("overlay-content");
const gameRoot = document.getElementById("game-root");

if (!gameId) {
  document.body.innerHTML =
    '<p style="color:#ef4444;padding:2rem">Missing game id</p>';
  throw new Error("Missing game id");
}

const serverUrl = import.meta.env.VITE_SERVER_URL;
const serverPort = Number(import.meta.env.VITE_SERVER_PORT ?? 3000);
const serverTarget = serverUrl
  ? `${serverUrl}:${serverPort}`
  : `${window.location.protocol}//${window.location.hostname}:${serverPort}`;
const geckosOptions = serverUrl
  ? { url: serverUrl, port: serverPort }
  : { port: serverPort };

const channel = geckos(geckosOptions);
const unitSpriteUrl = new URL("../images/units.sprite.png", import.meta.url)
  .href;
const spriteSourceSize = vec2(41, 41);
const spriteRenderSize = vec2(41, 41);
const canvasSize = vec2(375, 630);
LJS.setCanvasFixedSize(canvasSize);

let spriteTexture;
let sprites = [];
let connectionReady = false;
let latestGameState = null;
let gameLive = false;

class BaseSprite {
  constructor(sourcePos, renderPos) {
    this.sourcePos = sourcePos;
    this.sourceSize = spriteSourceSize;
    this.renderSize = spriteRenderSize;
    this.renderPos = renderPos;
    this.tileInfo = null;
  }

  createTileInfo(textureInfo) {
    this.tileInfo = new LJS.TileInfo(
      this.sourcePos,
      this.sourceSize,
      textureInfo,
    );
  }

  render() {
    LJS.drawTile(
      this.renderPos,
      this.renderSize,
      this.tileInfo,
      undefined,
      0,
      false,
      undefined,
      undefined,
      true,
    );
  }
}

class PlayerFlagSprite extends BaseSprite {
  constructor(renderPos) {
    super(vec2(0, 82), renderPos);
  }
}

class EnemyFlagSprite extends BaseSprite {
  constructor(renderPos) {
    super(vec2(41, 82), renderPos);
  }
}

class PlayerFlagDefenderSprite extends BaseSprite {
  constructor(renderPos) {
    super(vec2(41, 41), renderPos);
  }
}

function setOverlayMessage(message) {
  overlayContent.textContent = message;
}

function getOverlayMessage(state) {
  if (!state) {
    return "Connecting to match...";
  }

  if (state.phase === "waiting") {
    return "Waiting for both players...";
  }

  if (state.phase === "countdown") {
    const seconds = Number.isFinite(state.countdownRemaining)
      ? state.countdownRemaining
      : 0;
    return `Match starts in ${seconds}s`;
  }

  if (state.phase === "live") {
    return "";
  }

  return "Preparing match...";
}

function createDefenderSprite(position) {
  const sprite = new PlayerFlagDefenderSprite(vec2(position.x, position.y));
  sprite.createTileInfo(spriteTexture);
  return sprite;
}

function createFlagSprites() {
  const halfFlagHeight = spriteRenderSize.y / 2;
  const topCenter = vec2(canvasSize.x / 2, halfFlagHeight + 5);
  const bottomCenter = vec2(
    canvasSize.x / 2,
    canvasSize.y - halfFlagHeight - 5,
  );

  const playerFlag = new PlayerFlagSprite(bottomCenter);
  const enemyFlag = new EnemyFlagSprite(topCenter);

  playerFlag.createTileInfo(spriteTexture);
  enemyFlag.createTileInfo(spriteTexture);

  return [enemyFlag, playerFlag];
}

function syncGameState(state) {
  latestGameState = state;
  hudPlayers.textContent = String(state.players).padStart(2, "0");
  hudScore.textContent = String(state.defenders.length).padStart(4, "0");
  gameLive = state.phase === "live";

  if (connectionReady) {
    setOverlayMessage(getOverlayMessage(state));
  }

  if (!spriteTexture) {
    return;
  }

  const flagSprites = gameLive ? createFlagSprites() : [];
  const defenderSprites = state.defenders.map((defender) =>
    createDefenderSprite(defender.position),
  );

  sprites = [...defenderSprites, ...flagSprites];
}

channel.on("game-state", (state) => {
  syncGameState(state);
});

channel.on("game-joined", (payload) => {
  syncGameState(payload.game.state);
});

channel.on("join-error", (payload) => {
  setOverlayMessage(payload.message);
});

channel.on("game-error", (payload) => {
  setOverlayMessage(payload.message);
});

channel.onDisconnect(() => {
  connectionReady = false;
  setOverlayMessage("Disconnected from server");
});

channel.onConnect((error) => {
  if (error) {
    setOverlayMessage(`Unable to connect to game server at ${serverTarget}`);
    console.error(`Unable to reach game server at ${serverTarget}`, error);
    return;
  }

  connectionReady = true;
  setOverlayMessage("Connecting to match...");
  channel.emit("join-game-instance", {
    gameId,
    playerName: "Dev Player",
  });
});

function gameInit() {
  LJS.setCanvasClearColor(rgb(0, 0, 0, 0));
  LJS.setCanvasPixelated(true);
  LJS.setTilesPixelated(true);
  LJS.setShowSplashScreen(false);
  gameRoot.style.background = "transparent";

  for (const canvas of gameRoot.querySelectorAll("canvas")) {
    canvas.style.background = "transparent";
  }

  spriteTexture = LJS.textureInfos[0];
  sprites = [];

  if (latestGameState) {
    syncGameState(latestGameState);
  }
}

function gameUpdate() {
  if (!connectionReady || !gameLive) {
    return;
  }

  if (LJS.mouseWasReleased(0)) {
    channel.emit("place-defender", {
      position: {
        x: LJS.mousePosScreen.x,
        y: LJS.mousePosScreen.y,
      },
    });
  }
}

function gameUpdatePost() {}

function gameRender() {
  for (const sprite of sprites) {
    sprite.render();
  }
}

function gameRenderPost() {}

LJS.engineInit(
  gameInit,
  gameUpdate,
  gameUpdatePost,
  gameRender,
  gameRenderPost,
  [unitSpriteUrl],
  gameRoot,
);
