module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  // __tests__/contract bije w prawdziwy backend – odpalane osobno (npm run test:contract:*).
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/contract/'],
};
