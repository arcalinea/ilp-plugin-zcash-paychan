# ilp-plugin-zcash-paychan
> Interledger.js Ledger Plugin for Zcash using CLTV Payment Channels

<a href="https://z.cash"><img src="./images/zcash.png" alt="Zcash" height="50px" /></a><img height="45" hspace="5" /><img src="./images/plus.png" height="45" /><img height="45" hspace="5" /><a href="https://interledger.org"><img src="./images/interledgerjs.png" alt="Interledger.js" height="50px" /></a>


This plugin enables [Interledger](https://interledger.org) payments through [Zcash](https://z.cash) using simple payment channels.

`ilp-plugin-zcash-paychan` implements the [Interledger.js Ledger Plugin Interface Version 2](https://github.com/interledger/rfcs/blob/master/0024-ledger-plugin-interface-2/0024-ledger-plugin-interface-2.md), which allows Zcash to be used with [`ilp` client](https://github.com/interledgerjs/ilp) and the [`ilp-connector`](https://github.com/interledgerjs/ilp-connector).

## Installation

**Dependencies:**

- Node.js >=v7.10.0
- Zcash Node

**Setup:**

```sh
git clone https://github.com/arcalinea/ilp-plugin-zcash-paychan.git
cd ilp-plugin-zcash-paychan
npm install
```

**RPC Auth**

You can use the getConf() function in the zcash module to get your zcash.conf file options as a json object "conf". Use this or some other method to set username and password for RPC authentication. 

## How It Works

`ilp-plugin-zcash-paychan` uses simple unidirectional Zcash payment channels implemented with [CHECKLOCKTIMEVERIFY (CLTV)](https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki). While the underlying channel is not conditional (i.e. does not use hashlocks), the plugin only sends updates to the channel when it receives the fulfillment from the other party. This means that payments that there is some risk for payments that are in flight. However, the Interledger Protocol isolates participants from risk from indirect peers.

By implementing all of the functions required by the [Ledger Plugin Interface Version 2](https://github.com/interledger/rfcs/blob/master/0024-ledger-plugin-interface-2/0024-ledger-plugin-interface-2.md), this allows Zcash to be used by standard Interledger.js components.

For more information about how Interledger works, see [IL-RFC 1: Interledger Architecture](https://github.com/interledger/rfcs/blob/master/0001-interledger-architecture/0001-interledger-architecture.md).
