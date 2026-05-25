/**
 * Worker Pointer Actions plugin: Manages pointer state and gesture detection in the worker thread.
 * Processes pointer events from the main thread and detects press-and-hold and drag gestures.
 * Communicates gesture results back to the main thread.
 */
export default class WorkerPointerActions {
  /**
   * Constructor for the WorkerPointerActions plugin.
   * @param {Object} options - Plugin options.
   * @param {Worker} options.worker - Reference to the worker for posting messages.
   */
  constructor({ worker }) {
    this.worker = worker;
    this.pointerState = {
      coordinates: { x: 0, y: 0 },
      pointerDown: false,
      pressAndHold: false,
      pointerDrag: false,
      timeStamp: 0,
      timeDiff: 0,
      distance: 0,
      coordinatesArray: [],
    };
  }

  /**
   * Handles pointer down events from the main thread.
   * Updates pointer state with initial coordinates and timestamp.
   * @param {Object} parameters - Event parameters.
   * @param {number} parameters.x - X coordinate.
   * @param {number} parameters.y - Y coordinate.
   * @param {number} parameters.timeStamp - Event timestamp.
   */
  pointerDown(parameters) {
    this.pointerState.timeStamp = parameters.timeStamp;
    this.pointerState.coordinates.x = parameters.x;
    this.pointerState.coordinates.y = parameters.y;
    this.pointerState.pointerDown = true;
  }

  /**
   * Handles pointer move events from the main thread.
   * Updates movement tracking data.
   * @param {Object} parameters - Event parameters.
   * @param {number} parameters.timeDiff - Time difference from start.
   * @param {number} parameters.distance - Distance moved.
   * @param {Array} parameters.coordinates - Array of coordinate points.
   */
  pointerMove(parameters) {
    if (!this.pointerState.pointerDown) return;
    this.pointerState.timeDiff = parameters.timeDiff;
    this.pointerState.distance = parameters.distance;
    this.pointerState.coordinatesArray = parameters.coordinates;
  }

  /**
   * Handles pointer up events from the main thread.
   * Resets pointer state.
   * @param {Object} parameters - Event parameters (unused).
   */
  pointerUp(parameters) {
    this.pointerState.pressAndHold = false;
    this.pointerState.pointerDrag = false;
    this.pointerState.pointerDown = false;
    this.pointerState.timeStamp = 0;
    this.pointerState.timeDiff = 0;
    this.pointerState.distance = 0;
    this.pointerState.coordinates = [];
  }

  /**
   * Update method called each frame by the engine.
   * Checks for gesture conditions and posts results to main thread.
   */
  update() {
    if (!this.pointerState.pointerDown) return;
    const timeDiff = Math.max(
      this.pointerState.timeDiff,
      Date.now() - this.pointerState.timeStamp,
    );
    this.pointerState.pressAndHold =
      timeDiff >= 300 &&
      this.pointerState.distance < 10 &&
      this.pointerState.pointerDown;
    this.pointerState.pointerDrag =
      timeDiff >= 300 &&
      this.pointerState.distance > 10 &&
      this.pointerState.pointerDown;
    this.worker.postMessage({
      type: "pressAndHold",
      pressAndHold: this.pointerState.pressAndHold,
    });
    this.worker.postMessage({
      type: "pointerDrag",
      pointerDrag: this.pointerState.pointerDrag,
      coordinatesArray: this.pointerState.coordinatesArray,
    });
  }
}
