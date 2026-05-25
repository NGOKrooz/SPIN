const util = require('util');

function safeStringify(value) {
  try {
    return JSON.stringify(value, (k, v) => {
      if (v && v._id) return v._id.toString ? v._id.toString() : v._id;
      return v;
    }, 2);
  } catch (err) {
    return util.inspect(value, { depth: 3 });
  }
}

function trace(functionName, internId, snapshot = {}) {
  const ts = new Date().toISOString();
  // Compact snapshot: include keys we care about
  console.log(`[MUTATION_TRACE] ${ts} ${functionName} intern:${internId} ${safeStringify(snapshot)}`);
}

module.exports = {
  trace,
};
