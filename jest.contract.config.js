// Testy kontraktowe – prawdziwy backend (docker lub staging), patrz docs/TESTING.md.
// Osobny config, żeby `npm test` zostało hermetyczne (bez sieci).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__/contract'],
  testMatch: ['**/*.contract.test.ts'],
  testTimeout: 30000,
};
