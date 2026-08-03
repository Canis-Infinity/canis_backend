const EventLog = require('../../models/admin/eventLog');

async function createEventLog(data) {
  return EventLog.create(data);
}

async function listEventLogs({ page = 1, type, keyword } = {}) {
  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = 20;
  const skip = (currentPage - 1) * perPage;
  const filter = {};

  if (type && type !== 'all') filter.status = type;
  if (keyword) {
    filter.$or = [
      { action: { $regex: keyword, $options: 'i' } },
      { resource: { $regex: keyword, $options: 'i' } },
      { 'actor.username': { $regex: keyword, $options: 'i' } },
      { message: { $regex: keyword, $options: 'i' } },
    ];
  }

  const [amount, data] = await Promise.all([
    EventLog.countDocuments(filter),
    EventLog.find(filter).skip(skip).limit(perPage).sort({ createdAt: -1 }).lean(),
  ]);

  return {
    page: currentPage,
    total: Math.ceil(amount / perPage),
    amount,
    data,
  };
}

module.exports = {
  createEventLog,
  listEventLogs,
};
