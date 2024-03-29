# bfx-facs-db-mysql

A facility that represents mysql database adapter/client.

## Usage

```js
// initialization
const fac = new DbFacility(caller, { ns: 'm0' }, { env: 'development' })
fac.start((err) => {
  if (err) console.log('an error occurred', err)
})

// callback usage
fac.cli.query(
  'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
  ['jane doe', 25],
  (err, res) => {
    if (err) {
      console.log('an error occurred', err)
      return
    }

    console.log('result', res)
  }
)

// promise usage
try {
  const res = await fac.queryAsync(
    'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
    ['jane doe', 25]
  )
  console.log('result', res)
} catch (err) {
  console.log('an error occurred', err)
}

// event usage
fac.cli.query(
  {
    sql: 'SELECT * FROM sampleTestTable WHERE age >= ?',
    values: [25]
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

// async iterator stream usage
const stream = fac.queryStream('SELECT * FROM sampleTestTable WHERE age >= ?', [25])
for await (const row of stream) {
  console.log(row)
}

// closing resources
fac.stop((err) => {
  if (err) console.log('an error occurred', err)
})

// callback transactions
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
}, (err) => {
  if (err) {
    console.log('transaction failed')
  } else {
    console.log('transcation succeeded')
  }
})

// promise transactions
await fac.runTransactionAsync(async (conn) => {
  await conn.queryAsync(
    'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
    ['john doe', 27]
  )

  await conn.queryAsync({
    sql: 'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
    values: ['jane doe', 25]
  })

  await new Promise((resolve, reject) => conn.cli.query(
    'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
    [conn.cli.escape('james doe'), 23],
    (err) => err ? reject(err) : resolve()
  ))
})

// error handling in transactions
try {
  await fac.runTransactionAsync(async (conn) => {
    await conn.queryAsync(
      'INSERT INTO sampleTestTable (name, age) VALUES (?, ?)',
      ['john doe', 27]
    )

    throw new Error('ERR_SIMULATE')
  })
} catch (err) {
  console.log(err)
  // DbTransactionError: ERR_TX_FLOW_FAILURE
  //     at DbFacility.runTransactionAsync (/home/someuser/somepath/bfx-facs-db-mysql/index.js:214:13)
  //     at processTicksAndRejections (internal/process/task_queues.js:95:5)
  //     at async waitForActual (assert.js:788:5)
  //     at async Function.rejects (assert.js:909:25)
  //     at async Context.<anonymous> (/home/someuser/somepath/bfx-facs-db-mysql/test/unit.js:373:7) {
  //   originalError: Error: ERR_SIMULATE
  //       at /home/someuser/somepath/bfx-facs-db-mysql/test/unit.js:370:15
  //       at processTicksAndRejections (internal/process/task_queues.js:95:5)
  //       at async DbFacility.runTransactionAsync (/home/someuser/somepath/bfx-facs-db-mysql/index.js:191:7)
  //       at async waitForActual (assert.js:788:5)
  //       at async Function.rejects (assert.js:909:25)
  //       at async Context.<anonymous> (/home/someuser/somepath/bfx-facs-db-mysql/test/unit.js:373:7),
  //   txState: { started: true, commited: false, reverted: true }
  // }
}
```

**!NOTE: nested transactions are not supported through method runTransaction and runTransactionAsync methods**

## Testing

Export these environment variables:
```console
export DB_FAC_HOST='localhost' # default host 127.0.0.1
export DB_FAC_PORT=33060 # default 3306
export DB_FAC_USER='some_user' # default ''
export DB_FAC_PWD='some_pwd' # default ''
export DB_FAC_DB='some_db' # default ''
```

Then simply run:
```console
npm test
```
