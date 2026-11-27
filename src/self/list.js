const { z } = require('zod');
const { SelfEntry: Entry } = require('./models');
const querySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  kind: z
    .enum([
      'mood',
      'sleep',
      'body',
      'medication',
      'reflection',
      'diet',
      'appointment',
      'journal',
    ])
    .optional(),
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  stats: z.literal('1').optional(),
  timezone: z
    .string()
    .max(100)
    .default('Asia/Taipei')
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  today: z.iso.datetime({ offset: true }).optional(),
});
module.exports = async function list(req, serialize) {
  const query = querySchema.parse(req.query);
  const filter = { owner: req.selfUser._id };
  if (query.kind)
    filter.kind =
      query.kind === 'journal' ? { $ne: 'appointment' } : query.kind;
  if (query.from || query.to)
    filter.occurredAt = {
      ...(query.from && { $gte: new Date(query.from) }),
      ...(query.to && { $lte: new Date(query.to) }),
    };
  if (query.q) {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      'data.food',
      'data.drinks',
      'title',
      'note',
      'data.emotions',
      'data.trigger',
      'data.reaction',
      'data.content',
      'data.prompt',
      'data.gratitude',
      'data.questions',
      'data.medicine',
      'data.dose',
      'data.unit',
      'data.number',
    ].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
  }
  const total = await Entry.countDocuments(filter);
  const pages = Math.ceil(total / query.limit);
  const page = Math.min(query.page, Math.max(1, pages));
  const entries = await Entry.find(filter)
    .sort({ occurredAt: -1, _id: -1 })
    .skip((page - 1) * query.limit)
    .limit(query.limit)
    .lean();
  let stats;
  if (query.stats) {
    const [aggregates, nextVisit] = await Promise.all([
      Entry.aggregate([
        { $match: filter },
        {
          $facet: {
            days: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      date: '$occurredAt',
                      format: '%Y-%m-%d',
                      timezone: query.timezone,
                    },
                  },
                },
              },
              { $count: 'count' },
            ],
            mood: [
              { $match: { kind: 'mood' } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  average: {
                    $avg: {
                      $cond: [
                        { $eq: ['$data.scale', 10] },
                        '$data.score',
                        {
                          $arrayElemAt: [
                            [1, 3, 6, 8, 10],
                            { $subtract: ['$data.score', 1] },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            ],
            sleep: [
              { $match: { kind: 'sleep' } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  average: {
                    $avg: {
                      $divide: [
                        {
                          $subtract: [
                            { $toDate: '$data.wakeAt' },
                            { $toDate: '$data.bedtime' },
                          ],
                        },
                        3600000,
                      ],
                    },
                  },
                },
              },
            ],
            appetite: [
              { $match: { kind: 'diet' } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  average: { $avg: '$data.appetite' },
                },
              },
            ],
          },
        },
      ]),
      Entry.findOne({
        owner: req.selfUser._id,
        kind: 'appointment',
        occurredAt: { $gte: query.today ? new Date(query.today) : new Date() },
      })
        .sort({ occurredAt: 1, _id: 1 })
        .lean(),
    ]);
    const result = aggregates[0];
    stats = {
      days: result.days[0]?.count || 0,
      moodCount: result.mood[0]?.count || 0,
      moodAverage: result.mood[0]?.average ?? null,
      sleepCount: result.sleep[0]?.count || 0,
      sleepAverage: result.sleep[0]?.average ?? null,
      appetiteCount: result.appetite[0]?.count || 0,
      appetiteAverage: result.appetite[0]?.average ?? null,
      nextVisit: nextVisit ? serialize(nextVisit) : null,
    };
  }
  return { entries: entries.map(serialize), total, page, pages, stats };
};
