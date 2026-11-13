// Integration regression test for a disposable clinic database ONLY.
// Run against an already-started isolated server:
// EXPENSE_TEST_ALLOW_WRITES=1 EXPENSE_TEST_URL=http://127.0.0.1:3001 \
// EXPENSE_TEST_EMAIL=... EXPENSE_TEST_PASSWORD=... node scripts/test-expense-updates.mjs
// This creates and deletes fictional expenses. Never point it at production.
import assert from 'node:assert/strict'

const base = process.env.EXPENSE_TEST_URL
const email = process.env.EXPENSE_TEST_EMAIL
const password = process.env.EXPENSE_TEST_PASSWORD
if (process.env.EXPENSE_TEST_ALLOW_WRITES !== '1' || !base || !email || !password) {
  throw new Error('Requires an isolated server, test credentials, and EXPENSE_TEST_ALLOW_WRITES=1')
}
const url = new URL(base)
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
  throw new Error('Refusing non-local test server; use a disposable local database')
}

const login = await fetch(new URL('/api/auth/login', base), {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
assert.equal(login.status, 200, 'test login')
const { token } = await login.json()
assert.ok(token, 'test login must return token')
const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
const ids = []
async function request(method, payload, suffix = '') {
  const response = await fetch(new URL(`/api/expenses${suffix}`, base), {
    method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = await response.json()
  return { response, body }
}
try {
  for (const status of ['approved', 'rejected']) {
    const created = await request('POST', { category: 'electricity', amount: 300, gst: 54, vendor: 'Fictional regression test' })
    assert.equal(created.response.status, 201)
    ids.push(created.body.id)
    assert.equal(created.body.totalAmount, 354)
    const updated = await request('PUT', { id: created.body.id, status, totalAmount: 9999 })
    assert.equal(updated.response.status, 200)
    assert.equal(updated.body.status, status)
    assert.equal(updated.body.amount, 300)
    assert.equal(updated.body.gst, 54)
    assert.equal(updated.body.totalAmount, 354, `status-only ${status} must preserve total`)
  }
  const id = ids[0]
  for (const [data, amount, gst, total] of [
    [{ amount: 500 }, 500, 54, 554],
    [{ gst: 0 }, 500, 0, 500],
    [{ amount: 0, gst: 10 }, 0, 10, 10],
  ]) {
    const updated = await request('PUT', { id, ...data })
    assert.equal(updated.response.status, 200)
    assert.deepEqual([updated.body.amount, updated.body.gst, updated.body.totalAmount], [amount, gst, total])
  }
  for (const invalid of [{ amount: '300' }, { gst: -1 }, { gst: null }]) {
    const result = await request('PUT', { id, ...invalid })
    assert.equal(result.response.status, 400, 'invalid monetary update is rejected')
  }
  const final = await request('GET', undefined, '?limit=100')
  assert.equal(final.response.status, 200)
  const saved = final.body.expenses.find(expense => expense.id === id)
  assert.deepEqual([saved.amount, saved.gst, saved.totalAmount], [0, 10, 10], 'invalid writes must not change data')
  console.log('PASS: approval, rejection, partial monetary updates, zero values and invalid writes')
} finally {
  for (const id of ids) {
    const result = await request('DELETE', undefined, `?id=${encodeURIComponent(id)}`)
    if (!result.response.ok) console.error(`Cleanup failed for test record ${id}: ${result.response.status}`)
  }
}
