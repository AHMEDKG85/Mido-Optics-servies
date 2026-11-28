const assert = require('node:assert/strict');

const projectId = 'gen-lang-client-0748882445';
const region = 'europe-west1';
const functions = ['createStoreOrder', 'updateStorefrontInventory', 'listStorefrontStaff'];

async function main() {
  for (const name of functions) {
    const response = await fetch(`http://127.0.0.1:5001/${projectId}/${region}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    });
    const result = await response.json();
    assert.equal(response.status, 401, `${name} should reject an unauthenticated caller`);
    assert.equal(result.error?.status, 'UNAUTHENTICATED', `${name} should return callable auth failure`);
    process.stdout.write(`✓ ${name} is registered and rejects unauthenticated callers\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
