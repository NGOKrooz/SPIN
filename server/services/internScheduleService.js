function parseDateSafe(value) {
  if (!value) return null;

  try {
    let date = new Date(value);
    if (Number.isNaN(date.getTime()) && typeof value === 'string') {
      date = new Date(value.replace(' ', 'T'));
    }
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  } catch (err) {
    return null;
  }
}

function withFallbackUnitName(rotation) {
  if (rotation.unit_name) return rotation;
  return {
    ...rotation,
    unit_name: rotation.unit_id ? `Deleted Unit (${rotation.unit_id})` : 'Deleted Unit',
  };
}

function isCompletedRotation(rotation, today) {
  const endDate = parseDateSafe(rotation.end_date);
  if (!endDate) return false;
  return endDate < today;
}

function isCurrentRotation(rotation, today) {
  const startDate = parseDateSafe(rotation.start_date);
  const endDate = parseDateSafe(rotation.end_date);

  if (!startDate) return false;
  if (startDate > today) return false;
  if (!endDate) return true;

  return endDate >= today;
}

function isUpcomingRotation(rotation, today) {
  const startDate = parseDateSafe(rotation.start_date);
  if (!startDate) return false;
  return startDate > today;
}

function buildInternSchedule({ internId, rotations = [], orderedUnits = [], now = new Date() }) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const normalizedRotations = [...(Array.isArray(rotations) ? rotations : [])]
    .sort((a, b) => {
      const startA = parseDateSafe(a.start_date)?.getTime() ?? 0;
      const startB = parseDateSafe(b.start_date)?.getTime() ?? 0;
      if (startA !== startB) return startA - startB;
      return (a.id ?? 0) - (b.id ?? 0);
    })
    .map(withFallbackUnitName);

  const completed = normalizedRotations.filter((rotation) => isCompletedRotation(rotation, today));

  const current = normalizedRotations
    .filter((rotation) => isCurrentRotation(rotation, today))
    .sort((a, b) => {
      const startA = parseDateSafe(a.start_date)?.getTime() ?? 0;
      const startB = parseDateSafe(b.start_date)?.getTime() ?? 0;
      return startB - startA;
    })[0] || null;

  const completedUnitIds = new Set(completed.map((rotation) => rotation.unit_id).filter(Boolean));
  const currentUnitId = current?.unit_id ?? null;

  const upcomingByUnitId = normalizedRotations
    .filter((rotation) => isUpcomingRotation(rotation, today))
    .reduce((acc, rotation) => {
      if (!rotation.unit_id || acc.has(rotation.unit_id)) return acc;
      acc.set(rotation.unit_id, rotation);
      return acc;
    }, new Map());

  const upcoming = (Array.isArray(orderedUnits) ? orderedUnits : [])
    .filter((unit) => unit && unit.id)
    .filter((unit) => !completedUnitIds.has(unit.id) && unit.id !== currentUnitId)
    .map((unit) => {
      const existingUpcoming = upcomingByUnitId.get(unit.id);
      return {
        id: existingUpcoming?.id ?? `upcoming-${internId}-${unit.id}`,
        intern_id: internId,
        unit_id: unit.id,
        unit_name: unit.name,
        duration_days: unit.duration_days,
        workload: unit.workload,
        position: unit.position,
        start_date: existingUpcoming?.start_date ?? null,
        end_date: existingUpcoming?.end_date ?? null,
        is_manual_assignment: existingUpcoming?.is_manual_assignment ?? 0,
        is_dynamic_upcoming: true,
      };
    });

  return {
    completed,
    current,
    upcoming,
    rotations: normalizedRotations,
  };
}

module.exports = {
  buildInternSchedule,
  parseDateSafe,
};
