Steem-SVP (Steem Vote Payments)
====
Build bots, get paid in steem votes, in node.js and the browser

Premise
---

The Steem blockchain allows us to award our peers with a portion of minted currency according to our votes. What if we could build bots that provided valuable services in exchange for a certain number of these votes? Perhaps a WebRTC TURN server or an on-demand ffmpeg transcoder. Maybe even earn some steem by donating your browser to run unit and functional tests for other developers?

How It Works
---
The core of an SVP bot is a thin wrapper around steemconnect and the official steem api, that provides async/await access to the relevant functions of both (as well as retries when you run into rate limiting). This is coupled with a data model for posting service definitions to the steem blockchain, and listening for votes on those service definitions. When a bot recieves votes on it's service definition, it posts an encrypted reply to the customers 'delivery' post. All this detail is abstracted away in the library however. To make a steembot:

```javascript
// the bot
const Bot = require('steem-svp')
const sc2 = require('sc2-sdk')

const api = sc2.Initialize({
  app : 'my.app',
  callbackURL : 'http://example.com',
  ...standardSteemconnectOptions
})

const app = new Bot({
  api
})

app.addService({
  name : 'Echo',
  description : 'This bot sends the buyers username back to them',
  provider : async (buyer_username) => ({buyer_username})
})

app.init().then(() => app.start()).then(() => {
  console.log('app stopped')
})

// the client

const Client = require('steem-svp') // bot and client are the same class, pure p2p design

const api = sc2.Initialize({
  app : 'my.app',
  callbackURL : 'http://example.com',
  ...standardSteemconnectOptions
})

const app = new Client({api})

app.init().then(async () => {
  const service_definitions = app.findServices('Echo')
  const echo = await app.purchase(service_definitions[0])
  assert(echo.buyer_username === app.username)
})

```

Initializing with Steemconnect
---

In addition to providing wrappers over the steemconnect functionality, steem-svp provides a simple storage abstraction for node and the browser to help bootstrap integration with sc2 access tokens. the `init` function will detect whether the provided steemconnect api has credentials, and either set up a server to listen for the Oauth redirect (in node), or redirect the client (in browser) to bootstrap access.


Testing
---

The best way to get an understandign of both the node and browser provisioning flows is to run the tests, they will prompt you to provide the necessary input. At minimum, you'll need a steemconnect app and secret, and two dedicated steem accounts to test with when prompted to login (one for the server, one for the browser). 

```bash
npm install
npm run test
```

Feedback and Contributions
---
This is very much an exploratory project for me. I hope it is useful but it's very much alpha software. Contributions are much appreciated. I have this repo configured for use with commitizen, and that would help greatly, but all contributions made in good faith will be considered.