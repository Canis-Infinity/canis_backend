module.exports = function searchFilter(query) {
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $or: [
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
    ].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } })) };
  }
  return {};
};
