'use strict'

const async = require('async')
const _ = require('lodash')
const mysql = require('mysql')
const Base = require('bfx-facs-base')
const { promisify } = require('util')

function client (conf, label) {
  const db = mysql.createPool(_.extend({
    connectionLimit: 100,
    timezone: '+00:00',
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true
  }, conf))

  db.on('error', err => {
    console.error(label || 'generic', err)
  })

  return db
}

class DbFacility extends Base {
  constructor (caller, opts, ctx) {
    super(caller, opts, ctx)

    this.name = 'db-mysql'
    this._hasConf = true

    this.init()
  }

  _start (cb) {
    async.series([
      next => { super._start(next) },
      next => {
        this.cli = client(_.pick(
          this.conf,
          ['host', 'port', 'user', 'password', 'database']
        ))

        this.queryAsync = promisify(this.cli.query.bind(this.cli))

        next()
      }
    ], cb)
  }

  _stop (cb) {
    async.series([
      next => { super._stop(next) },
      next => {
        this.cli.end()
        delete this.cli
        next()
      }
    ], cb)
  }
}

module.exports = DbFacility
