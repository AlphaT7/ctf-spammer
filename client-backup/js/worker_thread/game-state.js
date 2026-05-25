import * as GameObjects from "./game-objects.js";

export default class GameState {
  constructor(temporalObjects) {
    this.temporalObjects = temporalObjects;
  }

  createFlagSeaker({ x, y, t } = methodPerameters) {
    this.temporalObjects.push(new GameObjects.PlayerFlagSeeker(x, y));
    console.log(t);
  }
}
