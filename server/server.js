import Fastify from "fastify";
import { geckos, iceServers } from "@geckos.io/server";
import http from "http";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";
const DEFAULT_MAX_PLAYERS = 4;
const MAX_MAX_PLAYERS = 8;

const server = http.createServer();

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
    players: game.players.size,
    maxPlayers: game.maxPlayers,
    createdAt: game.createdAt,
  };
}

function serializeGameState(game) {
  return {
    gameId: game.id,
    defenders: game.state.defenders.map((defender) => ({
      id: defender.id,
      ownerId: defender.ownerId,
      position: {
        x: defender.position.x,
        y: defender.position.y,
      },
      createdAt: defender.createdAt,
    })),
    players: game.players.size,
    maxPlayers: game.maxPlayers,
    updatedAt: game.state.updatedAt,
  };
}

function serializeGameDetails(game) {
  return {
    ...serializeGameListItem(game),
    playerList: Array.from(game.players.values(), serializePlayer),
    state: serializeGameState(game),
  };
}

function emitGameList(channel) {
  channel.emit("game-list", Array.from(games.values(), serializeGameListItem));
}

function broadcastGameList() {
  io.emit("game-list", Array.from(games.values(), serializeGameListItem));
}

function emitGameState(game) {
  io.room(game.id).emit("game-state", serializeGameState(game));
}

function createGame(payload = {}) {
  const safePayload = normalizePayload(payload);

  const game = {
    id: createGameId(),
    name: normalizeString(safePayload.name, `GAME-${nextGameNumber++}`),
    host: normalizeString(safePayload.host, "Host"),
    maxPlayers: normalizeMaxPlayers(safePayload.maxPlayers),
    createdAt: now(),
    players: new Map(),
    state: createGameState(),
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
    games.delete(gameId);
  } else {
    touchGameState(game);
    emitGameState(game);
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
  channel.join(game.id);
  channel.userData.gameId = game.id;

  touchGameState(game);

  channel.emit("game-joined", {
    id: game.id,
    name: game.name,
    game: serializeGameDetails(game),
    playerId: channel.id,
  });

  emitGameState(game);
  broadcastGameList();
}

function addDefender(channel, payload = {}) {
  const safePayload = normalizePayload(payload);
  const game = getGame(channel.userData?.gameId);

  if (!game) {
    channel.emit("game-error", { message: "Join a game before placing units" });
    return;
  }

  const x = Number(safePayload.position?.x);
  const y = Number(safePayload.position?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    channel.emit("game-error", { message: "Invalid defender position" });
    return;
  }

  game.state.defenders.push({
    id: "DEF-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
    ownerId: channel.id,
    position: { x, y },
    createdAt: now(),
  });

  touchGameState(game);
  emitGameState(game);
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
    const requestedGame = getGame(payload?.gameId) ?? getGame(channel.userData?.gameId);

    if (!requestedGame) {
      channel.emit("game-error", { message: "Game not found" });
      return;
    }

    channel.emit("game-state", serializeGameState(requestedGame));
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
