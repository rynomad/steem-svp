const Bot = require("./bot.js");

class BrowserBot extends Bot {
  static getCredentials() {
    let creds = this.getCredentialsFromLocalStorage();

    if (!creds) {
      creds = this.getCredentialsFromURL();
    }

    if (creds) {
      this.persistCredentials(creds);
    }

    return creds;
  }

  static getCredentialsFromLocalStorage() {
    const access_token = localStorage.getItem("access_token");
    const username = localStorage.getItem("username");
    let expires_at = localStorage.getItem("expires_at");

    if (!expires_at) expires_at = `${Date.now() - 60000}`;

    expires_at = Number.parseInt(expires_at);

    if (expires_at < Date.now()) {
      return null;
    }

    return {
      access_token,
      username,
      expires_at
    };
  }

  static getCredentialsFromURL() {
    const searchparams = new URLSearchParams(document.location.search);
    const access_token = searchparams.get("access_token");
    const username = searchparams.get("username");
    const expires_in = Number.parseInt(searchparams.get("expires_in") || "0");
    const expires_at = expires_in * 1000 + Date.now() - 60000;

    if (expires_at < Date.now()) {
      return null;
    }

    return {
      access_token,
      username,
      expires_at
    };
  }

  static persistCredentials({ access_token, username, expires_at }) {
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("username", username);
    localStorage.setItem("expires_at", expires_at);
  }

  async init() {
    const creds = BrowserBot.getCredentials();
    console.log("CREDS?", creds);
    if (creds) {
      const { access_token, username } = creds;
      this.username = username;
      this.setAccessToken(access_token);
    } else {
      this.login();
    }
    await super.init();
  }

  login() {
    const a = document.createElement("a");
    a.setAttribute("href", this._api.getLoginURL());
    document.body.appendChild(a);
    a.click();
  }
}

module.exports = BrowserBot;
