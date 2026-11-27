const { z } = require("zod");
const { SelfEntry: Entry } = require("./models");
module.exports = async function trend(req) {
  const q = z
    .object({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
      q: z.string().trim().max(200).default(""),
      period: z.enum(["day", "week", "month"]),
      timezone: z
        .string()
        .max(100)
        .refine((value) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: value });
            return true;
          } catch {
            return false;
          }
        }),
    })
    .parse(req.query);
  const from = new Date(q.from),
    to = new Date(q.to);
  if (to < from)
    throw Object.assign(new Error("圖表日期區間無效"), { status: 422 });
  const localDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: q.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const unit = q.period === 'day' && localDay(from) === localDay(to) ? 'hour' : q.period;
  const points = await Entry.aggregate([
    {
      $match: {
        owner: req.selfUser._id,
        ...require("./search")(q.q),
        kind: { $in: ["mood", "diet"] },
        occurredAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            date: { $dateTrunc: { date: "$occurredAt", unit, timezone: q.timezone, startOfWeek: "Sunday" } },
            timezone: q.timezone,
            format: unit === "hour" ? "%Y-%m-%dT%H" : "%Y-%m-%d",
          },
        },
        score: {
          $avg: {
            $cond: [
              { $eq: ["$kind", "mood"] },
              {
                $cond: [
                  { $eq: ["$data.scale", 10] },
                  "$data.score",
                  {
                    $arrayElemAt: [
                      [1, 3, 6, 8, 10],
                      { $subtract: ["$data.score", 1] },
                    ],
                  },
                ],
              },
              null,
            ],
          },
        },
        selfHarm: {
          $avg: {
            $cond: [{ $eq: ["$kind", "mood"] }, "$data.selfHarmUrge", null],
          },
        },
        suicide: {
          $avg: {
            $cond: [{ $eq: ["$kind", "mood"] }, "$data.suicideUrge", null],
          },
        },
        appetite: {
          $avg: { $cond: [{ $eq: ["$kind", "diet"] }, "$data.appetite", null] },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        key: "$_id",
        score: 1,
        selfHarm: 1,
        suicide: 1,
        appetite: 1,
        count: 1,
      },
    },
  ]);
  return { points, unit };
};
