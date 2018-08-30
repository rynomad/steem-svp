const http = require("http");
const https = require("https");
const url = require('url')
const request = require("request-promise-native");
const jetpack = require("fs-jetpack")
  .cwd(require("os").homedir())
  .dir(".svp");

const Bot = require("./bot.js");

class NodeBot extends Bot {
  constructor({ port = 4443, certfile, keyfile, secret, ...options }) {
    super(options);

    if (!secret) {
      throw new Error("node bot requires app secret");
    }

    if (certfile && keyfile) {
      this._cert = fs.readFileSync(certfile);
      this._key = fs.readFileSync(keyfile);
    }

    this._port = port;
    this._secret = secret;
    this._credentials = {};
    this._data = jetpack.dir(options.api.options.app);
  }

  get loginURL() {
    return `${super.loginURL}&response_type=code`;
  }

  async init() {
    if (!this._data.exists("credentials.json")) {
      await this.listenForCredentials();
    }

    const credentials = this._data.read("credentials.json", "json");
    
    this.persistCredentials(JSON.stringify(credentials));

    if (credentials.expires_at < Date.now() - 60 * 60 * 1000) {
      await this.refreshToken();
    }

    this.setAccessToken(this._credentials.access_token);

    await super.init()
  }

  async listenForCredentials() {
    return new Promise((resolve, reject) => {
      const listener = async (request, response) => {
        const {
          query: { code }
        } = url.parse(request.url, true);

        if (!code) {
          response.statusCode = 500;
          response.statusMessage = "Bad Request";
          response.end();
          return;
        }

        this.persistCredentials(JSON.stringify({ code }));
        await this.requestToken();
        response.statusCode = 200;
        response.end(() => {
          this.server.close(() => {
            delete this.server;
            resolve();
          });
        });
      };

      if (this._cert) {
        this.server = https.createServer(
          {
            cert: this._cert,
            key: this._key
          },
          listener
        );
      } else {
        this.server = http.createServer(listener);
      }

      this.server.on("error", reject);
      this.server.listen(this._port);
      this.emit('login_required', this.loginURL)
    });
  }

  async requestToken() {
    const credential_string = await request.get(
      `https://steemconnect.com/api/oauth2/token?code=${
        this._credentials.code
      }&client_secret=${this._secret}`
    );

    this.persistCredentials(credential_string);
  }

  persistCredentials(credentials_string) {
    const credentials = JSON.parse(credentials_string);

    if (this.username && credentials.username !== this.username) {
      throw new Error(
        `username '${credentials.username}' !== '${this.username}'`
      );
    }

    this.username = credentials.username;

    this._credentials = {
      ...this._credentials,
      ...credentials
    };

    this._data.write("credentials.json", this._credentials);
  }

  async refreshToken() {
    const credential_string = await request.get(
      `https://steemconnect.com/api/oauth2/token?refresh_token=${
        this._credentials.refresh_token
      }&grant_type=refresh_token&client_secret=${this._secret}`
    );

    this.persistCredentials(credential_string);
  }
}

module.exports = NodeBot;
