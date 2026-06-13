function stamp() {
  return new Date().toISOString();
}

function log(level, message, meta = {}) {
  const payload = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${stamp()}] [${level}] ${message}${payload}`);
}

module.exports = {
  info: (message, meta) => log('INFO', message, meta),
  warn: (message, meta) => log('WARN', message, meta),
  error: (message, meta) => log('ERROR', message, meta),
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== 'production') log('DEBUG', message, meta);
  },
};
