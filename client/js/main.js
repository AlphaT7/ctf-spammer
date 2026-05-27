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
const spriteSourceSize = vec2(40, 40);
const spriteRenderSize = vec2(40, 40);
const canvasSize = vec2(375, 630);
const LONG_CLICK_MS = 300;
const LONG_CLICK_MOVE_TOLERANCE = 8;
LJS.setShowSplashScreen(false);
LJS.setDebugWatermark(false);
LJS.setCanvasFixedSize(canvasSize);

let spriteTexture;
let sprites = [];
let connectionReady = false;
let latestGameState = null;
let gameLive = false;
let currentPlayerId = null;
let pressStartTimeMs = null;
let pressStartPosition = null;
let longClickHandled = false;
const unitSpriteMap = {
  playerFlag: vec2(0, 80),
  enemyFlag: vec2(40, 80),
  playerFlagDefender: vec2(40, 0),
  enemyFlagDefender: vec2(0, 40),
  playerFlagSeeker: vec2(40, 40),
  enemyFlagSeeker: vec2(0, 0),
};

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
    super(unitSpriteMap.playerFlag, renderPos);
  }
}

class EnemyFlagSprite extends BaseSprite {
  constructor(renderPos) {
    super(unitSpriteMap.enemyFlag, renderPos);
  }
}

class PlayerFlagDefenderSprite extends BaseSprite {
  constructor(renderPos) {
    super(unitSpriteMap.playerFlagDefender, renderPos);
  }
}

class EnemyFlagDefenderSprite extends BaseSprite {
  constructor(renderPos) {
    super(unitSpriteMap.enemyFlagDefender, renderPos);
  }
}

class PlayerFlagSeekerSprite extends BaseSprite {
  constructor(renderPos) {
    super(unitSpriteMap.playerFlagSeeker, renderPos);
  }
}

class EnemyFlagSeekerSprite extends BaseSprite {
  constructor(renderPos) {
    super(unitSpriteMap.enemyFlagSeeker, renderPos);
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

function createPlacedUnitSprite(defender) {
  const position = vec2(defender.position.x, defender.position.y);
  const isOwnedByCurrentPlayer =
    currentPlayerId !== null && defender.ownerId === currentPlayerId;
  const isFlagSeeker = defender.unitType === "flagSeeker";

  let sprite;

  if (isFlagSeeker) {
    sprite = isOwnedByCurrentPlayer
      ? new PlayerFlagSeekerSprite(position)
      : new EnemyFlagSeekerSprite(position);
  } else {
    sprite = isOwnedByCurrentPlayer
      ? new PlayerFlagDefenderSprite(position)
      : new EnemyFlagDefenderSprite(position);
  }

  sprite.createTileInfo(spriteTexture);
  return sprite;
}

function clearPressState() {
  pressStartTimeMs = null;
  pressStartPosition = null;
  longClickHandled = false;
}

function distanceSquared(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  return dx * dx + dy * dy;
}

function longClick() {
  if (
    pressStartTimeMs === null ||
    pressStartPosition === null ||
    longClickHandled ||
    !LJS.mouseIsDown(0)
  ) {
    return null;
  }

  const elapsedMs = performance.now() - pressStartTimeMs;
  const movedDistanceSquared = distanceSquared(
    pressStartPosition,
    LJS.mousePosScreen,
  );
  const moveToleranceSquared =
    LONG_CLICK_MOVE_TOLERANCE * LONG_CLICK_MOVE_TOLERANCE;

  if (movedDistanceSquared > moveToleranceSquared) {
    clearPressState();
    return null;
  }

  if (elapsedMs < LONG_CLICK_MS) {
    return null;
  }

  longClickHandled = true;
  return {
    x: pressStartPosition.x,
    y: pressStartPosition.y,
  };
}

function emitUnitPlacement(unitType, position) {
  channel.emit("place-defender", {
    unitType,
    position: {
      x: position.x,
      y: position.y,
    },
  });
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
    createPlacedUnitSprite(defender),
  );

  sprites = [...defenderSprites, ...flagSprites];
}

channel.on("game-state", (state) => {
  syncGameState(state);
});

channel.on("game-joined", (payload) => {
  currentPlayerId = payload.playerId ?? currentPlayerId;
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
    clearPressState();
    return;
  }

  if (LJS.mouseWasPressed(0)) {
    pressStartTimeMs = performance.now();
    pressStartPosition = {
      x: LJS.mousePosScreen.x,
      y: LJS.mousePosScreen.y,
    };
    longClickHandled = false;
  }

  const longClickPosition = longClick();
  if (longClickPosition) {
    emitUnitPlacement("flagSeeker", longClickPosition);
  }

  if (LJS.mouseWasReleased(0)) {
    if (!longClickHandled && pressStartPosition) {
      emitUnitPlacement("defender", {
        x: LJS.mousePosScreen.x,
        y: LJS.mousePosScreen.y,
      });
    }

    clearPressState();
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
