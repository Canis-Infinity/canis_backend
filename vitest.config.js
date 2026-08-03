module.exports = {
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
};
