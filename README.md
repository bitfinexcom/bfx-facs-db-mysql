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

// closing resources
fac.stop((err) => {
  if (err) console.log('an error occurred', err)
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
