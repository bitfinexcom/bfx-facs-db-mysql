'use strict'

const async = require('async')
const test = require('brittle')
const DbFacility = require('../index')
const { DbTransactionError } = DbFacility
const fs = require('fs')
const path = require('path')
const sleep = require('timers/promises').setTimeout
const { EventEmitter } = require('events')

const configPath = path.join(__dirname, 'config/facs/db-mysql.config.json')
const facCaller = new class FacCaller extends EventEmitter {
  constructor () {
    super()
    this.ctx = { root: path.join(__dirname, '') }
  }
}()

const countSql = 'SELECT * FROM sampleTestTable ORDER BY name ASC'

/** @type {DbFacility} */
let fac

const cleanTable = () => fac.queryAsync('DELETE FROM sampleTestTable')

const queryCb = (cli, ...args) => new Promise((resolve, reject) => {
  cli.query(...args, (err, res) => err ? reject(err) : resolve(res))
})

const catchError = async (promise) => {
  try {
    await promise
  } catch (err) {
    return err
  }
  return null
}

test('start: should start connection successfully and run query', { timeout: 20000 }, async (t) => {
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

  await new Promise((resolve, reject) => fac.start((err) => err ? reject(err) : resolve()))
  t.is(fac.active, 1)

  await queryCb(fac.cli, 'DROP TABLE IF EXISTS sampleTestTable')
  await queryCb(fac.cli, `CREATE TABLE IF NOT EXISTS sampleTestTable (
    name VARCHAR(255) DEFAULT NULL,
    age INT DEFAULT NULL
  )`)
  t.pass('table created')
})

test('callback tests', async (t) => {
  t.teardown(cleanTable)

  await t.test('should support query with params as 2nd argument', (t) => {
    t.plan(3)
    fac.cli.query(
      'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
      ['john doe', 27],
      (err, res) => {
        t.is(err, null)
        t.is(typeof res, 'object')
        t.is(res.affectedRows, 1)
      }
    )
  })

  await t.test('should work with callback as 2nd argument', (t) => {
    t.plan(3)
    fac.cli.query(
      'SELECT * FROM sampleTestTable',
      (err, res) => {
        t.is(err, null)
        t.ok(Array.isArray(res))
        t.is(res.length, 1)
      }
    )
  })

  await t.test('should work with query options object', (t) => {
    t.plan(3)
    fac.cli.query(
      {
        sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
        values: ['jane doe', 25]
      },
      (err, res) => {
        t.is(err, null)
        t.is(typeof res, 'object')
        t.is(res.affectedRows, 1)
      }
    )
  })

  await t.test('should work with query options object and params as 2nd argument', (t) => {
    t.plan(3)
    fac.cli.query(
      {
        sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)'
      },
      ['jane doe', 25],
      (err, res) => {
        t.is(err, null)
        t.is(typeof res, 'object')
        t.is(res.affectedRows, 1)
      }
    )
  })

  await t.test('should work with event based approach', (t) => {
    t.plan(3)
    fac.cli.query(
      {
        sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
        values: ['jane doe', 25]
      }
    )
      .on('error', (err) => {
        t.fail(err)
      })
      .on('result', (res) => {
        t.is(typeof res, 'object')
        t.is(res.affectedRows, 1)
      })
      .on('end', () => t.pass('query ended'))
  })
})

test('promise tests', async (t) => {
  t.teardown(cleanTable)

  await t.test('should support query with params as 2nd argument', async (t) => {
    const res = await fac.queryAsync(
      'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
      ['john doe', 27]
    )
    t.is(typeof res, 'object')
    t.is(res.affectedRows, 1)
  })

  await t.test('should work with callback as 2nd argument', async (t) => {
    const res = await fac.queryAsync(
      'SELECT * FROM sampleTestTable'
    )
    t.ok(Array.isArray(res))
    t.is(res.length, 1)
  })

  await t.test('should work with query options object', async (t) => {
    const res = await fac.queryAsync(
      {
        sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
        values: ['jane doe', 25]
      }
    )
    t.is(typeof res, 'object')
    t.is(res.affectedRows, 1)
  })

  await t.test('should work with query options object and params as 2nd argument', async (t) => {
    const res = await fac.queryAsync(
      {
        sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)'
      },
      ['jane doe', 25]
    )
    t.is(typeof res, 'object')
    t.is(res.affectedRows, 1)
  })

  await t.test('should work with just query options object', async (t) => {
    const res = await fac.queryAsync(
      {
        sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
        values: ['jane doe', 25]
      }
    )

    // event based approach does not work with promisified function
    t.is(typeof res, 'object')
    t.is(res.affectedRows, 1)
  })
})

test('transaction callback tests', async (t) => {
  await t.test('should commit changes in successful transaction', async (t) => {
    t.teardown(cleanTable)

    const beforeRes = await queryCb(fac.cli, countSql)
    t.is(beforeRes.length, 0)

    const err = await new Promise((resolve) => {
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
      }, resolve)
    })
    t.absent(err)

    const afterRes = await queryCb(fac.cli, countSql)
    t.is(afterRes.length, 2)
    t.alike(afterRes.map((x) => x.name), ['jane doe', 'john doe'])
  })

  await t.test('should rollback changes on failure', async (t) => {
    t.teardown(cleanTable)

    const beforeRes = await queryCb(fac.cli, countSql)
    t.is(beforeRes.length, 0)

    const execErr = await new Promise((resolve) => {
      fac.runTransaction((conn, txFuncCb) => {
        async.series([
          (next) => conn.cli.query(
            'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
            ['john doe', 27],
            next
          ),
          (next) => next(new Error('ERR_SIMULATE'))
        ], txFuncCb)
      }, resolve)
    })

    t.ok(execErr instanceof DbTransactionError)
    t.is(execErr.message, 'ERR_TX_FLOW_FAILURE')
    t.ok(execErr.originalError instanceof Error)
    t.is(execErr.originalError.message, 'ERR_SIMULATE')
    t.is(execErr.txState.started, true)
    t.is(execErr.txState.commited, false)
    t.is(execErr.txState.reverted, true)

    const afterRes = await queryCb(fac.cli, countSql)
    t.is(afterRes.length, 0)
  })
})

test('transaction async tests', async (t) => {
  await t.test('should commit changes in successful transaction', async (t) => {
    t.teardown(cleanTable)

    const beforeRes = await fac.queryAsync(countSql)
    t.is(beforeRes.length, 0)

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
    t.is(afterRes.length, 2)
    t.alike(afterRes.map((x) => x.name), ['jane doe', 'john doe'])
  })

  await t.test('should have access to connection instance', async (t) => {
    t.teardown(cleanTable)
    const countSql = 'SELECT * FROM sampleTestTable ORDER BY name ASC'

    const beforeRes = await fac.queryAsync(countSql)
    t.is(beforeRes.length, 0)

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
    t.is(afterRes.length, 2)
    t.alike(afterRes.map((x) => x.name), ['\'jane doe\'', '\'john doe\''])
  })

  await t.test('should rollback changes on failure', async (t) => {
    t.teardown(cleanTable)
    const beforeRes = await fac.queryAsync(countSql)
    t.is(beforeRes.length, 0)

    const err = await catchError(fac.runTransactionAsync(async (conn) => {
      await conn.queryAsync(
        'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
        ['john doe', 27]
      )
      throw new Error('ERR_SIMULATE')
    }))

    t.ok(err instanceof Error, 'should reject')
    t.is(err?.message, 'ERR_TX_FLOW_FAILURE')
    t.ok(err?.originalError instanceof Error)
    t.is(err?.originalError?.message, 'ERR_SIMULATE')
    t.is(err?.txState?.started, true)
    t.is(err?.txState?.commited, false)
    t.is(err?.txState?.reverted, true)

    const afterRes = await fac.queryAsync(countSql)
    t.is(afterRes.length, 0)
  })
})

test('queryStream tests', async (t) => {
  const data = [
    { name: 'Legolas', age: 1357 },
    { name: 'Aragorn', age: 87 },
    { name: 'Gimli', age: 139 }
  ]

  t.teardown(cleanTable)

  await fac.queryAsync(
    'INSERT INTO sampleTestTable (name, age) VALUES (?, ?), (?, ?), (?, ?)',
    data.map(x => Object.values(x)).flat()
  )

  await t.test('should support async iteration of query stream', async (t) => {
    let i = 0
    const stream = fac.queryStream('SELECT * FROM sampleTestTable')
    for await (const row of stream) {
      t.is(row.name, data[i].name)
      t.is(row.age, data[i].age)
      i++
    }
    t.is(i, 3)
  })

  await t.test('should support params as well', async (t) => {
    let i = 0
    const check = data.slice(1)
    const stream = fac.queryStream('SELECT * FROM sampleTestTable WHERE age < ?', [1000])
    for await (const row of stream) {
      t.is(row.name, check[i].name)
      t.is(row.age, check[i].age)
      i++
    }
    t.is(i, 2)
  })

  await t.test('should handle query abortion', async (t) => {
    const stream = fac.queryStream('SELECT * FROM sampleTestTable')

    let res = await stream.next()
    t.is(res.value?.name, data[0].name)

    res = await stream.next()
    t.is(res.value?.name, data[1].name)

    await stream.return()
    t.pass('stream aborted')
  })

  await t.test('should not fetch new rows unless requested by iterator', async (t) => {
    await sleep(1000)
    const originalEmit = EventEmitter.prototype.emit
    const events = []

    EventEmitter.prototype.emit = function (...args) {
      if (args[0] === 'result' || args[0] === 'close') events.push(args)
      return Reflect.apply(originalEmit, this, args)
    }
    t.teardown(() => {
      EventEmitter.prototype.emit = originalEmit
    })

    const stream = fac.queryStream('SELECT * FROM sampleTestTable')

    let res = await stream.next()
    t.is(res.value?.name, data[0].name)

    res = await stream.next()
    t.is(res.value?.name, data[1].name)

    await sleep(2000)
    let resultCalls = events.filter(x => x[0] === 'result')
    let closeCalls = events.filter(x => x[0] === 'close')

    t.is(closeCalls.length, 0)
    t.is(resultCalls.length, 2)
    t.is(resultCalls[0][1]?.name, data[0].name)
    t.is(resultCalls[1][1]?.name, data[1].name)
    await stream.return()

    await sleep(1000)
    resultCalls = events.filter(x => x[0] === 'result')
    closeCalls = events.filter(x => x[0] === 'close')

    t.is(closeCalls.length, 1)
    t.is(resultCalls.length, 2)
  })

  await t.test('should fail on query error', async (t) => {
    const err = await catchError(fac.queryStream('SELECT FROM sampleTestTable').next())
    t.ok(err, 'should reject')
    t.is(err?.code, 'ER_PARSE_ERROR')
  })
})

test('stop tests', async (t) => {
  t.teardown(() => fs.unlinkSync(configPath))

  // make sure resources are cleaned
  await fac.queryAsync('DROP TABLE IF EXISTS sampleTestTable')

  const err = await new Promise((resolve) => fac.stop(resolve))
  t.is(err, null)
  t.is(fac.cli, undefined)
  t.is(fac.active, 0)
})
