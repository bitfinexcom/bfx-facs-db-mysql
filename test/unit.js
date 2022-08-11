'use strict'

/* eslint-env mocha */

const async = require('async')
const assert = require('assert')
const DbFacility = require('../index')
const fs = require('fs')
const path = require('path')
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
