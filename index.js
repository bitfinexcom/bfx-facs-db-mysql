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

class DbTransactionError extends Error {
  /**
   * @param {string} message
   * @param {Error} originalError
   * @param {boolean} started - flag indicating that transaction started
   * @param {boolean} commited - flag indicating that transaction commited
   * @param {boolean} reverted - flag indicating that transaction reverted
   */
  constructor (message, originalError, started = false, commited = false, reverted = false) {
    super(message)
    this.name = this.constructor.name
    this.originalError = originalError
    this.txState = {
      started,
      commited,
      reverted
    }

    Error.captureStackTrace(this, this.constructor)
  }

  toString () {
    return `${super.toString()}, Orignal Error: ${this.originalError.toString()}`
  }
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
   * @note Method does not support nested transactions
   * @see https://www.npmjs.com/package/mysql#pooling-connections
   * @see https://www.npmjs.com/package/mysql#transactions
   *
   * @param {(conn: { cli: mysql.PoolConnection }, txFuncCb: (err: Error|undefined) => void) => void} func
   * @param {(err: DbTransactionError|undefined) => void} cb
   */
  runTransaction (func, cb) {
    /** @type {mysql.PoolConnection} */
    let conn = null
    let txStarted = false
    let txCommited = false
    let txReverted = false

    async.series({
      conn: (next) => {
        this.cli.getConnection((err, res) => {
          if (err) return next(err)

          conn = res // intentional
          return next()
        })
      },
      begin: (next) => {
        conn.beginTransaction(next)
      },
      execute: (next) => {
        txStarted = true
        func({ cli: conn }, next)
      },
      commit: (next) => {
        conn.commit(next)
      },
      release: (next) => {
        txCommited = true
        try {
          conn.release()
          return next()
        } catch (err) {
          return next(err)
        }
      }
    }, (txFailureErr) => {
      if (!txFailureErr) return cb()

      if (txStarted && !txCommited) {
        return async.series({
          rollback: (next) => {
            conn.rollback(next)
          },
          release: (next) => {
            try {
              txReverted = true
              conn.release()
              return next()
            } catch (err) {
              return next(err)
            }
          }
        }, (rollbackErr) => {
          if (rollbackErr) {
            // force cleanup session
            console.error(new Date().toISOString(), rollbackErr)

            try {
              conn.destroy()
            } catch (destroyErr) {
              console.error(new Date().toISOString(), destroyErr)
            }
          }

          const cbErr = new DbTransactionError('ERR_TX_FLOW_FAILURE', txFailureErr, txStarted, txCommited, txReverted)
          return cb(cbErr)
        })
      }

      const cbErr = new DbTransactionError('ERR_TX_FLOW_FAILURE', txFailureErr, txStarted, txCommited, txReverted)
      return cb(cbErr)
    })
  }

  /**
   * @note Method does not support nested transactions
   * @see https://www.npmjs.com/package/mysql#pooling-connections
   * @see https://www.npmjs.com/package/mysql#transactions
   *
   * @param {(conn: { queryAsync: Function, cli: mysql.PoolConnection }) => Promise<void>} func
   */
  async runTransactionAsync (func) {
    /** @type {mysql.PoolConnection} */
    let conn = null
    let txStarted = false
    let txCommited = false
    let txReverted = false

    try {
      conn = await new Promise((resolve, reject) => {
        this.cli.getConnection((err, cli) => err ? reject(err) : resolve(cli))
      })
      const queryAsync = promisify(conn.query.bind(conn))

      await new Promise((resolve, reject) => conn.beginTransaction((err) => err ? reject(err) : resolve()))
      txStarted = true

      await func({ queryAsync, cli: conn })

      await new Promise((resolve, reject) => conn.commit((err) => err ? reject(err) : resolve()))
      txCommited = true

      conn.release()
    } catch (txFailureErr) {
      if (txStarted && !txCommited) {
        try {
          await new Promise((resolve, reject) => conn.rollback((err) => err ? reject(err) : resolve()))
          txReverted = true
          conn.release()
        } catch (releaseErr) {
          console.error(new Date().toISOString(), releaseErr)

          try {
            conn.destroy() // force cleanup session
          } catch (destroyErr) {
            console.error(new Date().toISOString(), destroyErr)
          }
        }
      }

      throw new DbTransactionError('ERR_TX_FLOW_FAILURE', txFailureErr, txStarted, txCommited, txReverted)
    }
  }
}

module.exports = DbFacility
module.exports.DbTransactionError = DbTransactionError
