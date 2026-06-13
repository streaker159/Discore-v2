function normalise(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanList(items, empty = 'None') {
  if (!items || !items.length) return empty;
  return items.join('\n');
}

module.exports = { normalise, humanList };
