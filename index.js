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

  /**
   * @see https://www.npmjs.com/package/mysql#pooling-connections
   * @see https://www.npmjs.com/package/mysql#transactions
   *
   * @param {(conn: { queryAsync: Function, cli: mysql.PoolConnection }) => Promise<void>} func
   */
  async runTransactionAsync (func) {
    /** @type {mysql.PoolConnection} */
    let db = null
    let txStarted = false
    let txCommited = false

    try {
      db = await new Promise((resolve, reject) => {
        this.cli.getConnection((err, cli) => err ? reject(err) : resolve(cli))
      })
      const queryAsync = promisify(db.query.bind(db))

      await new Promise((resolve, reject) => db.beginTransaction((err) => err ? reject(err) : resolve()))
      txStarted = true

      await func({ queryAsync, cli: db })

      await new Promise((resolve, reject) => db.commit((err) => err ? reject(err) : resolve()))
      txCommited = true

      db.release()
    } catch (err) {
      if (txStarted && !txCommited) {
        try {
          await new Promise((resolve, reject) => db.rollback((err) => err ? reject(err) : resolve()))
          db.release()
        } catch (err) {
          db.destroy() // force cleanup session
        }
      }

      throw err
    }
  }
}

module.exports = DbFacility
