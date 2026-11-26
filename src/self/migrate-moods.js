const { SelfEntry: Entry } = require('./models');
// Keep the original five-level score and increment the revision so an old
// editor cannot silently overwrite a converted entry.
module.exports = async function migrateMoods() {
  return Entry.collection.updateMany(
    {
      kind: 'mood',
      'data.scale': { $ne: 10 },
      'data.score': { $in: [1, 2, 3, 4, 5] },
    },
    [
      {
        $set: {
          'data.legacyScore': '$data.score',
          'data.score': {
            $arrayElemAt: [[1, 3, 6, 8, 10], { $subtract: ['$data.score', 1] }],
          },
          'data.scale': 10,
          __v: { $add: [{ $ifNull: ['$__v', 0] }, 1] },
        },
      },
    ],
  );
};
