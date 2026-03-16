const SystemState = require('../models/SystemState');

/**
 * Retrieve a value by key from the system state store.
 * If the key does not exist, returns the provided defaultValue.
 */
async function getState(key, defaultValue = null) {
  const state = await SystemState.findOne({ key }).exec();
  if (!state || state.value === undefined || state.value === null) {
    return defaultValue;
  }
  return state.value;
}

/**
 * Set a value in the system state store.
 * Creates or updates the record with an optional description.
 */
async function setState(key, value, description = '') {
  const valueStr = value === undefined || value === null ? '' : String(value);
  await SystemState.findOneAndUpdate(
    { key },
    { value: valueStr, description: description || '', updatedAt: new Date() },
    { upsert: true, new: true }
  ).exec();
}

module.exports = {
  getState,
  setState,
};
