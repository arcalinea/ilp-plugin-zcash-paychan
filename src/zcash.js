'use strict'

// Make sure npm install used zcash branches of bitcoinjs-lib and bitcoin-core
const zcashjs = require('bitcoinjs-lib')
const BigInteger = require('bigi')
const ZcashClient = require('bitcoin-core')
const url = require('url')

const ZEC_SCALE = 1e8
const DEFAULT_FEE = 1e5
const FINAL_SEQUENCE = 0xfffffffe
const HASH_ALL = 1

function getClient ({ uri, network }) {
  const _uri = url.parse(uri)
  const [ user, pass ] = _uri.auth.split(':')

  return new ZcashClient({
    network: network,
    host: _uri.hostname,
    ssl: ((uri.protocol === 'https:')
      ? { enabled: true, strict: true }
      : false),
    username: user,
    password: pass
  })
}

async function getTx (client, txid) {
  const tx = await client.command('getrawtransaction', txid)
  return zcashjs.Transaction.fromBuffer(Buffer.from(tx, 'hex'))
}

function publicKeyToAddress (publicKey) {
  return zcashjs.ECPair
    .fromPublicKeyBuffer(Buffer.from(publicKey, 'hex'), zcashjs.networks.testnet)
    .getAddress()
}

function scriptToOut (script) {
  return zcashjs.script.scriptHashOutput(zcashjs.crypto.hash160(script))
}

async function submit (client, transactionHex) {
  console.log('submitting raw transaction to zcash')
  const txid = await client.command('sendrawtransaction', transactionHex, true)
  console.log('submitted with txid:', txid)
}

async function createTx ({
  client,
  script,
  amount
}) {
  const address = scriptToP2SH({ script, network: zcashjs.networks.testnet })
  console.log('sending to address', address, 'with amount', amount)
  return await client.command('sendtoaddress', address, amount / ZEC_SCALE)
}

function scriptToP2SH ({
  script,
  network
}) {
  const scriptPubKey = zcashjs.script.scriptHashOutput(zcashjs.crypto.hash160(script))
  return zcashjs.address.fromOutputScript(scriptPubKey, network)
}

function generateP2SH ({
  senderKeypair,
  receiverKeypair,
  timeout,
  network
}) {
  const script = generateScript({
    senderKeypair,
    receiverKeypair,
    timeout,
    network
  })

  return scriptToP2SH({ script, network })
}

function generateRawClosureTx ({
  receiverKeypair,
  senderKeypair,
  txid,
  outputIndex,
  claimAmount,
  changeAmount,
  fee
}) {
  // TODO: is this an appropriate fee?
  // TODO: support other networks
  const _fee = fee || DEFAULT_FEE
  const tx = new zcashjs.TransactionBuilder(zcashjs.networks.testnet)

  tx.addInput(txid, outputIndex)
  tx.addOutput(receiverKeypair.getAddress(), +claimAmount)
  tx.addOutput(senderKeypair.getAddress(), +changeAmount - _fee)

  return tx.buildIncomplete()
}

function generateExpireTx ({
  senderKeypair,
  txid,
  outputIndex,
  timeout,
  amount,
  fee
}) {
  const _fee = fee || DEFAULT_FEE
  const tx = new zcashjs.TransactionBuilder(zcashjs.networks.testnet)

  tx.setLockTime(timeout)
  tx.addInput(txid, outputIndex, FINAL_SEQUENCE)
  tx.addOutput(senderKeypair.getAddress(), amount - _fee)

  return tx.buildIncomplete()
}

function getTxHash (transaction, redeemScript) {
  const inputIndex = 0
  return transaction.hashForSignature(inputIndex, redeemScript, HASH_ALL)
}

function getClosureTxSigned ({
  keypair,
  redeemScript,
  transaction
}) {
  const inputIndex = 0
  const hash = getTxHash(transaction, redeemScript)
  return keypair
    .sign(hash)
    .toScriptSignature(HASH_ALL)
    .toString('hex')
}

function generateScript ({
  senderKeypair,
  receiverKeypair,
  timeout,
  network
}) {
  if (!timeout) throw new Error('script requires a timeout, got: ' + timeout)
  return zcashjs.script.compile([
    zcashjs.opcodes.OP_IF,
    zcashjs.script.number.encode(timeout),
    zcashjs.opcodes.OP_CHECKLOCKTIMEVERIFY,
    zcashjs.opcodes.OP_DROP,

    zcashjs.opcodes.OP_ELSE,
    receiverKeypair.getPublicKeyBuffer(),
    zcashjs.opcodes.OP_CHECKSIGVERIFY,
    zcashjs.opcodes.OP_ENDIF,

    senderKeypair.getPublicKeyBuffer(),
    zcashjs.opcodes.OP_CHECKSIG
  ])
}

function secretToKeypair (secret) {
  return new zcashjs.ECPair(
    BigInteger.fromBuffer(Buffer.from(secret, 'hex')),
    null,
    { network: zcashjs.networks.testnet })
}

function publicToKeypair (publicKey) {
  return zcashjs.ECPair
    .fromPublicKeyBuffer(Buffer.from(publicKey, 'hex'), zcashjs.networks.testnet)
}

module.exports = {
  publicKeyToAddress,
  generateP2SH,
  generateRawClosureTx,
  generateExpireTx,
  getClosureTxSigned,
  generateScript,
  secretToKeypair,
  publicToKeypair,
  getClient,
  getTx,
  scriptToOut,
  getTxHash,
  createTx,
  submit
}
