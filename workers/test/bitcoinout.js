var BitcoinOut = require('../lib/bitcoinout')

console.log(BitcoinOut.formatRequestsToSendMany([
    {
        amount: 12345678,
        address: '1abcdefgh',
        scale: 8
    },
    {
        amount: 1,
        address: '1abcdefgh'
    },
    {
        amount: 123456789,
        address: '1testing'
    }
]))
