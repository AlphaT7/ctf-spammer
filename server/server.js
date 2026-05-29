import Fastify from "fastify";
import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
import { geckos, iceServers } from "@geckos.io/server";
import http from "http";
import PF from "pathfinding";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COUNTDOWN_NONE,
  CARRYING_FLAG_NO,
  CARRYING_FLAG_YES,
  ENTITY_KIND_DEFENDER,
  ENTITY_KIND_MATCH,
  FLAG_DROPPED_NO,
  FLAG_DROPPED_YES,
  FLAG_STATE_AT_BASE,
  FLAG_STATE_EMPTY,
  FLAG_SEEKER_SPEED,
  MATCH_ENTITY_ID,
  PATH_GRID_CELL_SIZE,
  PLAYER_SLOT_GUEST,
  PLAYER_SLOT_HOST,
  PLAYER_SLOT_NONE,
  SNAPSHOT_SERVER_FPS,
  UNIT_TYPE_NONE,
  UNIT_SPRITE_SIZE,
  encodeCountdown,
  encodePhase,
  encodeUnitType,
  gameSnapshotModel,
  getGuestFlagPosition,
  getHostFlagPosition,
} from "../shared/game-snapshot.js";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";
const DEFAULT_MAX_PLAYERS = 2;
const MAX_MAX_PLAYERS = 2;
const MIN_PLAYERS_TO_START = 2;
const PRE_GAME_COUNTDOWN_SECONDS = 3;
const MAX_UNITS_PER_PLAYER = 10;
const DEFENDER_CHASE_SPEED = 150;
const DEFENDER_COLLISION_DISTANCE = UNIT_SPRITE_SIZE / 2;
const SNAPSHOT_INTERVAL_MS = Math.max(
  1,
  Math.floor(1000 / SNAPSHOT_SERVER_FPS),
);
const PATH_GRID_COLUMNS = Math.ceil(ARENA_WIDTH / PATH_GRID_CELL_SIZE);
const PATH_GRID_ROWS = Math.ceil(ARENA_HEIGHT / PATH_GRID_CELL_SIZE);
const pathFinder = new PF.AStarFinder({
  allowDiagonal: true,
  dontCrossCorners: true,
  heuristic: PF.Heuristic.octile,
});

const server = http.createServer();
const snapshotInterpolation = new SnapshotInterpolation();

const app = Fastify({
  logger: true,
  serverFactory: (handler) => {
    server.on("request", handler);
    return server;
  },
});

const io = geckos({
  iceServers,
  cors: {
    origin: CLIENT_ORIGIN,
  },
});

io.addServer(server);

const games = new Map();
let nextGameNumber = 1;

function now() {
  return new Date().toISOString();
}

function setCorsHeaders(reply) {
  reply.header("Access-Control-Allow-Origin", CLIENT_ORIGIN);
  reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
}

app.addHook("onRequest", async (request, reply) => {
  setCorsHeaders(reply);

  if (request.method === "OPTIONS") {
    reply.code(204).send();
    return reply;
  }

  return undefined;
});

function normalizeString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizePayload(payload) {
  return payload && typeof payload === "object" ? payload : {};
}

function normalizeMaxPlayers(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_PLAYERS;
  }

  return Math.min(parsed, MAX_MAX_PLAYERS);
}

function createGameId() {
  let id = "";

  do {
    id = "GAME-" + Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (games.has(id));

  return id;
}

function createGameState() {
  return {
    defenders: [],
    hostFlagAtBase: true,
    guestFlagAtBase: true,
    hostDroppedFlagPosition: null,
    guestDroppedFlagPosition: null,
    phase: "waiting",
    countdownRemaining: null,
    updatedAt: now(),
  };
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    joinedAt: player.joinedAt,
  };
}

function serializeGameListItem(game) {
  return {
    id: game.id,
    name: game.name,
    host: game.host,
    hostPlayerId: game.hostPlayerId,
    players: game.players.size,
    maxPlayers: game.maxPlayers,
    phase: game.state.phase,
    countdownRemaining: game.state.countdownRemaining,
    createdAt: game.createdAt,
  };
}

function mirrorPosition(position) {
  return {
    x: ARENA_WIDTH - Number(position.x),
    y: ARENA_HEIGHT - Number(position.y),
  };
}

function serializeGameState(game, viewerPlayerId = null) {
  const isGuestPerspective =
    viewerPlayerId && game.hostPlayerId && viewerPlayerId !== game.hostPlayerId;

  return {
    gameId: game.id,
    hostPlayerId: game.hostPlayerId,
    defenders: game.state.defenders.map((defender) => ({
      id: defender.id,
      ownerId: defender.ownerId,
      unitType: defender.unitType ?? "defender",
      position: isGuestPerspective
        ? mirrorPosition(defender.position)
        : {
            x: defender.position.x,
            y: defender.position.y,
          },
      createdAt: defender.createdAt,
    })),
    players: game.players.size,
    maxPlayers: game.maxPlayers,
    phase: game.state.phase,
    countdownRemaining: game.state.countdownRemaining,
    updatedAt: game.state.updatedAt,
  };
}

function serializeGameDetails(game, viewerPlayerId = null) {
  return {
    ...serializeGameListItem(game),
    playerList: Array.from(game.players.values(), serializePlayer),
    state: serializeGameState(game, viewerPlayerId),
  };
}

function getPlayerSlot(game, playerId) {
  if (!playerId) {
    return PLAYER_SLOT_NONE;
  }

  return game.hostPlayerId === playerId ? PLAYER_SLOT_HOST : PLAYER_SLOT_GUEST;
}

function createMatchSnapshotEntity(game, viewerPlayerId = null) {
  const isGuestPerspective =
    viewerPlayerId && game.hostPlayerId && viewerPlayerId !== game.hostPlayerId;
  const hostDroppedFlagPosition = game.state.hostDroppedFlagPosition
    ? isGuestPerspective
      ? mirrorPosition(game.state.hostDroppedFlagPosition)
      : game.state.hostDroppedFlagPosition
    : null;
  const guestDroppedFlagPosition = game.state.guestDroppedFlagPosition
    ? isGuestPerspective
      ? mirrorPosition(game.state.guestDroppedFlagPosition)
      : game.state.guestDroppedFlagPosition
    : null;

  return {
    id: MATCH_ENTITY_ID,
    kind: ENTITY_KIND_MATCH,
    ownerSlot: getPlayerSlot(game, viewerPlayerId),
    unitType: UNIT_TYPE_NONE,
    carryingFlag: CARRYING_FLAG_NO,
    hostFlagState: game.state.hostFlagAtBase
      ? FLAG_STATE_AT_BASE
      : FLAG_STATE_EMPTY,
    guestFlagState: game.state.guestFlagAtBase
      ? FLAG_STATE_AT_BASE
      : FLAG_STATE_EMPTY,
    hostDroppedFlagPresent: hostDroppedFlagPosition
      ? FLAG_DROPPED_YES
      : FLAG_DROPPED_NO,
    guestDroppedFlagPresent: guestDroppedFlagPosition
      ? FLAG_DROPPED_YES
      : FLAG_DROPPED_NO,
    hostDroppedFlagX: hostDroppedFlagPosition?.x ?? 0,
    hostDroppedFlagY: hostDroppedFlagPosition?.y ?? 0,
    guestDroppedFlagX: guestDroppedFlagPosition?.x ?? 0,
    guestDroppedFlagY: guestDroppedFlagPosition?.y ?? 0,
    players: game.players.size,
    maxPlayers: game.maxPlayers,
    phase: encodePhase(game.state.phase),
    countdownRemaining: encodeCountdown(game.state.countdownRemaining),
    x: 0,
    y: 0,
  };
}

function createDefenderSnapshotEntity(game, defender, viewerPlayerId = null) {
  const isGuestPerspective =
    viewerPlayerId && game.hostPlayerId && viewerPlayerId !== game.hostPlayerId;
  const position = isGuestPerspective
    ? mirrorPosition(defender.position)
    : {
        x: defender.position.x,
        y: defender.position.y,
      };

  return {
    id: defender.id,
    kind: ENTITY_KIND_DEFENDER,
    ownerSlot: getPlayerSlot(game, defender.ownerId),
    unitType: encodeUnitType(defender.unitType),
    carryingFlag: defender.carryingFlag ? CARRYING_FLAG_YES : CARRYING_FLAG_NO,
    hostFlagState: FLAG_STATE_AT_BASE,
    guestFlagState: FLAG_STATE_AT_BASE,
    hostDroppedFlagPresent: FLAG_DROPPED_NO,
    guestDroppedFlagPresent: FLAG_DROPPED_NO,
    hostDroppedFlagX: 0,
    hostDroppedFlagY: 0,
    guestDroppedFlagX: 0,
    guestDroppedFlagY: 0,
    players: 0,
    maxPlayers: 0,
    phase: 0,
    countdownRemaining: COUNTDOWN_NONE,
    x: position.x,
    y: position.y,
  };
}

function createGameSnapshot(game, viewerPlayerId = null) {
  return snapshotInterpolation.snapshot.create([
    createMatchSnapshotEntity(game, viewerPlayerId),
    ...game.state.defenders.map((defender) =>
      createDefenderSnapshotEntity(game, defender, viewerPlayerId),
    ),
  ]);
}

function emitGameSnapshotToChannel(channel, game, viewerPlayerId = null) {
  const buffer = gameSnapshotModel.toBuffer(
    createGameSnapshot(game, viewerPlayerId),
  );

  channel.raw.emit(buffer);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function worldToGrid(position) {
  return {
    x: clamp(
      Math.round(Number(position.x) / PATH_GRID_CELL_SIZE),
      0,
      PATH_GRID_COLUMNS - 1,
    ),
    y: clamp(
      Math.round(Number(position.y) / PATH_GRID_CELL_SIZE),
      0,
      PATH_GRID_ROWS - 1,
    ),
  };
}

function gridToWorld(cell) {
  return {
    x: clamp(cell[0] * PATH_GRID_CELL_SIZE, 0, ARENA_WIDTH),
    y: clamp(cell[1] * PATH_GRID_CELL_SIZE, 0, ARENA_HEIGHT),
  };
}

function getTargetFlagPositionForPlayer(game, ownerId) {
  return getPlayerSlot(game, ownerId) === PLAYER_SLOT_HOST
    ? getGuestFlagPosition()
    : getHostFlagPosition();
}

function getHomeFlagPositionForPlayer(game, ownerId) {
  return getPlayerSlot(game, ownerId) === PLAYER_SLOT_HOST
    ? getHostFlagPosition()
    : getGuestFlagPosition();
}

function getEnemyFlagSlotForPlayer(game, ownerId) {
  return getPlayerSlot(game, ownerId) === PLAYER_SLOT_HOST
    ? PLAYER_SLOT_GUEST
    : PLAYER_SLOT_HOST;
}

function getFlagAtBaseBySlot(game, flagSlot) {
  if (flagSlot === PLAYER_SLOT_HOST) {
    return game.state.hostFlagAtBase;
  }

  return game.state.guestFlagAtBase;
}

function setFlagAtBaseBySlot(game, flagSlot, atBase) {
  if (flagSlot === PLAYER_SLOT_HOST) {
    game.state.hostFlagAtBase = atBase;
    return;
  }

  game.state.guestFlagAtBase = atBase;
}

function getDroppedFlagPositionBySlot(game, flagSlot) {
  if (flagSlot === PLAYER_SLOT_HOST) {
    return game.state.hostDroppedFlagPosition;
  }

  return game.state.guestDroppedFlagPosition;
}

function setDroppedFlagPositionBySlot(game, flagSlot, position) {
  if (flagSlot === PLAYER_SLOT_HOST) {
    game.state.hostDroppedFlagPosition = position
      ? { x: position.x, y: position.y }
      : null;
    return;
  }

  game.state.guestDroppedFlagPosition = position
    ? { x: position.x, y: position.y }
    : null;
}

function getFlagPickupTargetPositionForPlayer(game, ownerId) {
  const enemyFlagSlot = getEnemyFlagSlotForPlayer(game, ownerId);
  return (
    getDroppedFlagPositionBySlot(game, enemyFlagSlot) ??
    getTargetFlagPositionForPlayer(game, ownerId)
  );
}

function countUnitsForPlayer(game, playerId) {
  return game.state.defenders.filter(
    (defender) => defender.ownerId === playerId,
  ).length;
}

function buildPathGrid(game, currentSeekerId = null) {
  const grid = new PF.Grid(PATH_GRID_COLUMNS, PATH_GRID_ROWS);

  for (const defender of game.state.defenders) {
    if (defender.id === currentSeekerId || defender.unitType === "flagSeeker") {
      continue;
    }

    const cell = worldToGrid(defender.position);
    grid.setWalkableAt(cell.x, cell.y, false);
  }

  return grid;
}

function buildWorldPath(game, defender) {
  const startCell = worldToGrid(defender.position);
  const targetCell = worldToGrid(defender.targetPosition);
  const grid = buildPathGrid(game, defender.id);

  grid.setWalkableAt(startCell.x, startCell.y, true);
  grid.setWalkableAt(targetCell.x, targetCell.y, true);

  const rawPath = pathFinder.findPath(
    startCell.x,
    startCell.y,
    targetCell.x,
    targetCell.y,
    grid,
  );

  if (rawPath.length === 0) {
    return [];
  }

  const compressedPath = PF.Util.compressPath(rawPath);
  const worldPath = compressedPath.slice(1).map((cell) => gridToWorld(cell));

  if (worldPath.length === 0) {
    return [
      {
        x: defender.targetPosition.x,
        y: defender.targetPosition.y,
      },
    ];
  }

  worldPath[worldPath.length - 1] = {
    x: defender.targetPosition.x,
    y: defender.targetPosition.y,
  };

  return worldPath;
}

function recalculateFlagSeekerPaths(game) {
  for (const defender of game.state.defenders) {
    if (defender.unitType !== "flagSeeker") {
      continue;
    }

    defender.targetPosition = defender.carryingFlag
      ? getHomeFlagPositionForPlayer(game, defender.ownerId)
      : getFlagPickupTargetPositionForPlayer(game, defender.ownerId);

    if (!defender.targetPosition) {
      defender.path = [];
      defender.pathIndex = 0;
      continue;
    }

    defender.path = buildWorldPath(game, defender);
    defender.pathIndex = 0;
  }
}

function distanceBetween(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  return Math.hypot(dx, dy);
}

function handleFlagSeekerFlagTransitions(game) {
  let changed = false;

  for (const defender of game.state.defenders) {
    if (defender.unitType !== "flagSeeker") {
      continue;
    }

    if (defender.carryingFlag) {
      const homeFlagPosition = getHomeFlagPositionForPlayer(game, defender.ownerId);
      if (distanceBetween(defender.position, homeFlagPosition) > DEFENDER_COLLISION_DISTANCE) {
        continue;
      }

      if (defender.carriedFlagSlot !== PLAYER_SLOT_NONE) {
        setFlagAtBaseBySlot(game, defender.carriedFlagSlot, true);
        setDroppedFlagPositionBySlot(game, defender.carriedFlagSlot, null);
      }

      defender.carryingFlag = false;
      defender.carriedFlagSlot = PLAYER_SLOT_NONE;
      defender.targetPosition = null;
      defender.path = [];
      defender.pathIndex = 0;
      changed = true;
      continue;
    }

    const enemyFlagSlot = getEnemyFlagSlotForPlayer(game, defender.ownerId);
    const droppedEnemyFlagPosition = getDroppedFlagPositionBySlot(
      game,
      enemyFlagSlot,
    );
    if (!getFlagAtBaseBySlot(game, enemyFlagSlot) && !droppedEnemyFlagPosition) {
      continue;
    }

    const enemyFlagPosition =
      droppedEnemyFlagPosition ??
      getTargetFlagPositionForPlayer(game, defender.ownerId);
    if (distanceBetween(defender.position, enemyFlagPosition) > DEFENDER_COLLISION_DISTANCE) {
      continue;
    }

    setFlagAtBaseBySlot(game, enemyFlagSlot, false);
    setDroppedFlagPositionBySlot(game, enemyFlagSlot, null);
    defender.carryingFlag = true;
    defender.carriedFlagSlot = enemyFlagSlot;
    defender.targetPosition = getHomeFlagPositionForPlayer(game, defender.ownerId);
    defender.path = buildWorldPath(game, defender);
    defender.pathIndex = 0;
    changed = true;
  }

  if (changed) {
    touchGameState(game);
  }

  return changed;
}

function moveFlagSeekers(game, deltaSeconds) {
  if (game.state.phase !== "live") {
    return false;
  }

  let moved = false;
  const maxStepDistance = FLAG_SEEKER_SPEED * deltaSeconds;

  for (const defender of game.state.defenders) {
    if (defender.unitType !== "flagSeeker" || !defender.targetPosition) {
      continue;
    }

    if (!Array.isArray(defender.path) || defender.path.length === 0) {
      defender.path = buildWorldPath(game, defender);
      defender.pathIndex = 0;
    }

    if (!Array.isArray(defender.path) || defender.path.length === 0) {
      continue;
    }

    if (!Number.isInteger(defender.pathIndex) || defender.pathIndex < 0) {
      defender.pathIndex = 0;
    }

    const currentWaypoint = defender.path[defender.pathIndex];
    if (!currentWaypoint) {
      continue;
    }

    const dx = currentWaypoint.x - defender.position.x;
    const dy = currentWaypoint.y - defender.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) {
      if (defender.pathIndex < defender.path.length - 1) {
        defender.pathIndex += 1;
      } else {
        defender.pathIndex = defender.path.length;
      }
      continue;
    }

    if (distance <= maxStepDistance) {
      defender.position = {
        x: currentWaypoint.x,
        y: currentWaypoint.y,
      };
      moved = true;

      if (defender.pathIndex < defender.path.length - 1) {
        defender.pathIndex += 1;
      } else {
        defender.pathIndex = defender.path.length;
      }

      continue;
    }

    defender.position = {
      x: defender.position.x + (dx / distance) * maxStepDistance,
      y: defender.position.y + (dy / distance) * maxStepDistance,
    };
    moved = true;
  }

  if (moved) {
    touchGameState(game);
  }

  return moved;
}

function findNearestEnemyUnit(game, defender) {
  let nearestEnemy = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of game.state.defenders) {
    if (
      candidate.id === defender.id ||
      candidate.ownerId === defender.ownerId
    ) {
      continue;
    }

    const dx = candidate.position.x - defender.position.x;
    const dy = candidate.position.y - defender.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestEnemy = candidate;
    }
  }

  return nearestEnemy;
}

function moveDefenders(game, deltaSeconds) {
  if (game.state.phase !== "live") {
    return false;
  }

  let moved = false;
  const maxStepDistance = DEFENDER_CHASE_SPEED * deltaSeconds;

  for (const defender of game.state.defenders) {
    if (defender.unitType !== "defender") {
      continue;
    }

    const nearestEnemy = findNearestEnemyUnit(game, defender);
    if (!nearestEnemy) {
      continue;
    }

    const dx = nearestEnemy.position.x - defender.position.x;
    const dy = nearestEnemy.position.y - defender.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) {
      continue;
    }

    if (distance <= maxStepDistance) {
      defender.position = {
        x: nearestEnemy.position.x,
        y: nearestEnemy.position.y,
      };
      moved = true;
      continue;
    }

    defender.position = {
      x: defender.position.x + (dx / distance) * maxStepDistance,
      y: defender.position.y + (dy / distance) * maxStepDistance,
    };
    moved = true;
  }

  if (moved) {
    touchGameState(game);
  }

  return moved;
}

function resolveDefenderCollisions(game) {
  if (game.state.phase !== "live") {
    return false;
  }

  const collidedUnitIds = new Set();

  for (let i = 0; i < game.state.defenders.length; i += 1) {
    const unitA = game.state.defenders[i];

    for (let j = i + 1; j < game.state.defenders.length; j += 1) {
      const unitB = game.state.defenders[j];

      if (unitA.ownerId === unitB.ownerId) {
        continue;
      }

      if (unitA.unitType !== "defender" && unitB.unitType !== "defender") {
        continue;
      }

      const dx = unitA.position.x - unitB.position.x;
      const dy = unitA.position.y - unitB.position.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= DEFENDER_COLLISION_DISTANCE) {
        collidedUnitIds.add(unitA.id);
        collidedUnitIds.add(unitB.id);
      }
    }
  }

  if (collidedUnitIds.size === 0) {
    return false;
  }

  for (const defender of game.state.defenders) {
    if (
      collidedUnitIds.has(defender.id) &&
      defender.carryingFlag &&
      defender.carriedFlagSlot !== PLAYER_SLOT_NONE
    ) {
      setFlagAtBaseBySlot(game, defender.carriedFlagSlot, false);
      setDroppedFlagPositionBySlot(game, defender.carriedFlagSlot, {
        x: defender.position.x,
        y: defender.position.y,
      });
    }
  }

  game.state.defenders = game.state.defenders.filter(
    (defender) => !collidedUnitIds.has(defender.id),
  );
  touchGameState(game);
  return true;
}

function emitGameList(channel) {
  channel.emit("game-list", Array.from(games.values(), serializeGameListItem));
}

function broadcastGameList() {
  io.emit("game-list", Array.from(games.values(), serializeGameListItem));
}

function emitGameSnapshots(game) {
  for (const player of game.players.values()) {
    emitGameSnapshotToChannel(player.channel, game, player.id);
  }
}

function tickRealtimeGames() {
  for (const game of games.values()) {
    if (game.players.size === 0) {
      continue;
    }

    const defendersMoved = moveDefenders(game, SNAPSHOT_INTERVAL_MS / 1000);
    const collisionsAfterDefenderMove = resolveDefenderCollisions(game);
    if (defendersMoved || collisionsAfterDefenderMove) {
      recalculateFlagSeekerPaths(game);
    }

    const seekersMoved = moveFlagSeekers(game, SNAPSHOT_INTERVAL_MS / 1000);
    const flagTransitionsAfterSeekerMove = handleFlagSeekerFlagTransitions(game);
    const collisionsAfterSeekerMove = resolveDefenderCollisions(game);
    if (seekersMoved || flagTransitionsAfterSeekerMove || collisionsAfterSeekerMove) {
      recalculateFlagSeekerPaths(game);
    }

    emitGameSnapshots(game);
  }
}

function clearCountdownTimer(game) {
  if (game.countdownDelayTimer) {
    clearTimeout(game.countdownDelayTimer);
    game.countdownDelayTimer = null;
  }

  if (game.countdownIntervalTimer) {
    clearInterval(game.countdownIntervalTimer);
    game.countdownIntervalTimer = null;
  }
}

function setGamePhase(game, phase, countdownRemaining) {
  game.state.phase = phase;
  game.state.countdownRemaining = countdownRemaining;
  touchGameState(game);
}

function updateGameReadiness(game) {
  if (game.players.size < MIN_PLAYERS_TO_START) {
    clearCountdownTimer(game);

    if (
      game.state.phase !== "waiting" ||
      game.state.countdownRemaining !== null
    ) {
      setGamePhase(game, "waiting", null);
      emitGameSnapshots(game);
    }
    return;
  }

  if (game.state.phase === "live") {
    return;
  }

  if (game.countdownDelayTimer || game.countdownIntervalTimer) {
    return;
  }

  setGamePhase(game, "waiting", null);
  emitGameSnapshots(game);

  game.countdownDelayTimer = setTimeout(() => {
    game.countdownDelayTimer = null;

    if (!games.has(game.id) || game.players.size < MIN_PLAYERS_TO_START) {
      return;
    }

    let remaining = PRE_GAME_COUNTDOWN_SECONDS;
    setGamePhase(game, "countdown", remaining);
    emitGameSnapshots(game);

    game.countdownIntervalTimer = setInterval(() => {
      if (!games.has(game.id) || game.players.size < MIN_PLAYERS_TO_START) {
        clearCountdownTimer(game);
        return;
      }

      remaining -= 1;

      if (remaining <= 0) {
        clearCountdownTimer(game);
        setGamePhase(game, "live", 0);
        emitGameSnapshots(game);
        return;
      }

      setGamePhase(game, "countdown", remaining);
      emitGameSnapshots(game);
    }, 1000);
  }, 1000);
}

function createGame(payload = {}) {
  const safePayload = normalizePayload(payload);

  const game = {
    id: createGameId(),
    name: normalizeString(safePayload.name, `GAME-${nextGameNumber++}`),
    host: normalizeString(safePayload.host, "Host"),
    hostPlayerId: null,
    maxPlayers: normalizeMaxPlayers(safePayload.maxPlayers),
    createdAt: now(),
    players: new Map(),
    state: createGameState(),
    countdownDelayTimer: null,
    countdownIntervalTimer: null,
  };

  games.set(game.id, game);
  broadcastGameList();

  return game;
}

function getGame(gameId) {
  if (typeof gameId !== "string") {
    return null;
  }

  return games.get(gameId) ?? null;
}

function touchGameState(game) {
  game.state.updatedAt = now();
}

function removeChannelFromGame(channel) {
  const gameId = channel.userData?.gameId;

  if (!gameId) {
    channel.leave();
    return;
  }

  const game = games.get(gameId);

  channel.leave();
  channel.userData.gameId = null;

  if (!game) {
    broadcastGameList();
    return;
  }

  game.players.delete(channel.id);

  if (game.players.size === 0) {
    clearCountdownTimer(game);
    games.delete(gameId);
  } else {
    if (game.hostPlayerId === channel.id) {
      const nextHost = game.players.values().next().value;
      game.hostPlayerId = nextHost?.id ?? null;
      game.host = nextHost?.name ?? "Host";
    }

    recalculateFlagSeekerPaths(game);
    touchGameState(game);
    emitGameSnapshots(game);
    updateGameReadiness(game);
  }

  broadcastGameList();
}

function joinGameInstance(channel, payload = {}) {
  const safePayload = normalizePayload(payload);
  const game = getGame(safePayload.gameId);

  if (!game) {
    channel.emit("join-error", { message: "Game not found" });
    return;
  }

  if (channel.userData?.gameId && channel.userData.gameId !== game.id) {
    removeChannelFromGame(channel);
  }

  const existingPlayer = game.players.get(channel.id);

  if (!existingPlayer && game.players.size >= game.maxPlayers) {
    channel.emit("join-error", { message: "Game is full" });
    return;
  }

  const player = existingPlayer ?? {
    id: channel.id,
    name: normalizeString(safePayload.playerName, "Player"),
    joinedAt: now(),
    channel,
  };

  player.name = normalizeString(safePayload.playerName, player.name);
  player.channel = channel;

  game.players.set(channel.id, player);

  if (!game.hostPlayerId) {
    game.hostPlayerId = channel.id;
  }

  if (game.hostPlayerId === channel.id) {
    game.host = player.name;
  }

  channel.join(game.id);
  channel.userData.gameId = game.id;

  touchGameState(game);
  updateGameReadiness(game);

  channel.emit("game-joined", {
    id: game.id,
    name: game.name,
    game: serializeGameDetails(game, channel.id),
    playerId: channel.id,
    playerSlot: getPlayerSlot(game, channel.id),
  });

  emitGameSnapshots(game);
  broadcastGameList();
}

function addDefender(channel, payload = {}) {
  const safePayload = normalizePayload(payload);
  const game = getGame(channel.userData?.gameId);

  if (!game) {
    channel.emit("game-error", { message: "Join a game before placing units" });
    return;
  }

  if (game.state.phase !== "live") {
    channel.emit("game-error", { message: "Match has not started yet" });
    return;
  }

  const x = Number(safePayload.position?.x);
  const y = Number(safePayload.position?.y);
  const requestedUnitType = normalizeString(safePayload.unitType, "defender");
  const unitType =
    requestedUnitType === "flagSeeker" ? "flagSeeker" : "defender";

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    channel.emit("game-error", { message: "Invalid defender position" });
    return;
  }

  if (countUnitsForPlayer(game, channel.id) >= MAX_UNITS_PER_PLAYER) {
    channel.emit("game-error", {
      message: `Unit limit reached (${MAX_UNITS_PER_PLAYER})`,
    });
    return;
  }

  const playerIsGuest =
    game.hostPlayerId !== null && channel.id !== game.hostPlayerId;
  const canonicalPosition = playerIsGuest ? mirrorPosition({ x, y }) : { x, y };

  game.state.defenders.push({
    id: "DEF-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
    ownerId: channel.id,
    unitType,
    position: canonicalPosition,
    targetPosition:
      unitType === "flagSeeker"
        ? getFlagPickupTargetPositionForPlayer(game, channel.id)
        : null,
    carryingFlag: false,
    carriedFlagSlot: PLAYER_SLOT_NONE,
    path: [],
    pathIndex: 0,
    createdAt: now(),
  });

  recalculateFlagSeekerPaths(game);
  touchGameState(game);
  emitGameSnapshots(game);
}

app.get("/health", async () => {
  return {
    status: "ok",
    games: games.size,
  };
});

app.get("/games", async () => {
  return {
    games: Array.from(games.values(), serializeGameListItem),
  };
});

app.post("/games", async (request, reply) => {
  const payload =
    request.body && typeof request.body === "object" ? request.body : {};
  const game = createGame(payload);

  reply.code(201);
  return {
    game: serializeGameDetails(game),
  };
});

app.get("/games/:gameId", async (request, reply) => {
  const game = getGame(request.params.gameId);

  if (!game) {
    reply.code(404);
    return {
      message: "Game not found",
    };
  }

  return {
    game: serializeGameDetails(game),
  };
});

io.onConnection((channel) => {
  channel.userData = {
    ...(channel.userData ?? {}),
    gameId: null,
  };

  emitGameList(channel);

  channel.on("request-game-list", () => {
    emitGameList(channel);
  });

  channel.on("new-game", (payload) => {
    const game = createGame(payload);

    channel.emit("game-created", {
      id: game.id,
      name: game.name,
      game: serializeGameDetails(game),
    });
  });

  channel.on("join-game", (payload) => {
    const game = getGame(payload?.gameId);

    if (!game) {
      channel.emit("join-error", { message: "Game not found" });
      return;
    }

    if (game.players.size >= game.maxPlayers) {
      channel.emit("join-error", { message: "Game is full" });
      return;
    }

    channel.emit("game-joined", {
      id: game.id,
      name: game.name,
      game: serializeGameDetails(game),
    });
  });

  channel.on("join-game-instance", (payload) => {
    joinGameInstance(channel, payload);
  });

  channel.on("leave-game-instance", () => {
    removeChannelFromGame(channel);
  });

  channel.on("request-game-state", (payload) => {
    const requestedGame =
      getGame(payload?.gameId) ?? getGame(channel.userData?.gameId);

    if (!requestedGame) {
      channel.emit("game-error", { message: "Game not found" });
      return;
    }

    emitGameSnapshotToChannel(channel, requestedGame, channel.id);
  });

  channel.on("place-defender", (payload) => {
    addDefender(channel, payload);
  });

  channel.onDisconnect(() => {
    removeChannelFromGame(channel);
  });
});

const start = async () => {
  try {
    await app.ready();
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };

      const onListening = () => {
        server.off("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(PORT, "0.0.0.0");
    });

    setInterval(tickRealtimeGames, SNAPSHOT_INTERVAL_MS);

    app.log.info(`Server listening on port ${PORT}`);
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      app.log.error(
        `Port ${PORT} is already in use. Stop the other server or set PORT.`,
      );
    } else {
      app.log.error(error);
    }
    process.exit(1);
  }
};

start();
