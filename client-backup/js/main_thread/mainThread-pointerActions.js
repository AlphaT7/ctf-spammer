/**
 * Main Pointer Actions plugin: Handles pointer events (mouse/touch) in the main thread.
 * Detects various gestures like taps, swipes, drags, and press-and-hold.
 * Communicates gesture data to the worker thread and handles callbacks.
 */
export default class PointerActions {
  /**
   * Constructor for the PointerActions plugin.
   * @param {Object} options - Pointer action configuration.
   * @param {Worker} options.worker - Web worker instance for communication.
   * @param {string} options.targetElementID - ID of element to attach listeners to.
   * @param {Object} options.actions - Callback functions for different gestures.
   */
  constructor({ worker, targetElementID, actions }) {
    // Pointer options from the main thread
    this.targetElementID = targetElementID;
    this.targetElement = null;
    this.actions = actions;
    this.worker = worker;

    // Gesture timing constants (in milliseconds)
    this.PRESS_AND_HOLD_THRESHOLD = 300; // ms
    this.TAP_MAX_TIME = 200; // ms
    this.GESTURE_MIN_DISTANCE = 10; // pixels
    this.SWIPE_MIN_DISTANCE = 15; // pixels for more intentional swipes

    // State properties for tracking pointer interactions
    this.gestures = {
      pressAndHold: false,
      swipeLeft: false,
      swipeRight: false,
      swipeUp: false,
      swipeDown: false,
      pointerTap: false,
      pointerDrag: false,
    };
    this.pointerDown = false;
    this.onPointerDown = { x: 0, y: 0 };
    this.pointerDragCoordinates = [];
    this.lastActionTimeStamp = 0;
  }

  /**
   * Handles pointer down events.
   * Records initial position and timestamp, resets gesture states.
   * @param {Object} options - Event options.
   * @param {Object} options.pointer - Pointer coordinates and timestamp.
   */
  async #pointerDown({ pointer }) {
    this.onPointerDown.x = pointer.x;
    this.onPointerDown.y = pointer.y;
    this.pointerDown = true;
    Object.keys(this.gestures).forEach((key) => (this.gestures[key] = false));
    this.lastActionTimeStamp = Date.now();
    this.pointerDragCoordinates = [];
    this.worker.postMessage({
      type: "pointerData",
      pointerData: {
        workerObjectName: "WorkerPointerActions",
        objectMethodName: "pointerDown",
        methodParameters: {
          x: pointer.x,
          y: pointer.y,
          t: this.lastActionTimeStamp,
        },
      },
    });
  }

  /**
   * Handles pointer move events during a drag.
   * Tracks movement coordinates and sends data to worker.
   * @param {Object} options - Event options.
   * @param {Object} options.pointer - Current pointer coordinates.
   */
  #pointerMove({ pointer }) {
    this.currentActionTimeStamp = Date.now();
    this.pointerDragCoordinates.push({
      x: pointer.x,
      y: pointer.y,
      t: this.currentActionTimeStamp,
    });
    const { timeDiff, distance } = this.#getMetrics({ pointer });
    this.worker.postMessage({
      type: "pointerData",
      pointerData: {
        workerObjectName: "WorkerPointerActions",
        objectMethodName: "pointerMove",
        methodParameters: {
          timeDiff,
          distance,
          coordinates: this.pointerDragCoordinates,
        },
      },
    });
  }

  /**
   * Calculates movement metrics from pointer position.
   * @param {Object} options - Event options.
   * @param {Object} options.pointer - Current pointer coordinates.
   * @returns {Object} Metrics including time difference and distance.
   */
  #getMetrics({ pointer }) {
    const timeDiff = this.currentActionTimeStamp - this.lastActionTimeStamp;
    const deltaX = pointer.x - this.onPointerDown.x;
    const deltaY = pointer.y - this.onPointerDown.y;
    const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);
    return { timeDiff, deltaX, deltaY, distance };
  }

  /**
   * Gets pointer coordinates relative to the target element.
   * @param {Object} options - Event options.
   * @param {PointerEvent} options.e - The pointer event.
   * @returns {Object} Relative x,y coordinates.
   */
  #getPointerCoordinates({ e }) {
    // Get pointer coordinates relative to the target element
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  }

  /**
   * Handles pointer up events and determines gesture type.
   * Detects taps, swipes based on timing and distance thresholds.
   * @param {Object} options - Event options.
   * @param {Object} options.pointer - Final pointer coordinates.
   */
  #pointerUp({ pointer }) {
    this.currentActionTimeStamp = Date.now();
    const { timeDiff, deltaX, deltaY, distance } = this.#getMetrics({
      pointer,
    });
    // Tap: quick and close to start position
    this.gestures.pointerTap =
      timeDiff < this.TAP_MAX_TIME && distance < this.GESTURE_MIN_DISTANCE;

    // Swipes: require minimum distance and directional movement
    this.gestures.swipeLeft =
      deltaX < -this.SWIPE_MIN_DISTANCE &&
      Math.abs(deltaX) > Math.abs(deltaY) &&
      distance >= this.SWIPE_MIN_DISTANCE &&
      !this.gestures.pointerDrag;
    this.gestures.swipeRight =
      deltaX > this.SWIPE_MIN_DISTANCE &&
      Math.abs(deltaX) > Math.abs(deltaY) &&
      distance >= this.SWIPE_MIN_DISTANCE &&
      !this.gestures.pointerDrag;
    this.gestures.swipeUp =
      deltaY < -this.SWIPE_MIN_DISTANCE &&
      Math.abs(deltaY) > Math.abs(deltaX) &&
      distance >= this.SWIPE_MIN_DISTANCE &&
      !this.gestures.pointerDrag;
    this.gestures.swipeDown =
      deltaY > this.SWIPE_MIN_DISTANCE &&
      Math.abs(deltaY) > Math.abs(deltaX) &&
      distance >= this.SWIPE_MIN_DISTANCE &&
      !this.gestures.pointerDrag;

    const actionObject = { ...this.gestures };

    const action =
      Object.keys(actionObject).find((key) => actionObject[key] === true) ||
      "actionUndefined";
    this.actions[action]({ action });

    // Reset states
    this.pointerDown = false;
    this.pointerDragCoordinates = [];

    this.worker.postMessage({
      type: "pointerData",
      pointerData: {
        workerObjectName: "WorkerPointerActions",
        objectMethodName: "pointerUp",
        methodParameters: {
          /* No Parameters Needed */
        },
      },
    });
  }

  actionFilter(e) {
    const actionType = e.type;
    const { x, y } = this.#getPointerCoordinates({ e });
    const pointer = { x, y, t: Date.now() };

    switch (actionType) {
      case "pointerdown": {
        this.#pointerDown({ pointer });
        break;
      }

      case "pointerup": {
        this.#pointerUp({ pointer });
        break;
      }

      case "pointermove": {
        this.#pointerMove({ pointer });
        break;
      }

      default: {
        console.trace("Unknown action type:", actionType);
        break;
      }
    }
  }

  /**
   * Sets up event listeners for pointer events and worker messages.
   * @param {Object} options - Options object.
   * @param {HTMLElement} options.element - Element to attach listeners to.
   */
  #setEventListeners({ element }) {
    // If css touch actions aren't disabled, unintended
    // scrolling/zooming may occur on touch devices
    element.style.touchAction = "none";

    // Listen for pointer events
    element.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        this.actionFilter(e);
      },
      { passive: false },
    );

    element.addEventListener(
      "pointerup",
      (e) => {
        e.preventDefault();
        this.actionFilter(e);
      },
      { passive: false },
    );

    element.addEventListener(
      "pointermove",
      (e) => {
        e.preventDefault();
        if (this.pointerDown) this.actionFilter(e);
      },
      { passive: false },
    );

    // Listen for worker events
    this.worker.addEventListener("message", (e) => {
      switch (e.data.type) {
        case "pressAndHold": {
          // Handle press and hold action
          this.gestures.pressAndHold = e.data.pressAndHold;
          if (this.gestures.pressAndHold)
            this.actions.pressAndHold({ action: "pressAndHold" });
          break;
        }

        case "pointerDrag": {
          // Handle pointer drag action
          this.gestures.pointerDrag = e.data.pointerDrag;
          if (this.gestures.pointerDrag)
            this.actions.pointerDrag({
              action: "pointerDrag",
              coordinatesArray: e.data.coordinatesArray,
            });
          break;
        }

        default: {
          console.trace("Unknown message type from worker:", e.data.type);
          break;
        }
      }
    });
  }

  /**
   * Initializes the plugin by setting up event listeners on the target element.
   * @param {HTMLElement} targetElement - The element to initialize (optional, uses configured target).
   */
  async init() {
    this.targetElement =
      this.targetElementID == "body"
        ? document.body
        : document.getElementById(this.targetElementID);

    if (!this.targetElement)
      throw new Error("Target element is required for initialization");
    this.#setEventListeners({ element: this.targetElement });
  }
}
