const { execSync } = require("child_process");
const path = require("path");

const sc2 = require("sc2-sdk");
const StaticServer = require("static-server");
const opn = require("opn");

const jetpack = require("fs-jetpack")
  .cwd(__dirname)
  .dir("..")
  .dir(".tmp");

const NodeClient = require("../src/node.js");
const shared = require("./shared");

let template;

describe("NodeClient", function() {
  this.timeout(60 * 1000 * 10);
  const self = this;
  before(async function() {
    template = jetpack.exists("app.json")
      ? jetpack.read("app.json", "json")
      : {
          app_secret: process.env.STEEM_APP_SECRET,
          app_name: process.env.STEEM_APP_NAME,
          callback_url:
            process.env.STEEM_APP_CALLBACK_URL || "http://localhost:4443"
        };

    jetpack.write("app.json", template);

    if (!(template.app_secret && template.app_name && template.callback_url)) {
      throw new Error(
        "must set process.env.STEEM_APP_SECRET && process.env.STEEM_APP_NAME"
      );
    }

    const client = new NodeClient({
      secret: template.app_secret,
      api: sc2.Initialize({
        app: template.app_name,
        callbackURL: template.callback_url,
        scope: ["vote", "offline", "comment", "custom_json", "delete_comment"]
      })
    });

    client.on("login_required", url => {
      console.log("login required");
      console.log(url);
      this.timeout(120000);
    });

    client.on("status", ({detail}) => {
      console.log("status : ", detail)
    })

    client.addService();

    await client.init();
    console.log("client", client);

    self.client = client;
  });

  shared(self);

  describe("Browser integration", () => {
    before(async () => {
      execSync(
        `${path.join(
          __dirname,
          "..",
          "node_modules",
          ".bin",
          "browserify"
        )} ${path.join(__dirname, "browser", "index.js")} -o ${path.join(
          __dirname,
          "browser",
          "bundle.js"
        )}`
      );

      return new Promise(resolve => {
        const server = new StaticServer({
          rootPath: path.join(__dirname, "browser"),
          port: Number.parseInt(template.callback_url.split(":").pop())
        });

        server.start(async function() {
          opn(template.callback_url);
          resolve();
        });
      });
    });

    it("fulfills order from browser", async () => {
      return new Promise((resolve, reject) => {
        self.client.on("error", reject);
        self.client.on("order", resolve);
      });
    });
  });
});
