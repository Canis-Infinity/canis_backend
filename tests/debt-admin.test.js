const { resolveMongoUri } = require('../scripts/create-debt-admin');

describe('debt administrator MongoDB connection', () => {
  it('uses localhost outside Docker while preserving database and options', () => {
    expect(resolveMongoUri('mongodb://host.docker.internal:27017/canis_world?authSource=admin', false))
      .toBe('mongodb://127.0.0.1:27017/canis_world?authSource=admin');
  });

  it('keeps the Docker hostname inside Docker', () => {
    const uri = 'mongodb://host.docker.internal:27017/canis_world';
    expect(resolveMongoUri(uri, true)).toBe(uri);
  });

  it('does not redirect remote database connections', () => {
    const uri = 'mongodb://mongo.example.test:27017/canis_world';
    expect(resolveMongoUri(uri, false)).toBe(uri);
  });
});
