const { EventEmitter } = require("events");

const defer = () => new Promise(res => setImmediate(res));
const waitStarted = async ({ __started }, ms) =>
  new Promise(resolve => setTimeout(() => resolve(__started), ms));
const waitStopping = async ({ __stopping }, ms) =>
  new Promise(resolve => setTimeout(() => resolve(__stopping), ms));

class AsyncEmitter extends EventEmitter {
  async _process() {
    throw new Error("must overwrite _process function");
  }

  async process() {
    let result = null;

    try {
      result = await this._process();
    } catch (e) {
      this.emit("error", e);
      this.started = false;
    }

    return result;
  }

  async start(cycle) {
    this.started = true;
    this.emit("start");

    do {
      const result = await this.process();
      this.emit("process", result);
    } while (await this._waitStarted(cycle));

    if (this.stopping) {
      this.stopping = false;
      this.emit("stop");
    }
  }

  async stop(cycle) {
    this.stopping = true;
    this.started = false;
    while (await this._waitStopping(cycle)) {}
  }

  async _waitStarted(cycle = 500) {
    return new Promise(resolve =>
      setTimeout(() => resolve(this.started), cycle)
    );
  }

  async _waitStopping(cycle = 500) {
    return new Promise(resolve => setTimeout(() => resolve(this.stopping), cycle));
  }
}

module.exports = AsyncEmitter;
