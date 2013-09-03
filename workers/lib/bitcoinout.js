var debug = require('debug')('snow:bitcoinout')
, num = require('num')
, util = require('util')
, async = require('async')
, prefix = '[snow:bitcoinout]'
, out = require('./out')

var BitcoinOut = module.exports = exports = function(
    currency, bitcoinEndpoint,dbClient)
{
    var Bitcoin = require('bitcoin').Client
    this.bitcoin = new Bitcoin(bitcoinEndpoint)
    this.client = dbClient
    this.currency = currency
    this.loop()
}

BitcoinOut.prototype.loop = function() {
    var that = this

    async.forever(function(cb) {
        that.work(function(err) {
            if (err) return cb(err)
            setTimeout(cb, 10e3)
        })
    }, function(err) {
        console.error('%s processing has failed. this should never happen.', prefix)
        console.error('%s', prefix, err)
        console.error('%s', prefix, err.stack)
    })
}

BitcoinOut.prototype.work = function(cb) {
    var that = this

    out.popBatch(this.client, this.currency, function(err, requests) {
        if (err) return cb(err)
        if (!requests) return cb()
        debug('found %d requests', requests.length)
        that.executeBatch(requests, cb)
    })
}

// returns only the valid addresses
BitcoinOut.prototype.validateAddresses = function(requests, cb) {
    var that = this
    , validRequests = []

    async.each(requests, function(request, cb) {
        that.bitcoin.validateAddress(request.address, function(err, res) {
            if (!err && res.isvalid) {
                debug('address %s validated', request.address)
                validRequests.push(request)
                return cb()
            }

            if (err) {
                console.error('%s failed to validate address %s', prefix, request.address)
                console.error(prefix, err)
            } else {
                console.error('%s address %s is invalid, trying to abort',
                    prefix, request.address)
            }

            out.cancelRequest(that.client, request, 'invalid address', function(err) {
                if (err) {
                    console.error('%s failed to abort request with invalid address %s',
                        prefix, request.request_id)

                    return cb()
                }

                debug('the request %s was aborted', request.request_id)

                cb()
            })
        })
    }, function(err) {
        if (err) return cb(err)
        cb(null, validRequests)
    })
}

BitcoinOut.prototype.executeBatch = function(requests, cb) {
    async.waterfall([
        this.validateAddresses.bind(this, requests),
        function(requests, next) {
            if (!requests.length) {
                debug('no requests are valid, skipping this batch')
                return cb()
            }
            next(null, requests)
        },
        this.sendBatch.bind(this)
    ], cb)
}

exports.formatRequestsToSendMany = function(requests) {
    var scale = requests[0].scale

    var compiled = requests.reduce(function(r, i) {
        var amount = num(i.amount, scale)
        r[i.address] = num(r[i.address] || 0).add(amount)
        return r
    }, {})

    var items = []

    Object.keys(compiled).forEach(function(addr) {
        items.push(util.format(
            '\t"%s": %s',
            addr,
            (+compiled[addr]).toFixed(scale)
        ))
    })

    return '{\n' + items.join(',\n') + '\n}'
}

BitcoinOut.prototype.sendBatch = function(requests, cb) {
    var that = this

    debug('will send %d transactions', requests.length)
    debug(util.inspect(requests))

    var cmd = exports.formatRequestsToSendMany(requests)

    debug('formatted requests:')
    debug(cmd)

    this.bitcoin.sendMany('', cmd, function(err, res) {
        if (!err) {
            debug('send requests successful')
            debug(util.inspect(res))

            return async.each(requests,
                out.markRequestCompleted.bind(that, that.client), function(err)
            {
                if (!err) {
                    debug('succeeded in marking requests as done')
                    return cb()
                }

                console.error('%s failed to mark item as done', prefix)
                console.error('%s', prefix, err)
                cb()
            })
        }

        if (err.code == -6) {
            debug('request failed because wallet is lacking funds')
            debug('trying to re-queue requests')

            return out.reQueue(that.client, requests, function(err) {
                if (!err) {
                    debug('succeeded in requeing the requests')
                    return cb()
                }

                console.error('%s failed to requeue the requests', prefix)
                console.error('%s', prefix, err)
                return cb()
            })
        }

        console.error('%s not sure why the request failed. ' +
            'requests will remain uncertain', prefix)

        console.error(prefix, err)
        cb()
    })
}
