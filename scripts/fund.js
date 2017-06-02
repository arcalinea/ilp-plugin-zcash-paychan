'use strict'

const bitcoinjs = require('bitcoinjs-lib')
const zcash = require('../src/zcash')
const [ , , senderPublicKey, receiverPublicKey, timeout, network ] = process.argv

if (process.argv.length < 5) {
  console.error('usage: node fund.js',
    '<senderPublicKey> <receiverPublicKey> <timeout> [network]')
  process.exit(1)
}

const senderKeypair = zcash.publicToKeypair(senderPublicKey)
const receiverKeypair = zcash.publicToKeypair(receiverPublicKey)

try {
  console.log('sender to receiver channel:', zcash.generateP2SH({
    senderKeypair,
    receiverKeypair,
    timeout: +timeout,
    network: bitcoinjs.networks[network]
  }))

  console.log('receiver to sender channel:', zcash.generateP2SH({
    senderKeypair: receiverKeypair,
    receiverKeypair: senderKeypair,
    timeout: +timeout,
    network: bitcoinjs.networks[network]
  }))
} catch (e) {
  console.error(e)
}
