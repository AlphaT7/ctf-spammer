import geckos from "@geckos.io/client";

const $ = (el) => document.querySelector(el);
const hudScore = $("#hud-score");
const hudPlayers = $("#hud-players");

const params = new URLSearchParams(location.search);
const gameId = params.get("id");

if (!gameId) {
  document.body.innerHTML =
    '<p style="color:var(--accent-red);padding:2rem">Missing game id</p>';
  throw new Error("Missing game id");
}

const PHONE_PROFILES = [
  { w: 375, h: 667, cw: 350, ch: 650, label: "iphone-se" },
  { w: 412, h: 915, cw: 400, ch: 650, label: "galaxy-a35" },
];

const channel = geckos({ port: 3000 });

channel.onConnect((error) => {
  if (error) {
    console.error(error);
    return;
  }
});

channel.onDisconnect(() => {
  console.log("disconnected from server.");
});
