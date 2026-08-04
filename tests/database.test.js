const { getMongoCandidates } = require('../src/config/database');

describe('database connection candidates', () => {
  it('prefers host localhost and keeps Docker Desktop as a fallback', () => {
    expect(getMongoCandidates('mongodb://127.0.0.1:27017/canis_world')).toEqual([
      'mongodb://127.0.0.1:27017/canis_world',
      'mongodb://host.docker.internal:27017/canis_world',
    ]);
  });

  it('does not rewrite an explicitly remote MongoDB host', () => {
    expect(getMongoCandidates('mongodb://mongo.internal:27017/canis_world')).toEqual([
      'mongodb://mongo.internal:27017/canis_world',
    ]);
  });
});
