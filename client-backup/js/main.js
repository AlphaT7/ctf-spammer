import Canvas from "./main_thread/canvas.js";
import PointerActions from "./main_thread/mainThread-pointerActions.js";

const canvasInstance = new Canvas({
  canvasID: "onScreenCanvas", // ID for the on-screen canvas element
  parentID: "canvasContainer", // ID for the parent container div
});

const { offScreenCanvas } = canvasInstance
  ? await canvasInstance.init()
  : { offScreenCanvas: false };

const offScreenControl = !offScreenCanvas ? [] : [offScreenCanvas];

const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});

const actions = {
  pressAndHold: (action) => {
    console.log(action);
  },
  pointerDrag: (action) => {
    console.log(action);
  },
  pointerTap: (action) => {
    console.log(action);
  },
  swipeRight: (action) => {
    console.log(action);
  },
  swipeLeft: (action) => {
    console.log(action);
  },
  swipeUp: (action) => {
    console.log(action);
  },
  swipeDown: (action) => {
    console.log(action);
  },
  actionUndefined: () => {
    console.trace();
  },
};
const targetElementID = "onScreenCanvas";

const pointerActions = new PointerActions({ worker, targetElementID, actions });

pointerActions.init();

worker.postMessage(
  {
    type: "initialize",
    canvas: offScreenCanvas,
  },
  offScreenControl,
);
