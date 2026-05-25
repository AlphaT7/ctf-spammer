import GameState from "./worker_thread/game-state.js";
import WorkerPointerActions from "./worker_thread/workerThread-pointerActions.js";
import TemporalLoop from "./worker_thread/temporal-loop.js";

let temporalObjects = {};

let GameStatus = {
  WorkerPointerActions: new WorkerPointerActions({ worker: self }),
  GameState: new GameState(temporalObjects),
};

async function workerThreadImports(canvas) {}

onmessage = async (e) => {
  switch (e.data.type) {
    case "initialize": {
      const canvas = e.data.canvas || null;
      await workerThreadImports(canvas);
      new TemporalLoop({ canvas, temporalObjects }).start();
      break;
    }

    // case "pluginData": {
    //   const { workerObjectName, objectMethodName, methodParameters } =
    //     e.data.pluginData;

    //   temporalObjects[workerObjectName][objectMethodName](methodParameters);
    //   break;
    // }

    case "pointerData": {
      const { workerObjectName, objectMethodName, methodParameters } =
        e.data.pointerData;

      console.log(e.data.pointerData);
      GameStatus.GameState.createFlagSeaker(methodParameters);
      break;
    }

    default:
      console.trace("Unknown message type:", e.data.type);
      break;
  }
};
