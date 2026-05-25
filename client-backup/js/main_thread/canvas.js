/**
 * Canvas plugin: Creates and configures the HTML5 canvas element for rendering.
 * Sets up both on-screen and off-screen canvases, with the off-screen canvas
 * transferred to the worker thread for performance.
 */
export default class Canvas {
  /**
   * Constructor for the Canvas plugin.
   * @param {Object} options - Canvas configuration options.
   * @param {string} options.canvasID - ID for the on-screen canvas element.
   * @param {string} options.parentID - ID for the parent container div.
   */
  constructor({ canvasID, parentID }) {
    this.canvasID = canvasID;
    this.parentID = parentID;
  }

  /**
   * Initializes the canvas by creating DOM elements and transferring control to off-screen canvas.
   * @returns {Promise<Object>} Promise resolving to object containing offScreenCanvas.
   */
  async init() {
    // Create canvas parent element
    let parentEl = document.createElement("div");
    parentEl.id = this.parentID;
    document.body.append(parentEl);

    // Create on-screen canvas element
    let canvasObj = document.createElement("canvas");
    // canvas elements default to: display: inline;
    // changing to block enables exact sizing, whereas
    // inline elements do not respect width/height properly
    canvasObj.style.display = "block";
    // If css touch actions aren't disabled, unintentional
    // scrolling/zooming may occur on touch devices
    canvasObj.style.touchAction = "none";
    canvasObj.id = this.canvasID;
    canvasObj.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
    parentEl.append(canvasObj);

    // Get reference to the created canvas and set its dimensions
    const onScreenCanvas = document.getElementById(this.canvasID);
    onScreenCanvas.width = parentEl.clientWidth;
    onScreenCanvas.height = parentEl.clientHeight;

    // Transfer control to off-screen canvas for worker thread rendering
    const offScreenCanvas = onScreenCanvas.transferControlToOffscreen();
    offScreenCanvas.id = "offScreenCanvas";

    return Promise.resolve({ offScreenCanvas });
  }
}
