const bitcoinjs = require('bitcoinjs-lib')
const BigInteger = require('bigi')

function secretToKeypair (secret) {
  return new bitcoinjs.ECPair(
    BigInteger.fromBuffer(Buffer.from(secret, 'hex')),
    null,
    { network: bitcoinjs.networks.testnet })
}

function publicKeyToAddress (publicKey) {
  return bitcoinjs.ECPair
    .fromPublicKeyBuffer(Buffer.from(publicKey, 'hex'), bitcoinjs.networks.testnet)
    .getAddress()
}

var keypair = secretToKeypair('68656C6C6F776F726C64')
var address = publicKeyToAddress(keypair.getPublicKeyBuffer().toString('hex'))

// var addr = publicKeyToAddress('tmHQMLEtCHUcjaN8pxjAnKYo1JfKQYNja9t')
console.log(bitcoinjs.networks.testnet)
console.log(address)
