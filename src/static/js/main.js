var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// node_modules/@yandeu/events/lib/version.js
var VERSION = "0.0.7";

// node_modules/@yandeu/events/lib/index.js
var EE = class {
  constructor(fn, context, once = false) {
    __publicField(this, "fn");
    __publicField(this, "context");
    __publicField(this, "once");
    this.fn = fn;
    this.context = context;
    this.once = once;
  }
};
var addListener = (emitter, event, fn, context, once) => {
  if (typeof fn !== "function") {
    throw new TypeError("The listener must be a function");
  }
  const listener = new EE(fn, context || emitter, once);
  if (!emitter._events.has(event))
    emitter._events.set(event, listener), emitter._eventsCount++;
  else if (!emitter._events.get(event).fn)
    emitter._events.get(event).push(listener);
  else
    emitter._events.set(event, [emitter._events.get(event), listener]);
  return emitter;
};
var clearEvent = (emitter, event) => {
  if (--emitter._eventsCount === 0)
    emitter._events = /* @__PURE__ */ new Map();
  else
    emitter._events.delete(event);
};
var Events = class {
  constructor() {
    __publicField(this, "_events", /* @__PURE__ */ new Map());
    __publicField(this, "_eventsCount", 0);
  }
  static get VERSION() {
    return VERSION;
  }
  eventNames() {
    return Array.from(this._events.keys());
  }
  listeners(event) {
    const handlers = this._events.get(event);
    if (!handlers)
      return [];
    if (handlers.fn)
      return [handlers.fn];
    for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
      ee[i] = handlers[i].fn;
    }
    return ee;
  }
  listenerCount(event) {
    const listeners = this._events.get(event);
    if (!listeners)
      return 0;
    if (listeners.fn)
      return 1;
    return listeners.length;
  }
  emit(event, ...args) {
    if (!this._events.has(event))
      return false;
    const listeners = this._events.get(event);
    let i;
    if (listeners.fn) {
      if (listeners.once)
        this.removeListener(event, listeners.fn, void 0, true);
      return listeners.fn.call(listeners.context, ...args), true;
    } else {
      const length = listeners.length;
      for (i = 0; i < length; i++) {
        if (listeners[i].once)
          this.removeListener(event, listeners[i].fn, void 0, true);
        listeners[i].fn.call(listeners[i].context, ...args);
      }
    }
    return true;
  }
  on(event, fn, context) {
    return addListener(this, event, fn, context, false);
  }
  once(event, fn, context) {
    return addListener(this, event, fn, context, true);
  }
  removeListener(event, fn, context, once) {
    if (!this._events.has(event))
      return this;
    if (!fn) {
      clearEvent(this, event);
      return this;
    }
    const listeners = this._events.get(event);
    if (listeners.fn) {
      if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) {
        clearEvent(this, event);
      }
    } else {
      for (var i = 0, events = [], length = listeners.length; i < length; i++) {
        if (listeners[i].fn !== fn || once && !listeners[i].once || context && listeners[i].context !== context) {
          events.push(listeners[i]);
        }
      }
      if (events.length)
        this._events.set(event, events.length === 1 ? events[0] : events);
      else
        clearEvent(this, event);
    }
    return this;
  }
  removeAllListeners(event) {
    if (event) {
      if (this._events.delete(event))
        clearEvent(this, event);
    } else {
      this._events = /* @__PURE__ */ new Map();
      this._eventsCount = 0;
    }
    return this;
  }
  // alias
  get off() {
    return this.removeListener;
  }
  // alias
  get addListener() {
    return this.on;
  }
};

// node_modules/@geckos.io/common/lib/bridge.js
var Bridge = class {
  constructor() {
    this.eventEmitter = new Events();
  }
  emit(eventName, data, connection = {}) {
    this.eventEmitter.emit(eventName, data, connection);
  }
  on(eventName, cb) {
    return this.eventEmitter.on(eventName, (data, options) => {
      cb(data, options);
    });
  }
  removeAllListeners() {
    this.eventEmitter.removeAllListeners();
  }
};
var bridge = new Bridge();

// node_modules/@geckos.io/common/lib/constants.js
var EVENTS = {
  CONNECT: "connect",
  CONNECTION: "connection",
  DATA_CHANNEL_IS_OPEN: "dataChannelIsOpen",
  DISCONNECT: "disconnect",
  DISCONNECTED: "disconnected",
  DROP: "dropped",
  ERROR: "error",
  RAW_MESSAGE: "rawMessage",
  RECEIVED_FROM_DATA_CHANNEL: "receiveFromDataChannel",
  SEND_OVER_DATA_CHANNEL: "sendOverDataChannel"
};
var ERRORS = {
  BROWSER_NOT_SUPPORTED: "BROWSER_NOT_SUPPORTED",
  COULD_NOT_PARSE_MESSAGE: "COULD_NOT_PARSE_MESSAGE",
  DROPPED_FROM_BUFFERING: "DROPPED_FROM_BUFFERING",
  MAX_MESSAGE_SIZE_EXCEEDED: "MAX_MESSAGE_SIZE_EXCEEDED"
};

// node_modules/@geckos.io/common/lib/types.js
var ArrayBufferView = Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array())).constructor;

// node_modules/@geckos.io/common/lib/helpers.js
var tick = typeof Promise == "function" ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout;
var isStringMessage = (data) => {
  return typeof data === "string";
};
var isBufferMessage = (data) => {
  return data instanceof ArrayBuffer || data instanceof ArrayBufferView;
};
var isJSONMessage = (data) => {
  try {
    if (typeof data !== "string")
      return false;
    if (!isNaN(parseInt(data)))
      return false;
    JSON.parse(data);
    return true;
  } catch (error) {
    return false;
  }
};

// node_modules/@geckos.io/common/lib/parseMessage.js
var ParseMessage = (ev) => {
  let { data } = ev;
  if (!data)
    data = ev;
  const isBuffer = isBufferMessage(data);
  const isJson = isJSONMessage(data);
  const isString = isStringMessage(data);
  if (isJson) {
    const object = JSON.parse(data);
    const key = Object.keys(object)[0];
    const value = object[key];
    return { key, data: value };
  }
  if (isBuffer) {
    return { key: EVENTS.RAW_MESSAGE, data };
  }
  if (isString) {
    return { key: EVENTS.RAW_MESSAGE, data };
  }
  return { key: "error", data: new Error(ERRORS.COULD_NOT_PARSE_MESSAGE) };
};

// node_modules/@geckos.io/common/lib/sendMessage.js
var SendMessage = (dataChannel, maxMessageSize, eventName, data = null) => {
  var _a;
  const send = (data2, isBuffer) => {
    var _a2;
    const bytes = (_a2 = data2.byteLength) !== null && _a2 !== void 0 ? _a2 : data2.length * 2;
    if (typeof maxMessageSize === "number" && bytes > maxMessageSize) {
      throw new Error(`maxMessageSize of ${maxMessageSize} exceeded`);
    } else {
      Promise.resolve().then(() => {
        if (dataChannel.send)
          dataChannel.send(data2);
        else {
          if (!isBuffer)
            dataChannel.sendMessage(data2);
          else
            dataChannel.sendMessageBinary(Buffer.from(data2));
        }
      }).catch((error) => {
        console.log("error", error);
      });
    }
  };
  if (!dataChannel)
    return;
  if (dataChannel.readyState === "open" || ((_a = dataChannel.isOpen) === null || _a === void 0 ? void 0 : _a.call(dataChannel))) {
    try {
      if (eventName === EVENTS.RAW_MESSAGE && data !== null && (isStringMessage(data) || isBufferMessage(data))) {
        send(data, isBufferMessage(data));
      } else {
        send(JSON.stringify({ [eventName]: data }), false);
      }
    } catch (error) {
      console.error("Error in sendMessage.ts: ", error.message);
      return error;
    }
  }
};

// node_modules/@geckos.io/client/lib/wrtc/connectionsManager.js
var ConnectionsManagerClient = class {
  emit(eventName, data = null) {
    SendMessage(this.dataChannel, this.maxMessageSize, eventName, data);
  }
  constructor(url, authorization, label, rtcConfiguration) {
    this.url = url;
    this.authorization = authorization;
    this.label = label;
    this.rtcConfiguration = rtcConfiguration;
    this.bridge = new Bridge();
    this.onDataChannel = (ev) => {
      const { channel: channel2 } = ev;
      if (channel2.label !== this.label)
        return;
      this.dataChannel = channel2;
      this.dataChannel.binaryType = "arraybuffer";
      this.dataChannel.onmessage = (ev2) => {
        const { key, data } = ParseMessage(ev2);
        this.bridge.emit(key, data);
      };
    };
  }
  // fetch additional candidates
  async fetchAdditionalCandidates(host, id) {
    var _a;
    if (((_a = this.dataChannel) === null || _a === void 0 ? void 0 : _a.readyState) === "closed")
      return;
    const res = await fetch(`${host}/connections/${id}/additional-candidates`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (res.ok) {
      const candidates = await res.json();
      candidates.forEach((c) => {
        this.localPeerConnection.addIceCandidate(c);
      });
    }
  }
  async connect() {
    const host = `${this.url}/.wrtc/v2`;
    let headers = { "Content-Type": "application/json" };
    if (this.authorization)
      headers = { ...headers, ["Authorization"]: this.authorization };
    let userData = {};
    try {
      const res = await fetch(`${host}/connections`, {
        method: "POST",
        headers
      });
      if (res.status >= 300) {
        throw {
          name: "Error",
          message: `Connection failed with status code ${res.status}.`,
          status: res.status,
          statusText: res.statusText
        };
      }
      const json = await res.json();
      userData = json.userData;
      this.remotePeerConnection = json;
    } catch (error) {
      console.error(error.message);
      return { error };
    }
    const { id, localDescription } = this.remotePeerConnection;
    const configuration = {
      // @ts-ignore
      sdpSemantics: "unified-plan",
      ...this.rtcConfiguration
    };
    const RTCPc = RTCPeerConnection || webkitRTCPeerConnection;
    this.localPeerConnection = new RTCPc(configuration);
    const showBackOffIntervals = (attempts = 10, initial = 50, factor = 1.8, jitter = 20) => Array(attempts).fill(0).map((_, index) => parseInt((initial * factor ** index).toString()) + parseInt((Math.random() * jitter).toString()));
    showBackOffIntervals().forEach((ms) => {
      setTimeout(() => {
        this.fetchAdditionalCandidates(host, id).catch(() => {
        });
      }, ms);
    });
    try {
      await this.localPeerConnection.setRemoteDescription(localDescription);
      this.localPeerConnection.addEventListener("datachannel", this.onDataChannel, { once: true });
      const originalAnswer = await this.localPeerConnection.createAnswer();
      const updatedAnswer = new RTCSessionDescription({
        type: "answer",
        sdp: originalAnswer.sdp
      });
      await this.localPeerConnection.setLocalDescription(updatedAnswer);
      try {
        await fetch(`${host}/connections/${id}/remote-description`, {
          method: "POST",
          body: JSON.stringify(this.localPeerConnection.localDescription),
          headers: {
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        console.error(error.message);
        return { error };
      }
      const waitForDataChannel = () => {
        return new Promise((resolve) => {
          this.localPeerConnection.addEventListener("datachannel", () => {
            resolve();
          }, { once: true });
        });
      };
      if (!this.dataChannel)
        await waitForDataChannel();
      return {
        userData,
        localPeerConnection: this.localPeerConnection,
        dataChannel: this.dataChannel,
        id
      };
    } catch (error) {
      console.error(error.message);
      this.localPeerConnection.close();
      return { error };
    }
  }
};

// node_modules/@geckos.io/client/lib/wrtc/peerConnection.js
var PeerConnection = class {
  async connect(connectionsManager) {
    const webRTCPcSupported = RTCPeerConnection || webkitRTCPeerConnection;
    if (webRTCPcSupported) {
      const { localPeerConnection, dataChannel, id, userData, error } = await connectionsManager.connect();
      if (error)
        return { error };
      if (!localPeerConnection || !dataChannel || !id || !userData)
        return { error: new Error('Something went wrong in "await connectionsManager.connect()"') };
      this.localPeerConnection = localPeerConnection;
      this.dataChannel = dataChannel;
      this.id = id;
      return { userData };
    } else {
      const error = new Error(ERRORS.BROWSER_NOT_SUPPORTED);
      console.error(error.message);
      return { error };
    }
  }
};

// node_modules/@geckos.io/common/lib/makeRandomId.js
var makeRandomId = (length = 24) => {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    id += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return id;
};

// node_modules/@geckos.io/common/lib/runInterval.js
var runInterval = (interval = 200, runs = 1, cb) => {
  let counter = 0;
  if (typeof cb !== "function") {
    console.error("You have to define your callback function!");
    return;
  }
  const i = setInterval(() => {
    cb();
    counter++;
    if (counter === runs - 1) {
      clearInterval(i);
    }
  }, interval);
  cb();
};

// node_modules/@geckos.io/common/lib/reliableMessage.js
var makeReliable = (options, cb) => {
  const { interval = 150, runs = 10 } = options;
  const id = makeRandomId(24);
  runInterval(interval, runs, () => {
    cb(id);
  });
};

// node_modules/@geckos.io/client/lib/geckos/channel.js
var ClientChannel = class {
  constructor(url, authorization, port, label, rtcConfiguration) {
    this.userData = {};
    this.receivedReliableMessages = [];
    this.url = port ? `${url}:${port}` : url;
    this.connectionsManager = new ConnectionsManagerClient(this.url, authorization, label, rtcConfiguration);
    this.bridge = this.connectionsManager.bridge;
    this.bridge.on(EVENTS.DISCONNECTED, () => this.bridge.removeAllListeners());
  }
  onconnectionstatechange() {
    const lpc = this.peerConnection.localPeerConnection;
    lpc.onconnectionstatechange = () => {
      if (lpc.connectionState === "disconnected" || lpc.connectionState === "closed")
        this.bridge.emit(EVENTS.DISCONNECTED);
    };
  }
  /** Get the channel's id. */
  get id() {
    return this.peerConnection.id;
  }
  /** Close the WebRTC connection */
  close() {
    this.peerConnection.localPeerConnection.close();
    this.bridge.emit(EVENTS.DISCONNECTED);
    try {
      const host = `${this.url}/.wrtc/v2`;
      fetch(`${host}/connections/${this.id}/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      console.error(error.message);
    }
  }
  /** Emit a message to the server. */
  emit(eventName, data = null, options) {
    if (options && options.reliable) {
      makeReliable(options, (id) => this.connectionsManager.emit(eventName, {
        MESSAGE: data,
        RELIABLE: 1,
        ID: id
      }));
    } else {
      this.connectionsManager.emit(eventName, data);
    }
  }
  /** Emit a raw message to the server */
  get raw() {
    return {
      /**
       * Emit a raw message.
       * @param rawMessage The raw message. Can be of type 'USVString | ArrayBuffer | ArrayBufferView'
       */
      emit: (rawMessage) => this.emit(EVENTS.RAW_MESSAGE, rawMessage)
    };
  }
  /**
   * Listen for a raw message from the server.
   * @param callback The event callback.
   */
  onRaw(callback) {
    this.bridge.on(EVENTS.RAW_MESSAGE, (rawMessage) => {
      const cb = (rawMessage2) => callback(rawMessage2);
      cb(rawMessage);
    });
  }
  /**
   * Listen for the connect event.
   * @param callback The event callback.
   */
  async onConnect(callback) {
    var _a;
    this.peerConnection = new PeerConnection();
    const response = await this.peerConnection.connect(this.connectionsManager);
    if (response.error)
      callback(response.error);
    else {
      if (response.userData)
        this.userData = response.userData;
      this.maxMessageSize = this.connectionsManager.maxMessageSize = (_a = this.peerConnection.localPeerConnection.sctp) === null || _a === void 0 ? void 0 : _a.maxMessageSize;
      this.onconnectionstatechange();
      callback();
    }
  }
  /**
   * Listen for the disconnect event.
   * @param callback The event callback.
   */
  onDisconnect(callback) {
    this.bridge.on(EVENTS.DISCONNECTED, callback);
  }
  /**
   * Listen for a message from the server.
   * @param eventName The event name.
   * @param callback The event callback.
   */
  on(eventName, callback) {
    this.bridge.on(eventName, (data) => {
      const isReliableMessage = data && data.RELIABLE === 1 && data.ID !== "undefined";
      const expireTime = 15e3;
      const deleteExpiredReliableMessages = () => {
        const currentTime = (/* @__PURE__ */ new Date()).getTime();
        this.receivedReliableMessages.forEach((msg, index, object) => {
          if (msg.expire <= currentTime) {
            object.splice(index, 1);
          }
        });
      };
      if (isReliableMessage) {
        deleteExpiredReliableMessages();
        if (this.receivedReliableMessages.filter((obj) => obj.id === data.ID).length === 0) {
          this.receivedReliableMessages.push({
            id: data.ID,
            timestamp: /* @__PURE__ */ new Date(),
            expire: (/* @__PURE__ */ new Date()).getTime() + expireTime
          });
          callback(data.MESSAGE);
        } else {
        }
      } else {
        callback(data);
      }
    });
  }
};
var geckosClient = (options = {}) => {
  const { authorization = void 0, iceServers = [], iceTransportPolicy = "all", label = "geckos.io", port = 9208, url = `${location.protocol}//${location.hostname}` } = options;
  return new ClientChannel(url, authorization, port, label, { iceServers, iceTransportPolicy });
};
var channel_default = geckosClient;

// node_modules/@geckos.io/client/lib/index.js
var lib_default = channel_default;

// src/static/js/client-entry.js
var $ = (sel) => document.querySelector(sel);
var btnNewGame = $("#btn-new-game");
var btnJoinSmall = $("#btn-join-small");
var gameList = $("#game-list");
var connStatus = $("#connection-status");
var games = [];
var channel = lib_default({ port: 3e3 });
channel.onConnect((error) => {
  if (error) {
    connStatus.textContent = "CONNECTION ERROR";
    connStatus.style.color = "var(--accent-red)";
    console.error(error);
    return;
  }
  connStatus.textContent = "CONNECTED";
  connStatus.style.color = "var(--accent-green)";
});
channel.onDisconnect(() => {
  connStatus.textContent = "DISCONNECTED";
  connStatus.style.color = "var(--accent-red)";
});
channel.on("game-list", (data) => {
  games.length = 0;
  games.push(...data);
  renderGameList();
});
channel.on("game-created", (data) => {
  location.href = `/game.html?id=${data.id}`;
});
channel.on("game-joined", (data) => {
  location.href = `/game.html?id=${data.id}`;
});
channel.on("join-error", (data) => {
  connStatus.textContent = `ERROR: ${data.message}`;
  connStatus.style.color = "var(--accent-red)";
});
function renderGameList() {
  gameList.innerHTML = "";
  if (games.length === 0) {
    gameList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">\u25C8</span>
        <span>No games detected</span>
      </div>
    `;
    return;
  }
  for (const g of games) {
    const el = document.createElement("div");
    el.className = "game-item";
    el.dataset.gameId = g.id;
    el.innerHTML = `
      <label class="game-radio">
        <input type="radio" name="selected-game" value="${g.id}" />
        <span class="radio-dot"></span>
      </label>
      <div class="game-info">
        <div class="game-name">${g.name}</div>
        <div class="game-meta">host: ${g.host}</div>
      </div>
      <div class="game-players">${g.players}/${g.maxPlayers}</div>
    `;
    el.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") {
        el.querySelector("input").checked = true;
      }
    });
    gameList.appendChild(el);
  }
}
function joinGame(gameId) {
  channel.emit("join-game", { gameId });
  connStatus.textContent = "JOINING...";
  connStatus.style.color = "var(--accent-cyan)";
}
btnNewGame.addEventListener("click", () => {
  connStatus.textContent = "CREATING GAME...";
  connStatus.style.color = "var(--accent-cyan)";
  channel.emit("new-game");
});
var doJoin = () => {
  const checked = document.querySelector('input[name="selected-game"]:checked');
  if (!checked) return;
  joinGame(checked.value);
};
btnJoinSmall.addEventListener("click", doJoin);
renderGameList();
/*! Bundled license information:

@yandeu/events/lib/index.js:
  (**
   * @package      npmjs.com/package/@yandeu/events (events.min.js)
   *
   * @author       Arnout Kazemier (https://github.com/3rd-Eden)
   * @copyright    Copyright (c) 2014 Arnout Kazemier
   * @license      {@link https://github.com/primus/eventemitter3/blob/master/LICENSE|MIT}
   *
   * @author       Yannick Deubel (https://github.com/yandeu)
   * @copyright    Copyright (c) 2021 Yannick Deubel; Project Url: https://github.com/yandeu/events
   * @license      {@link https://github.com/yandeu/events/blob/master/LICENSE|MIT}
   *)
*/
