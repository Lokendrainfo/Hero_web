export const normalizeTask = (t, vendorMasterMap = {}) => {
  if (!t) return null;

  try {
    const id = String(t.id || t._id || t.taskCode || '');
    const taskCode = String(t.taskCode || t.title || t.code || 'TASK-2026');
    const displayName = String(t.displayName || t.location?.locationName || t.locationSnapshot?.locationName || t.routeSnapshot?.routeName || 'Fiber Execution Task');
    const taskType = String(t.taskType || t.type || 'FIBER_TRENCHING_DUCTING_TASK');
    const status = String(t.status || 'CREATED');
    const approvalStatus = String(t.approvalStatus || 'PENDING');

    // STRICT RULE: Vendor MUST be resolved via vendorId
    const vendorId = String(
      t.vendorId ||
      t.assignedVendorId ||
      t.vendorSnapshot?.id ||
      t.vendorSnapshot?._id ||
      t.vendor?.id ||
      ''
    ).trim();

    const cleanVId = vendorId.toLowerCase();

    const knownMap = {
      '6a852f2600cd99ac6337f4a9': 'HARPAL INFRA DEVELOPMENT',
      '6a7c2b4f8e16e804697f18b0': 'Gurukripa Enterprises',
      '6a8bdb93b8fd1ac215ebfeed': 'KHALSA TELECOM',
      '6a7e941d4312cab2fd6d36cc': 'Hero Infrastructure',
      '6a8a77d5b8fd1ac215ebfeeb': 'Naveen Telecom',
      '6a8badb1b8fd1ac215ebfeec': 'Naveen Telecom Network',
      '6a97b260544bdedf53d4ec0c': 'Naveen Telecom Network 1',
      '6a9d22c43fe4e1b061d189a9': 'Naveen Telecom Network 2',
      '6a82e6f24312cab2fd6d36cd': 'Pranjal Enterprises',
      '6a8fc284544bdedf53d4ec09': 'Raj Enterprises'
    };

    let vendorName = vendorId ? 'Vendor' : 'Unassigned';
    if (cleanVId && vendorMasterMap && vendorMasterMap[cleanVId]) {
      const vObj = vendorMasterMap[cleanVId];
      vendorName = vObj?.partnerName || vObj?.name || vendorName;
    } else if (t.vendorSnapshot?.partnerName) {
      vendorName = t.vendorSnapshot.partnerName;
    } else if (t.vendorSnapshot?.name) {
      vendorName = t.vendorSnapshot.name;
    } else if (cleanVId && knownMap[cleanVId]) {
      vendorName = knownMap[cleanVId];
    } else if (t.vendorName && t.vendorName !== 'Telecrats' && t.vendorName !== 'HERO INFRASTRUCTURE') {
      vendorName = t.vendorName;
    } else if (cleanVId) {
      vendorName = `Vendor (${vendorId.substring(0, 8)})`;
    }

    // Assignee User (Person vs Firm)
    const assigneeUserId = String(t.assigneeUserId || t.assigneeSnapshot?.userId || t.assigneeSnapshot?.id || '');
    const assigneeName = String(t.assigneeName || t.assigneeSnapshot?.name || 'Unassigned User');
    const assigneeSnapshot = t.assigneeSnapshot || { name: assigneeName, userId: assigneeUserId };

    // Location Snapshot
    const locationCode = String(t.locationCode || t.locationSnapshot?.locationCode || '');
    const locationSnapshot = t.locationSnapshot || t.location || {};

    // Route & Segment Snapshots
    const routeSnapshot = t.routeSnapshot || {};
    const segmentSnapshots = t.segmentSnapshots || [];

    // Scopes & Metrics
    const childRoutes = Array.isArray(routeSnapshot.routes) ? routeSnapshot.routes : [];
    let totalLengthKm = 0;
    if (childRoutes.length > 0) {
      totalLengthKm = childRoutes.reduce((acc, r) => acc + (Number(r.lengthKm) || 0), 0);
    } else if (routeSnapshot.lengthKm) {
      totalLengthKm = Number(routeSnapshot.lengthKm);
    } else if (t.totalLengthKm) {
      totalLengthKm = Number(t.totalLengthKm);
    }
    totalLengthKm = Number(Number(totalLengthKm).toFixed(2));

    // Calculate execution telemetry shot length if available
    const execShots = t.taskExecution?.fieldData?.trenching?.hddShot || t.taskExecution?.shots || t.shots || [];
    const execMetersFromShots = Array.isArray(execShots) ? execShots.reduce((sum, s) => sum + (Number(s.lengthMeters || s.tentativeShotLength || 0) || 0), 0) : 0;
    const execKmFromShots = execMetersFromShots > 0 ? execMetersFromShots / 1000 : 0;

    const candidatePcts = [];
    const checkAndPush = (val) => {
      if (val != null && !isNaN(Number(val))) {
        const n = Number(val);
        if (n >= 0) candidatePcts.push(n);
      }
    };

    checkAndPush(t.progress_percent);
    checkAndPush(t.pct);
    checkAndPush(t.progressPercentage);
    checkAndPush(t.progress_percentage);
    checkAndPush(t.completionPercentage);
    checkAndPush(t.completion_percentage);
    checkAndPush(t.progress);
    checkAndPush(t.percentage);
    checkAndPush(t.percent);
    checkAndPush(t.taskExecution?.progressPercentage);
    checkAndPush(t.taskExecution?.progress_percent);
    checkAndPush(t.taskExecution?.progress_percentage);
    checkAndPush(t.taskExecution?.pct);
    checkAndPush(t.taskExecution?.percentage);
    checkAndPush(t.taskExecution?.completionPercentage);
    checkAndPush(t.taskExecution?.fieldData?.trenching?.progress_percent);
    checkAndPush(t.taskExecution?.fieldData?.progressPercentage);
    checkAndPush(t.routeSnapshot?.progress_percent);
    checkAndPush(t.routeSnapshot?.progressPercentage);
    checkAndPush(t.routeSnapshot?.pct);

    let rawPct = candidatePcts.length > 0 ? Math.max(...candidatePcts) : 0;

    const statusStrUpper = String(t.status || t.taskStage || '').toUpperCase();
    if (statusStrUpper === 'COMPLETED' || statusStrUpper === 'COMPLETE') {
      rawPct = 100;
    }

    let coveredLengthKm = 0;
    if (t.coveredLengthKm && Number(t.coveredLengthKm) > 0) {
      coveredLengthKm = Number(t.coveredLengthKm);
    } else if (t.coveredLengthMeters && Number(t.coveredLengthMeters) > 0) {
      coveredLengthKm = Number(t.coveredLengthMeters) / 1000;
    } else if (t.coveredScopeKm && Number(t.coveredScopeKm) > 0) {
      coveredLengthKm = Number(t.coveredScopeKm);
    } else if (execKmFromShots > 0) {
      coveredLengthKm = execKmFromShots;
    } else if (rawPct > 0 && totalLengthKm > 0) {
      coveredLengthKm = (totalLengthKm * rawPct) / 100;
    }
    coveredLengthKm = Number(Number(coveredLengthKm).toFixed(2));

    let pct = 0;
    if (totalLengthKm > 0 && coveredLengthKm > 0) {
      pct = Math.min(100, Math.round((coveredLengthKm / totalLengthKm) * 100));
    } else if (rawPct > 0) {
      pct = Math.min(100, Math.round(rawPct));
    }

    const coveredScopeStr = typeof t.coveredScopeStr === 'string'
      ? t.coveredScopeStr.replace(/-?\d+(?:\.\d+)?/g, (n) => Number(n).toFixed(2))
      : `${coveredLengthKm.toFixed(2)} km`;

    // Hierarchy & Timestamps
    const parentTaskId = t.parentTaskId || null;
    const rootTaskId = t.rootTaskId || null;
    const depth = t.depth || 0;

    const createdAt = t.createdAt || null;
    const updatedAt = t.updatedAt || null;
    const dueDate = t.dueDate || null;

    const executionStatus = t.taskExecution ? 'AVAILABLE' : 'UNAVAILABLE';

    return {
      id,
      taskCode,
      displayName,
      taskType,
      status,
      approvalStatus,
      vendorId,
      vendorName,
      assigneeUserId,
      assigneeName,
      assigneeSnapshot,
      locationCode,
      locationSnapshot,
      routeSnapshot,
      segmentSnapshots,
      totalLengthKm,
      coveredLengthKm,
      progress_percent: pct,
      pct,
      coveredScopeStr,
      parentTaskId,
      rootTaskId,
      depth,
      createdAt,
      updatedAt,
      dueDate,
      executionStatus,
      raw: t
    };
  } catch (err) {
    console.error('[normalizeTask] Error normalizing item:', err, t);
    return {
      ...t,
      id: String(t?.id || t?._id || t?.taskCode || Math.random()),
      taskCode: String(t?.taskCode || t?.title || 'TASK-2026'),
      displayName: String(t?.displayName || t?.location?.locationName || 'Fiber Task'),
      taskType: String(t?.taskType || t?.type || 'FIBER_TRENCHING_DUCTING_TASK')
    };
  }
};
