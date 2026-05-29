import * as TypedArrayBufferSchema from "@geckos.io/typed-array-buffer-schema";

const { BufferSchema, Model, int16, string8, uint8, uint64 } =
  TypedArrayBufferSchema;

export const SNAPSHOT_SERVER_FPS = 20;
export const SNAPSHOT_BUFFER_SIZE_KB = 16;
export const SNAPSHOT_ID_LENGTH = 6;
export const ENTITY_ID_LENGTH = 16;
export const ARENA_WIDTH = 375;
export const ARENA_HEIGHT = 630;
export const UNIT_SPRITE_SIZE = 40;
export const FLAG_EDGE_PADDING = 5;
export const PATH_GRID_CELL_SIZE = 10;
export const FLAG_SEEKER_SPEED = 250;

export const MATCH_ENTITY_ID = "MATCH";

export const ENTITY_KIND_MATCH = 0;
export const ENTITY_KIND_DEFENDER = 1;

export const PLAYER_SLOT_HOST = 0;
export const PLAYER_SLOT_GUEST = 1;
export const PLAYER_SLOT_NONE = 255;

export const UNIT_TYPE_DEFENDER = 0;
export const UNIT_TYPE_FLAG_SEEKER = 1;
export const UNIT_TYPE_NONE = 255;

export const PHASE_WAITING = 0;
export const PHASE_COUNTDOWN = 1;
export const PHASE_LIVE = 2;

export const COUNTDOWN_NONE = 255;
export const FLAG_STATE_EMPTY = 0;
export const FLAG_STATE_AT_BASE = 1;
export const CARRYING_FLAG_NO = 0;
export const CARRYING_FLAG_YES = 1;
export const FLAG_DROPPED_NO = 0;
export const FLAG_DROPPED_YES = 1;

export function getHostFlagPosition() {
  return {
    x: ARENA_WIDTH / 2,
    y: ARENA_HEIGHT - UNIT_SPRITE_SIZE / 2 - FLAG_EDGE_PADDING,
  };
}

export function getGuestFlagPosition() {
  return {
    x: ARENA_WIDTH / 2,
    y: UNIT_SPRITE_SIZE / 2 + FLAG_EDGE_PADDING,
  };
}

const snapshotEntitySchema = BufferSchema.schema("snapshot-entity", {
  id: { type: string8, length: ENTITY_ID_LENGTH },
  kind: uint8,
  ownerSlot: uint8,
  unitType: uint8,
  carryingFlag: uint8,
  hostFlagState: uint8,
  guestFlagState: uint8,
  hostDroppedFlagPresent: uint8,
  guestDroppedFlagPresent: uint8,
  hostDroppedFlagX: { type: int16, digits: 1 },
  hostDroppedFlagY: { type: int16, digits: 1 },
  guestDroppedFlagX: { type: int16, digits: 1 },
  guestDroppedFlagY: { type: int16, digits: 1 },
  players: uint8,
  maxPlayers: uint8,
  phase: uint8,
  countdownRemaining: uint8,
  x: { type: int16, digits: 1 },
  y: { type: int16, digits: 1 },
});

const gameSnapshotSchema = BufferSchema.schema("game-snapshot", {
  id: { type: string8, length: SNAPSHOT_ID_LENGTH },
  time: uint64,
  state: [snapshotEntitySchema],
});

export const gameSnapshotModel = new Model(
  gameSnapshotSchema,
  SNAPSHOT_BUFFER_SIZE_KB,
);

export function encodePhase(phase) {
  switch (phase) {
    case "countdown":
      return PHASE_COUNTDOWN;
    case "live":
      return PHASE_LIVE;
    case "waiting":
    default:
      return PHASE_WAITING;
  }
}

export function decodePhase(phase) {
  switch (phase) {
    case PHASE_COUNTDOWN:
      return "countdown";
    case PHASE_LIVE:
      return "live";
    case PHASE_WAITING:
    default:
      return "waiting";
  }
}

export function encodeUnitType(unitType) {
  return unitType === "flagSeeker" ? UNIT_TYPE_FLAG_SEEKER : UNIT_TYPE_DEFENDER;
}

export function decodeUnitType(unitType) {
  switch (unitType) {
    case UNIT_TYPE_FLAG_SEEKER:
      return "flagSeeker";
    case UNIT_TYPE_DEFENDER:
    default:
      return "defender";
  }
}

export function encodeCountdown(countdownRemaining) {
  return countdownRemaining === null ? COUNTDOWN_NONE : countdownRemaining;
}

export function decodeCountdown(countdownRemaining) {
  return countdownRemaining === COUNTDOWN_NONE ? null : countdownRemaining;
}

export function decodeGameSnapshot(buffer) {
  const snapshot = gameSnapshotModel.fromBuffer(buffer);

  return {
    ...snapshot,
    state: snapshot.state.map((entity) => ({
      ...entity,
      kind: entity.kind === ENTITY_KIND_MATCH ? "match" : "defender",
      unitType:
        entity.unitType === UNIT_TYPE_NONE
          ? null
          : decodeUnitType(entity.unitType),
      carryingFlag: entity.carryingFlag === CARRYING_FLAG_YES,
      hostFlagAtBase: entity.hostFlagState === FLAG_STATE_AT_BASE,
      guestFlagAtBase: entity.guestFlagState === FLAG_STATE_AT_BASE,
      hostDroppedFlagPosition:
        entity.hostDroppedFlagPresent === FLAG_DROPPED_YES
          ? { x: entity.hostDroppedFlagX, y: entity.hostDroppedFlagY }
          : null,
      guestDroppedFlagPosition:
        entity.guestDroppedFlagPresent === FLAG_DROPPED_YES
          ? { x: entity.guestDroppedFlagX, y: entity.guestDroppedFlagY }
          : null,
      phase: decodePhase(entity.phase),
      countdownRemaining: decodeCountdown(entity.countdownRemaining),
    })),
  };
}

export function isMatchEntity(entity) {
  return entity?.kind === "match" || entity?.kind === ENTITY_KIND_MATCH;
}

export function isDefenderEntity(entity) {
  return entity?.kind === "defender" || entity?.kind === ENTITY_KIND_DEFENDER;
}
