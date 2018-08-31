const AsyncEmitter = require("../src/async_emitter.js");

describe("AsyncEmitter", () => {
  it("instantiates", () => {
    const a = new AsyncEmitter();
  });

  it("throws error when _process not defined", async () => {
    let noError = true;
    try {
      const a = new AsyncEmitter();
      await a.process();
    } catch (e) {
      noError = false;
    } finally {
      if (noError) {
        throw new Error("should have errored");
      }
    }
  });

  it("starts and stops in correct order", function(done) {
    this.timeout(5000)
    const a = new AsyncEmitter();
    a._process = async () => new Promise(resolve => setTimeout(resolve, 1000));
    let stopped = false;

    a.start().then(() => {
      stopped = true;
    });

    a.stop().then(() => {
      let res;
      if (!stopped) {
        res = new Error("stop resolved before start");
      }
      done(res);
    });
  });
});
