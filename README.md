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
```

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
