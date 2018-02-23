'use strict'

const debug = require('debug')('ilp-plugin-zcash-paychan')
const crypto = require('crypto')
const shared = require('ilp-plugin-shared')
const BigNumber = require('bignumber.js')
const zcash = require('./zcash')
const Channel = require('./channel')
const InvalidFieldsError = shared.Errors.InvalidFieldsError
const PluginBtp = require('ilp-plugin-btp')
const BtpPacket = require('btp-packet')
const GET_OUTGOING_TXID = '_get_zcash_outgoing_txid'

class PluginZcashPaychan extends PluginBtp {
  constructor ({
    outgoingAmount,
    secret,
    timeout,
    network,
    peerPublicKey,
    zcashUri,
    _store,

    listener,
    server
  }) {
    if (!listener && !server) {
      throw new Error('missing opts.listener or opts.server')
    } else if (!secret) {
      throw new InvalidFieldsError('missing opts.secret')
    } else if (!peerPublicKey) {
      throw new InvalidFieldsError('missing opts.peerPublicKey')
    } else if (!zcashUri) {
      throw new InvalidFieldsError('missing opts.zcashUri')
    } else if (!_store) {
      throw new InvalidFieldsError('missing opts._store')
    }

    super({listener, server})

    this._zcashUri = zcashUri
    this._peerPublicKey = peerPublicKey
    this._secret = secret
    this._network = network
    this._keypair = zcash.secretToKeypair(this._secret)
    this._address = zcash.publicKeyToAddress(this._keypair.getPublicKeyBuffer().toString('hex'))
    this._peerAddress = zcash.publicKeyToAddress(peerPublicKey)

    this._prefix = 'g.crypto.zcash.' + ((this._address > this._peerAddress)
      ? this._address + '~' + this._peerAddress
      : this._peerAddress + '~' + this._address) + '.'

    const channelParams = {
      // TODO: allow 2 different timeouts?
      timeout: timeout,
      uri: this._zcashUri,
      store: _store,
      network: this._network,
      secret: this._secret
    }

    // incoming channel submits and validates claims
    this._incomingChannel = new Channel(Object.assign({
      senderPublicKey: this._peerPublicKey
    }, channelParams))

    // outgoing channel generates claims and times out the channel
    this._outgoingChannel = new Channel(Object.assign({
      receiverPublicKey: this._peerPublicKey,
      amount: outgoingAmount
    }, channelParams))

    this._incomingTxId = null
    this._outgoingTxId = null
    this._bestClaimAmount = '0'
  }

  async _connect () {
    await this._incomingChannel.connect()
    await this._outgoingChannel.connect()
    this._outgoingTxId = await this._outgoingChannel.createChannel()

    while (!this._incomingTxId) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      try {
        const res = await this._call(null, {
          type: BtpPacket.TYPE_MESSAGE,
          requestId: await _requestId(),
          data: {
            protocolData: [{
              protocolName: GET_OUTGOING_TXID,
              contentType: BtpPacket.MIME_APPLICATION_OCTET_STREAM,
              data: Buffer.alloc(0)
            }]
          }
        })
        const proto = res.protocolData.find((p) => p.protocolName === GET_OUTGOING_TXID)
        this._incomingTxId = JSON.parse(proto.data.toString()).txid
      } catch (e) {
        debug('got btp error:', e.message)
        debug('retrying...')
      }
    }

    await this._incomingChannel.loadTransaction({ txid: this._incomingTxId })
    await this._outgoingChannel.loadTransaction({})
  }

  async _disconnect () {
    if (this._incomingChannel) {
      await this._incomingChannel.claim()
    }
  }

  async sendMoney (amount) {
    const claim = await this._outgoingChannel.createClaim({amount})
    await this._call(null, {
      type: BtpPacket.TYPE_TRANSFER,
      requestId: await _requestId(),
      data: {
        amount,
        protocolData: [{
          protocolName: 'claim',
          contentType: BtpPacket.MIME_APPLICATION_JSON,
          data: Buffer.from(JSON.stringify({ amount, signature: claim }))
        }]
      }
    })
  }


  _validateFulfillment (fulfillment, condition) {
    const hash = shared.Util.base64url(crypto
      .createHash('sha256')
      .update(Buffer.from(fulfillment, 'base64'))
      .digest())

    // TODO: validate the condition to make sure it's base64url
    if (hash !== condition) {
      throw new NotAcceptedError('fulfillment ' + fulfillment +
        ' does not match condition ' + condition)
    }
  }

  async _handleMoney (from, { requestId, data }) {
    const transferAmount = new BigNumber(data.amount)
    const primary = data.protocolData[0]
    if (primary.protocolName !== 'claim') return []

    const lastAmount = new BigNumber(this._bestClaimAmount)
    const {amount, signature} = JSON.parse(primary.data)
    const addedMoney = new BigNumber(amount).minus(lastAmount)
    if (!addedMoney.eq(transferAmount)) {
      debug('amounts out of sync. peer thinks they sent ' + transferAmount.toString() + ' got ' + addedMoney.toString())
    }
    if (lastAmount.gte(amount)) {
      throw new Error('claim decreased')
    }

    await this._incomingChannel.processClaim({ transfer: {amount}, claim: signature })
    this._bestClaimAmount = amount

    if (this._moneyHandler) {
      await this._moneyHandler(addedMoney.toString())
    }
    return []
  }

  async _handleData (from, { requestId, data }) {
    const { protocolMap } = this.protocolDataToIlpAndCustom(data)
    if (!protocolMap[GET_OUTGOING_TXID]) {
      return super._handleData(from, { requestId, data })
    }
    return [{
      protocolName: GET_OUTGOING_TXID,
      contentType: BtpPacket.MIME_APPLICATION_JSON,
      data: Buffer.from(JSON.stringify({ txid: this._outgoingTxId }))
    }]
  }
}

PluginZcashPaychan.version = 2
module.exports = PluginZcashPaychan

async function _requestId () {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(4, (err, buf) => {
      if (err) reject(err)
      resolve(buf.readUInt32BE(0))
    })
  })
}
