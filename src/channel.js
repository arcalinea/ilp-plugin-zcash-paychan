const url = require('url')
const shared = require('ilp-plugin-shared')
const zcash = require('./zcash')
const BigInteger = require('bigi')
const zcashjs = require('bitcoinjs-lib')
const debug = require('debug')('ilp-plugin-zcash-paychan:channel')

module.exports = class Channel {
  constructor ({
    uri,
    store,
    secret,
    senderPublicKey,
    receiverPublicKey,
    timeout,
    network,
    amount,
    outputIndex
  }) {
    this._secret = secret
    if (senderPublicKey) {
      this._receiverKeypair = zcash.secretToKeypair(this._secret)
      this._senderKeypair = zcash.publicToKeypair(senderPublicKey)
      this._incoming = true
    } else {
      this._senderKeypair = zcash.secretToKeypair(this._secret)
      this._receiverKeypair = zcash.publicToKeypair(receiverPublicKey)
      this._amount = amount
      this._incoming = false
    }

    this._timeout = timeout
    this._network = network
    this._zcashUri = url.parse(uri)
    this._balance = new shared.Balance({
      store,
      maximum: amount || 0,
      key: this._incoming ? 'incoming' : 'outgoing'
    })
  }

  async connect () {
    await this._balance.connect()

    this._client = zcash.getClient({
      uri: this._zcashUri,
      network: this._network
    })

    this._redeemScript = zcash.generateScript({
      senderKeypair: this._senderKeypair,
      receiverKeypair: this._receiverKeypair,
      timeout: this._timeout,
      // network: this._network
      network: zcashjs.networks.testnet
    })
  }

  async createChannel () {
    const txidIndex = 'channel_' + this._incoming ? 'i':'o'
    this._txid = await this._store.get(txidIndex)

    if (!this._txid) {
      this._txid = await zcash.createTx({
        client: this._client,
        script: this._redeemScript,
        amount: this._amount
      })
      await this._store.put(txidIndex)
    }

    debug('created fund transaction with id', this._txid)
    return this._txid
  }

  async loadTransaction ({ txid }) {
    this._txid = txid || this._txid
    debug('loading fund transaction with id', this._txid)
    this._tx = await zcash.getTx(this._client, this._txid)

    for (let i = 0; i < this._tx.outs.length; ++i) {
      const out = this._tx.outs[i]
      const outValue = out.value
      const outScript = out.script.toString('hex')
      const redeemScriptOut = zcash.scriptToOut(this._redeemScript).toString('hex')

      if (outScript !== redeemScriptOut) {
        continue
      }

      this._balance.setMaximum(outValue)
      this._outputIndex = i
      return
    }

    throw new Error('outputs (' + this._tx.outs + ') do not include' +
      ' p2sh of redeem script output (' + redeemScriptOut.toString('hex') + ').')
  }

  _generateRawClosureTx () {
    return zcash.generateRawClosureTx({
      receiverKeypair: this._receiverKeypair,
      senderKeypair: this._senderKeypair,
      txid: this._txid,
      outputIndex: this._outputIndex,
      claimAmount: this._balance.get(),
      changeAmount: this._balance.getMaximum()
        .sub(this._balance.get())
        .toString()
    })
  }

  _signTx (transaction, kp) {
    return zcash.getClosureTxSigned({
      keypair: kp,
      redeemScript: this._redeemScript,
      transaction
    })
  }

  async processClaim ({ transfer, claim }) {
    await this._balance.add(transfer.amount)
    const hash = zcash.getTxHash(this._generateRawClosureTx(), this._redeemScript)
    const sig = zcashjs.ECSignature.parseScriptSignature(Buffer.from(claim, 'hex'))

    if (!this._senderKeypair.verify(hash, sig.signature)) {
      this._balance.sub(transfer.amount)
      throw new Error('claim (' + claim + ') does not match signature hash (' +
        hash + ')')
    }

    debug('set new claim (' + claim + ') for amount', this._balance.get())
    this._claim = claim
  }

  async createClaim (transfer) {
    await this._balance.add(transfer.amount)

    const transaction = this._generateRawClosureTx()

    console.log('redeem script:', this._redeemScript.toString('hex'))
    console.log('keypair:', this._senderKeypair.toWIF())

    return this._signTx(transaction, this._senderKeypair)
  }

  async claim () {
    if (!this._claim) throw new Error('No claim to submit')

    console.log('generating raw closure tx')
    const transaction = this._generateRawClosureTx()
    console.log('raw transation:', transaction.toBuffer().toString('hex'))

    console.log('generating receiver signature')
    const receiverSig = this._signTx(transaction, this._receiverKeypair)

    console.log('generating the script that does the stuff')
    console.log('redeem to buffer:', this._redeemScript.toString('hex'))
    const closeScript = zcashjs.script.scriptHashInput([
      Buffer.from(this._claim, 'hex'),
      Buffer.from(receiverSig, 'hex'),
      zcashjs.opcodes.OP_FALSE
    ], this._redeemScript)

    console.log('setting it to be the input script')
    transaction.setInputScript(0, closeScript)

    console.log('logging it now')
    // TODO: really submit
    console.log('SUBMIT:', transaction.toBuffer().toString('hex'))
    zcash.submit(this._client, transaction.toBuffer().toString('hex'))
  }

  async expire () {
    const transaction = zcash.generateExpireTx({
      senderKeypair: this._senderKeypair,
      txid: this._txid,
      outputIndex: this._outputIndex,
      timeout: this._timeout,
      amount: +this._balance.getMaximum().toString()
    })

    console.log('transaction:', transaction.toBuffer().toString('hex'))
    console.log('redeem script:', this._redeemScript.toString('hex'))
    console.log('keypair:', this._senderKeypair.toWIF())

    const senderSig = this._signTx(transaction, this._senderKeypair)
    console.log('sending signature:', senderSig)
    console.log('is it canonical?', zcashjs.script.isCanonicalSignature(Buffer.from(senderSig, 'hex')))

    const expireScript = zcashjs.script.scriptHashInput([
      Buffer.from(senderSig, 'hex'),
      zcashjs.opcodes.OP_TRUE
    ], this._redeemScript)

    transaction.setInputScript(0, expireScript)
    // TODO: really submit
    console.log('SUBMIT:', transaction.toBuffer().toString('hex'))
    zcash.submit(this._client, transaction.toBuffer().toString('hex'))
  }
}
