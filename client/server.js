import Fastify from "fastify";
import { geckos, iceServers } from "@geckos.io/server";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "templates");
const staticDir = path.join(__dirname, "static");

const server = http.createServer();

const app = Fastify({
  logger: true,
  serverFactory: (handler) => {
    server.on("request", handler);
    return server;
  },
});

const io = geckos({ iceServers });
io.addServer(server);

const games = new Map();

function broadcastGameList() {
  const list = [];
  for (const g of games.values()) {
    list.push({
      id: g.id,
      name: g.name,
      host: g.host,
      players: g.players.size,
      maxPlayers: g.maxPlayers,
    });
  }
  io.emit("game-list", list);
}

io.onConnection((channel) => {
  channel.userData = { inGame: false, gameId: null };

  channel.on("new-game", () => {
    const id =
      "GAME-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const game = {
      id,
      name: `GAME-${games.size + 1}`,
      host: "you",
      players: new Map(),
      maxPlayers: 4,
    };
    game.players.set(channel.id, { channel, name: "Player" });
    games.set(id, game);
    channel.userData.inGame = true;
    channel.userData.gameId = id;

    channel.emit("game-created", { id, name: game.name });
    broadcastGameList();
  });

  channel.on("join-game", (data) => {
    const game = games.get(data.gameId);
    if (!game) {
      channel.emit("join-error", { message: "Game not found" });
      return;
    }
    if (game.players.size >= game.maxPlayers) {
      channel.emit("join-error", { message: "Game is full" });
      return;
    }
    game.players.set(channel.id, { channel, name: "Player" });
    channel.userData.inGame = true;
    channel.userData.gameId = data.gameId;

    channel.emit("game-joined", { id: game.id, name: game.name });
    broadcastGameList();
  });

  channel.onDisconnect(() => {
    if (channel.userData.gameId) {
      const game = games.get(channel.userData.gameId);
      if (game) {
        game.players.delete(channel.id);
        if (game.players.size === 0) {
          games.delete(channel.userData.gameId);
        }
      }
    }
    broadcastGameList();
  });
});

app.get("/", async (_req, reply) => {
  const html = fs.readFileSync(path.join(templatesDir, "index.html"), "utf-8");
  reply.type("text/html").send(html);
});

app.get("/style.css", async (_req, reply) => {
  const css = fs.readFileSync(
    path.join(staticDir, "css", "style.css"),
    "utf-8",
  );
  reply.type("text/css").send(css);
});

app.get("/game.html", async (_req, reply) => {
  const html = fs.readFileSync(path.join(templatesDir, "game.html"), "utf-8");
  reply.type("text/html").send(html);
});

app.get("/game.css", async (_req, reply) => {
  const css = fs.readFileSync(path.join(staticDir, "css", "game.css"), "utf-8");
  reply.type("text/css").send(css);
});

app.get("/:file.js", async (req, reply) => {
  const filePath = path.join(staticDir, "js", req.params.file + ".js");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    reply.type("application/javascript").send(content);
  } catch {
    reply.code(404).send("Not found");
  }
});

app.get("/favicon.png", async (_req, reply) => {
  const png = fs.readFileSync(path.join(staticDir, "images", "favicon.png"));
  reply.type("image/png").send(png);
});

app.get("/favicon.ico", async (_req, reply) => {
  const png = fs.readFileSync(path.join(staticDir, "images", "favicon.png"));
  reply.type("image/x-icon").send(png);
});

const start = async () => {
  try {
    await app.ready();
    server.listen(3000, "0.0.0.0", () => {
      app.log.info("Server listening on port 3000");
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
