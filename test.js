'use strict'
const PluginZcash = require('.')
const uuid = require('uuid')
const crypto = require('crypto')
const zcash = require('./src/zcash')
const ObjectStore = require('ilp-plugin-shared').ObjStore
const zec = require('bitcoinjs-lib')
const child = require('child_process')
const chalk = require('chalk')

const conf = zcash.getConf()
const USER = conf['rpcuser']
const PASS = conf['rpcpassword']

const ZEC_SCALE = 1e8

console.log("USER", USER, "PASS", PASS)

process.on('unhandledRejection', (err) => {
  console.error(err)
  process.exit(1)
})

const jankyRun = function (command) {
  return new Promise((resolve, reject) => {
    child.exec(command, function (err, stdout, stderr) {
      if (stderr) console.error(stderr)
      if (err) return reject(err)
      console.log('"' + command + '" -> "' + stdout.trim() + '"')
      resolve(stdout.trim())
    })
  })
}

async function run () {
  const timeoutstamp = Math.floor(Date.now() / 1000)

  console.log(chalk.grey('set timeout to ' + timeoutstamp))
  console.log(chalk.grey('generating channel addresses'))
  const secretAlice = '3b6386909838945a840b26c10fc794b1a536ea1ab02c162ecb62d565e24ed94a'
  const secretBob = '80044da2f41364353b173aacc42b8694125cda4636a979105c400e4d6bf4684f'
  const kpA = zcash.secretToKeypair(secretAlice)
  const kpB = zcash.secretToKeypair(secretBob)

  console.log('public key alice:', kpA.getPublicKeyBuffer().toString('hex'))
  console.log('public key bob:', kpB.getPublicKeyBuffer().toString('hex'))
  /*
  const addrAB = zcash.generateP2SH({
    senderKeypair: kpA,
    receiverKeypair: kpB,
    timeout: timeoutstamp,
    network: zec.networks.testnet
  })
  const addrBA = zcash.generateP2SH({
    senderKeypair: kpB,
    receiverKeypair: kpA,
    timeout: timeoutstamp,
    network: zec.networks.testnet
  })

  console.log(chalk.grey('funding channels'))
  const txAB = await jankyRun('zcash-cli -regtest sendtoaddress ' + addrAB + ' 1.00')
  const txBA = await jankyRun('zcash-cli -regtest sendtoaddress ' + addrBA + ' 1.00')

  console.log(chalk.grey('mining fund transactions'))
  await jankyRun('zcash-cli -regtest generate 1')
  */

  console.log(chalk.grey('creating alice'))
  const alice = new PluginZcash({
    _store: new ObjectStore(),
    outgoingAmount: 1 * ZEC_SCALE,
    /*incomingTxId: txBA,
    outgoingTxId: txAB,
    // TODO: maybe these are wrong sometimes
    incomingOutputIndex: 0,
    outgoingOutputIndex: 0,*/
    listener: {port: 7777, secret: 'secret'},
    secret: secretAlice,
    timeout: timeoutstamp,
    network: 'testnet',
    peerPublicKey: kpB.getPublicKeyBuffer().toString('hex'),
    zcashUri: 'http://' + USER + ':' + PASS + '@localhost:18444'
  })

  console.log(chalk.grey('creating bob'))
  const bob = new PluginZcash({
    _store: new ObjectStore(),
    outgoingAmount: 1 * ZEC_SCALE,
    /*incomingTxId: txAB,
    outgoingTxId: txBA,
    // TODO: maybe these are wrong sometimes
    incomingOutputIndex: 0,
    outgoingOutputIndex: 0,*/
    server: 'btp+ws://:secret@127.0.0.1:7777',
    secret: secretBob,
    timeout: timeoutstamp,
    network: 'testnet',
    peerPublicKey: kpA.getPublicKeyBuffer().toString('hex'),
    zcashUri: 'http://' + USER + ':' + PASS + '@localhost:18444'
  })

  console.log(chalk.grey('connecting alice & bob'))
  await Promise.all([
    alice.connect(),
    bob.connect()
  ])

  console.log(chalk.yellow('sending data alice -> bob'))
  bob.registerDataHandler(async (msg) => {
    console.log(chalk.green('bob got message:'), msg.toString())
    return Buffer.from(JSON.stringify({foo: 'baz'}), 'utf8')
  })
  const response = await alice.sendData(Buffer.from(JSON.stringify({foo: 'bar'}), 'utf8'))
  console.log(chalk.green('alice got response:'), response.toString())

  console.log(chalk.yellow('sending money'))
  await alice.sendMoney(0.1 * BTC_SCALE)

  await new Promise((resolve) => setTimeout(resolve, 5000))
  await bob.disconnect()
  await alice.disconnect()

  console.log(chalk.green('done!'))
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
