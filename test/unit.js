'use strict'

/* eslint-env mocha */

const async = require('async')
const assert = require('assert')
const DbFacility = require('../index')
const { DbTransactionError } = DbFacility
const fs = require('fs')
const path = require('path')
const sinon = require('sinon')
const sleep = require('timers/promises').setTimeout
const { EventEmitter } = require('events')

describe('DbFacility tests', () => {
  const configPath = path.join(__dirname, 'config/facs/db-mysql.config.json')
  const facCaller = new class FacCaller extends EventEmitter {
    constructor () {
      super()
      this.ctx = { root: path.join(__dirname, '') }
    }
  }()

  /** @type {DbFacility} */
  let fac

  before(async function () {
    this.timeout(20000)

    // setup config file
    const config = {
      test: {
        host: process.env.DB_FAC_HOST || '127.0.0.1',
        port: +(process.env.DB_FAC_PORT || 3306),
        user: process.env.DB_FAC_USER || '',
        password: process.env.DB_FAC_PWD || '',
        database: process.env.DB_FAC_DB || ''
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(config), { encoding: 'utf-8', flag: 'w' })

    fac = new DbFacility(facCaller, { ns: 'test' }, { env: 'test' })
  })

  describe('start tests', () => {
    it('should start connection successfuly and run query', (done) => {
      async.series([
        (next) => {
          fac.start(next)
        },
        (next) => {
          assert.strictEqual(fac.active, 1)

          fac.cli.query(`CREATE TABLE IF NOT EXISTS sampleTestTable (
            name VARCHAR(255) DEFAULT NULL,
            age INT DEFAULT NULL
          )`, next)
        }
      ], (err) => {
        done(err)
      })
    }).timeout(5000)
  })

  describe('callback tests', () => {
    after(async () => {
      await fac.queryAsync('DELETE FROM sampleTestTable')
    })

    it('should support query with params as 2nd argument', (done) => {
      fac.cli.query(
        'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
        ['john doe', 27],
        (err, res) => {
          assert.strictEqual(err, null)
          assert.strictEqual(typeof res, 'object')
          assert.strictEqual(res.affectedRows, 1)
          done()
        }
      )
    }).timeout(5000)

    it('should work with callback as 2nd argument', (done) => {
      fac.cli.query(
        'SELECT * FROM sampleTestTable',
        (err, res) => {
          assert.strictEqual(err, null)
          assert.ok(Array.isArray(res))
          assert.strictEqual(res.length, 1)
          done()
        }
      )
    }).timeout(5000)

    it('should work with query options object', (done) => {
      fac.cli.query(
        {
          sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          values: ['jane doe', 25]
        },
        (err, res) => {
          assert.strictEqual(err, null)
          assert.strictEqual(typeof res, 'object')
          assert.strictEqual(res.affectedRows, 1)
          done()
        }
      )
    }).timeout(5000)

    it('should work with query options object and params as 2nd argument', (done) => {
      fac.cli.query(
        {
          sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)'
        },
        ['jane doe', 25],
        (err, res) => {
          assert.strictEqual(err, null)
          assert.strictEqual(typeof res, 'object')
          assert.strictEqual(res.affectedRows, 1)
          done()
        }
      )
    }).timeout(5000)

    it('should work with event based approach', (done) => {
      fac.cli.query(
        {
          sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          values: ['jane doe', 25]
        }
      )
        .on('error', (err) => {
          done(err)
        })
        .on('result', (res) => {
          assert.strictEqual(typeof res, 'object')
          assert.strictEqual(res.affectedRows, 1)
          done()
        })
    }).timeout(5000)
  })

  describe('promise tests', () => {
    after(async () => {
      await fac.queryAsync('DELETE FROM sampleTestTable')
    })

    it('should support query with params as 2nd argument', async () => {
      const res = await fac.queryAsync(
        'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
        ['john doe', 27]
      )
      assert.strictEqual(typeof res, 'object')
      assert.strictEqual(res.affectedRows, 1)
    }).timeout(5000)

    it('should work with callback as 2nd argument', async () => {
      const res = await fac.queryAsync(
        'SELECT * FROM sampleTestTable'
      )
      assert.ok(Array.isArray(res))
      assert.strictEqual(res.length, 1)
    }).timeout(5000)

    it('should work with query options object', async () => {
      const res = await fac.queryAsync(
        {
          sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          values: ['jane doe', 25]
        }
      )
      assert.strictEqual(typeof res, 'object')
      assert.strictEqual(res.affectedRows, 1)
    }).timeout(5000)

    it('should work with query options object and params as 2nd argument', async () => {
      const res = await fac.queryAsync(
        {
          sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)'
        },
        ['jane doe', 25]
      )
      assert.strictEqual(typeof res, 'object')
      assert.strictEqual(res.affectedRows, 1)
    }).timeout(5000)

    it('should work with just query options object', async () => {
      const res = await fac.queryAsync(
        {
          sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          values: ['jane doe', 25]
        }
      )

      // event based approach does not work with promisified function
      assert.strictEqual(typeof res, 'object')
      assert.strictEqual(res.affectedRows, 1)
    }).timeout(5000)
  })

  describe('transaction callback tests', () => {
    afterEach(async () => {
      await fac.queryAsync('DELETE FROM sampleTestTable')
    })

    it('should commit changes in successful transaction', (done) => {
      const countSql = 'SELECT * FROM sampleTestTable ORDER BY name ASC'

      async.series([
        (next) => {
          fac.cli.query(countSql, (err, res) => {
            if (err) return next(err)
            try {
              assert.strictEqual(res.length, 0)
              return next()
            } catch (err) {
              return next(err)
            }
          })
        },
        (next) => {
          fac.runTransaction((conn, txFuncCb) => {
            async.series([
              (nextStmt) => conn.cli.query(
                'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
                ['john doe', 27],
                nextStmt
              ),
              (nextStmt) => conn.cli.query(
                {
                  sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
                  values: ['jane doe', 25]
                },
                nextStmt
              )
            ], txFuncCb)
          }, next)
        },
        (next) => {
          fac.cli.query(countSql, (err, res) => {
            if (err) return next(err)
            try {
              assert.strictEqual(res.length, 2)
              assert.deepStrictEqual(res.map((x) => x.name), ['jane doe', 'john doe'])
              return next()
            } catch (err) {
              return next(err)
            }
          })
        }
      ], done)
    }).timeout(5000)

    it('should rollback changes on failure', (done) => {
      const countSql = 'SELECT * FROM sampleTestTable ORDER BY name ASC'

      async.series([
        (next) => {
          fac.cli.query(countSql, (err, res) => {
            if (err) return next(err)
            try {
              assert.strictEqual(res.length, 0)
              return next()
            } catch (err) {
              return next(err)
            }
          })
        },
        (next) => {
          fac.runTransaction((conn, txFuncCb) => {
            async.series([
              (next) => conn.cli.query(
                'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
                ['john doe', 27],
                next
              ),
              (next) => next(new Error('ERR_SIMULATE'))
            ], txFuncCb)
          }, next)
        }
      ], (execErr) => {
        try {
          assert.ok(execErr instanceof DbTransactionError)
          assert.ok(execErr.message === 'ERR_TX_FLOW_FAILURE')
          assert.ok(execErr.originalError instanceof Error)
          assert.ok(execErr.originalError.message === 'ERR_SIMULATE')
          assert.strictEqual(execErr.txState.started, true)
          assert.strictEqual(execErr.txState.commited, false)
          assert.strictEqual(execErr.txState.reverted, true)

          fac.cli.query(countSql, (assertErr, res) => {
            if (assertErr) return done(assertErr)
            try {
              assert.strictEqual(res.length, 0)
              return done()
            } catch (err) {
              return done(err)
            }
          })
        } catch (assertErr) {
          done(assertErr)
        }
      })
    }).timeout(5000)
  })

  describe('transaction async tests', () => {
    afterEach(async () => {
      await fac.queryAsync('DELETE FROM sampleTestTable')
    })

    it('should commit changes in successful transaction', async () => {
      const countSql = 'SELECT * FROM sampleTestTable ORDER BY name ASC'

      const beforeRes = await fac.queryAsync(countSql)
      assert.strictEqual(beforeRes.length, 0)

      await fac.runTransactionAsync(async (conn) => {
        await conn.queryAsync(
          'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          ['john doe', 27]
        )

        await conn.queryAsync({
          sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          values: ['jane doe', 25]
        })
      })

      const afterRes = await fac.queryAsync(countSql)
      assert.strictEqual(afterRes.length, 2)
      assert.deepStrictEqual(afterRes.map((x) => x.name), ['jane doe', 'john doe'])
    }).timeout(5000)

    it('should have access to connection instance', async () => {
      const countSql = 'SELECT * FROM sampleTestTable ORDER BY name ASC'

      const beforeRes = await fac.queryAsync(countSql)
      assert.strictEqual(beforeRes.length, 0)

      await fac.runTransactionAsync(async (conn) => {
        await conn.queryAsync(
          'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          [conn.cli.escape('john doe'), 27]
        )

        await new Promise((resolve, reject) => conn.cli.query(
          'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          [conn.cli.escape('jane doe'), 25],
          (err) => err ? reject(err) : resolve()
        ))
      })

      const afterRes = await fac.queryAsync(countSql)
      assert.strictEqual(afterRes.length, 2)
      assert.deepStrictEqual(afterRes.map((x) => x.name), ['\'jane doe\'', '\'john doe\''])
    }).timeout(5000)

    it('should rollback changes on failure', async () => {
      const countSql = 'SELECT * FROM sampleTestTable ORDER BY name ASC'

      const beforeRes = await fac.queryAsync(countSql)
      assert.strictEqual(beforeRes.length, 0)

      const promise = fac.runTransactionAsync(async (conn) => {
        await conn.queryAsync(
          'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
          ['john doe', 27]
        )

        throw new Error('ERR_SIMULATE')
      })

      await assert.rejects(promise, (err) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message === 'ERR_TX_FLOW_FAILURE')
        assert.ok(err.originalError instanceof Error)
        assert.ok(err.originalError.message === 'ERR_SIMULATE')
        assert.strictEqual(err.txState.started, true)
        assert.strictEqual(err.txState.commited, false)
        assert.strictEqual(err.txState.reverted, true)
        return true
      })

      const afterRes = await fac.queryAsync(countSql)
      assert.strictEqual(afterRes.length, 0)
    }).timeout(5000)
  })

  describe('queryStream tests', () => {
    const data = [
      { name: 'Legolas', age: 1357 },
      { name: 'Aragorn', age: 87 },
      { name: 'Gimli', age: 139 }
    ]
    before(async () => {
      await fac.queryAsync(
        'INSERT INTO sampleTestTable (name, age) VALUES (?, ?), (?, ?), (?, ?)',
        data.map(x => Object.values(x)).flat()
      )
    })

    after(async () => {
      await fac.queryAsync('DELETE FROM sampleTestTable')
    })

    it('should support async iteration of query stream', async () => {
      let i = 0
      const stream = fac.queryStream('SELECT * FROM sampleTestTable')
      for await (const row of stream) {
        assert.strictEqual(row.name, data[i].name)
        assert.strictEqual(row.age, data[i].age)
        i++
      }
      assert.strictEqual(i, 3)
    })

    it('should support params as well', async () => {
      let i = 0
      const check = data.slice(1)
      const stream = fac.queryStream('SELECT * FROM sampleTestTable WHERE age < ?', [1000])
      for await (const row of stream) {
        assert.strictEqual(row.name, check[i].name)
        assert.strictEqual(row.age, check[i].age)
        i++
      }
      assert.strictEqual(i, 2)
    })

    it('should handle query abortion', async () => {
      const stream = fac.queryStream('SELECT * FROM sampleTestTable')

      let res = await stream.next()
      assert.strictEqual(res.value?.name, data[0].name)

      res = await stream.next()
      assert.strictEqual(res.value?.name, data[1].name)
      await stream.return()
    })

    it('should not fetch new rows unless requested by iterator', async () => {
      const spy = sinon.spy(EventEmitter.prototype, 'emit')

      const stream = fac.queryStream('SELECT * FROM sampleTestTable')

      let res = await stream.next()
      assert.strictEqual(res.value?.name, data[0].name)

      res = await stream.next()
      assert.strictEqual(res.value?.name, data[1].name)

      await sleep(2000)
      let calls = spy.getCalls().map(x => x.args)
      let resultCalls = calls.filter(x => x[0] === 'result')
      let closeCalls = calls.filter(x => x[0] === 'close')

      assert.strictEqual(closeCalls.length, 0)
      assert.strictEqual(resultCalls.length, 2)
      assert.strictEqual(resultCalls[0][1]?.name, data[0].name)
      assert.strictEqual(resultCalls[1][1]?.name, data[1].name)
      await stream.return()

      await sleep(1000)
      calls = spy.getCalls().map(x => x.args)
      resultCalls = calls.filter(x => x[0] === 'result')
      closeCalls = calls.filter(x => x[0] === 'close')

      spy.restore()

      assert.strictEqual(closeCalls.length, 1)
      assert.strictEqual(resultCalls.length, 2)
    }).timeout(10000)

    it('should fail on query error', async () => {
      await assert.rejects(fac.queryStream('SELECT FROM sampleTestTable').next(), (err) => {
        return err.code === 'ER_PARSE_ERROR'
      })
    })
  })

  describe('stop tests', () => {
    before(async () => {
      // make sure resources are cleaned
      await fac.queryAsync('DROP TABLE IF EXISTS sampleTestTable')
    })

    it('should close existing connections', (done) => {
      fac.stop(err => {
        assert.strictEqual(err, null)
        assert.strictEqual(fac.cli, undefined)
        assert.strictEqual(fac.active, 0)
        done()
      })
    })
  })

  after(async function () {
    this.timeout(20000)

    fs.unlinkSync(configPath)
  })
})
