export const parseAnyDate = (val) => {
  if (!val || val === 'N/A' || val === '—') return null;
  if (typeof val === 'number') {
    const d = new Date(val > 1e11 ? val : val * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === 'N/A' || s === '—') return null;
    if (/^\d+$/.test(s)) {
      const num = Number(s);
      const d = new Date(num > 1e11 ? num : num * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    const ddmmyyyy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy, h = '0', m = '0', sec = '0'] = ddmmyyyy;
      // In Indian telecommunications / HDD apps, naive DD-MM-YYYY timestamps are strictly Asia/Kolkata (IST: UTC+05:30)
      const isoStr = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}+05:30`;
      const d = new Date(isoStr);
      return isNaN(d.getTime()) ? null : d;
    }
    // If naive ISO format like YYYY-MM-DDTHH:mm:ss without timezone, treat as IST (+05:30)
    if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(s) && !s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
      const clean = s.replace(' ', 'T');
      const d = new Date(`${clean}+05:30`);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  return null;
};

export const parseDateToYMD = (dateVal) => {
  if (!dateVal) return null;
  if (typeof dateVal === 'number' || (typeof dateVal === 'string' && /^\d+$/.test(dateVal.trim()))) {
    const num = Number(dateVal);
    const d = new Date(num > 1e11 ? num : num * 1000);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  if (typeof dateVal === 'string') {
    const s = dateVal.trim();
    const m_dd = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (m_dd) {
      const [, dd, mm, yyyy] = m_dd;
      return `${yyyy}-${mm}-${dd}`;
    }
    const m_yy = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (m_yy) {
      const [, yyyy, mm, dd] = m_yy;
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return null;
};

export const isShotStarted = (shot) => {
  if (!shot) return false;
  if ((shot.depthReadings && shot.depthReadings.length > 0) || (shot.depthReadingsCount > 0)) {
    return true;
  }
  if (Array.isArray(shot.depthCapture) && shot.depthCapture.length > 0) {
    return true;
  }
  if (shot.startTime || shot.hddStartTime || shot.endTime || shot.hddEndTime) {
    return true;
  }
  if (shot.photos && shot.photos.length > 0) {
    return true;
  }
  const status = String(shot.status || shot.taskStage || '').toUpperCase();
  if (status && !['PENDING', 'NOT_STARTED', 'LOCKED', 'PLANNED'].includes(status)) {
    return true;
  }
  return false;
};

export const hasHddShotOrTrenchingStarted = (executionData) => {
  if (!executionData) return false;
  if (Array.isArray(executionData.depthPoints) && executionData.depthPoints.length > 0) {
    return true;
  }
  const shots = executionData.shots || [];
  return shots.some(isShotStarted);
};

export const getVisiblePitsForMap = (executionData) => {
  if (!executionData) return [];
  // If HDD shot or trenching has NOT started, do not show pits on map
  if (!hasHddShotOrTrenchingStarted(executionData)) {
    return [];
  }

  const shots = executionData.shots || [];
  const startedShots = shots.filter(isShotStarted);

  if (startedShots.length > 0) {
    const startedPitKeys = new Set();
    startedShots.forEach(s => {
      if (s.startPit) {
        if (s.startPit.id) startedPitKeys.add(String(s.startPit.id));
        if (s.startPit.name) startedPitKeys.add(String(s.startPit.name));
        if (s.startPit.serialNo) startedPitKeys.add(String(s.startPit.serialNo));
      }
      if (s.startPitId) startedPitKeys.add(String(s.startPitId));
      if (s.startPitName) startedPitKeys.add(String(s.startPitName));

      if (s.endPit) {
        if (s.endPit.id) startedPitKeys.add(String(s.endPit.id));
        if (s.endPit.name) startedPitKeys.add(String(s.endPit.name));
        if (s.endPit.serialNo) startedPitKeys.add(String(s.endPit.serialNo));
      }
      if (s.endPitId) startedPitKeys.add(String(s.endPitId));
      if (s.endPitName) startedPitKeys.add(String(s.endPitName));
    });

    const allPits = executionData.pits || [];
    const connected = allPits.filter(pit => {
      if (!pit) return false;
      const pid = String(pit.id || '');
      const pname = String(pit.name || '');
      const pser = String(pit.serialNo || '');
      return startedPitKeys.has(pid) || startedPitKeys.has(pname) || startedPitKeys.has(pser);
    });
    if (connected.length > 0) {
      return connected;
    }
  }

  return executionData.pits || [];
};

export const filterHddExecutionByDate = (data, selectedDate) => {
  if (!data) return null;
  if (!selectedDate || selectedDate === 'ALL') return data;

  const targetDateYMD = parseDateToYMD(selectedDate) || selectedDate;

  // Render execution data from selectedDate up to present day live (>= targetDateYMD)
  const filteredDepthPoints = (data.depthPoints || []).filter(dp => {
    const dpDate = dp.executionDate || parseDateToYMD(dp.capturedAt);
    if (!dpDate) return true;
    return dpDate >= targetDateYMD;
  });

  // Filter Shots/Trenches from selectedDate up to present day live
  const filteredShots = (data.shots || []).filter(shot => {
    const shotDate = shot.executionDate || parseDateToYMD(shot.endTime || shot.startTime);
    if (!shotDate || shotDate >= targetDateYMD) return true;

    // Or check if it has depth points from selectedDate onwards
    const hasDpOnDate = (shot.depthReadings || []).some(dp => {
      const dDate = dp.executionDate || parseDateToYMD(dp.capturedAt);
      return !dDate || dDate >= targetDateYMD;
    });
    return hasDpOnDate;
  }).map(shot => {
    const shotDpsOnDate = (shot.depthReadings || []).filter(dp => {
      const dDate = dp.executionDate || parseDateToYMD(dp.capturedAt);
      return !dDate || dDate >= targetDateYMD;
    });

    let avgDepth = shot.depth;
    if (shotDpsOnDate.length > 0) {
      const sumD = shotDpsOnDate.reduce((s, r) => s + (r.depth || 0), 0);
      avgDepth = Number((sumD / shotDpsOnDate.length).toFixed(2));
    }

    return {
      ...shot,
      depth: avgDepth,
      depthReadingsCount: shotDpsOnDate.length,
      depthReadings: shotDpsOnDate,
      route: shotDpsOnDate.map(dp => [dp.lat, dp.lng])
    };
  });

  // Filter Pits: only include pits if HDD shot / trenching has started on or before this window!
  const hddStartedOnDate = filteredShots.some(isShotStarted) || filteredDepthPoints.length > 0;
  let filteredPits = [];
  if (hddStartedOnDate) {
    const activePitIds = new Set();
    filteredShots.forEach(s => {
      if (s.startPit && s.startPit.id) activePitIds.add(String(s.startPit.id));
      if (s.startPit && s.startPit.name) activePitIds.add(String(s.startPit.name));
      if (s.endPit && s.endPit.id) activePitIds.add(String(s.endPit.id));
      if (s.endPit && s.endPit.name) activePitIds.add(String(s.endPit.name));
    });

    filteredPits = (data.pits || []).filter(pit => {
      if (activePitIds.has(String(pit.id)) || activePitIds.has(String(pit.name)) || activePitIds.has(String(pit.serialNo))) {
        return true;
      }
      const pDate = pit.executionDate || parseDateToYMD(pit.diggingTime);
      return Boolean(pDate && pDate >= targetDateYMD);
    });
  }

  // Recalculate Statistics for selectedDateYMD
  let totalTrenchMeters = filteredShots.reduce((sum, s) => sum + s.lengthMeters, 0);
  const formattedTrenchDistance = totalTrenchMeters >= 1000 ? `${(totalTrenchMeters / 1000).toFixed(2)} km` : `${totalTrenchMeters.toFixed(2)} m`;

  let minDepth = Infinity, maxDepth = -Infinity;
  filteredDepthPoints.forEach(dp => {
    if (dp.depth > 0) {
      if (dp.depth < minDepth) minDepth = dp.depth;
      if (dp.depth > maxDepth) maxDepth = dp.depth;
    }
  });

  const depthRangeStr = (minDepth !== Infinity && maxDepth !== -Infinity) ? `${minDepth.toFixed(2)}m – ${maxDepth.toFixed(2)}m` : 'N/A';

  // Determine Latest Position & Green Bulb Timestamp for selectedDateYMD
  let latestPosition = null;
  let greenBulbTime = null;
  if (filteredDepthPoints.length > 0) {
    const lastDp = filteredDepthPoints[filteredDepthPoints.length - 1];
    latestPosition = { lat: lastDp.lat, lng: lastDp.lng, label: `Latest Depth Pt ${lastDp.pointNo} (${lastDp.depth}m)` };
    greenBulbTime = lastDp.capturedAt || lastDp.createdAt || null;
  } else if (filteredPits.length > 0) {
    const lastPit = filteredPits[filteredPits.length - 1];
    latestPosition = { lat: lastPit.lat, lng: lastPit.lng, label: `Latest Pit ${lastPit.id}` };
    greenBulbTime = lastPit.diggingTime || lastPit.createdAt || null;
  }

  const greenBulbIso = greenBulbTime ? (parseAnyDate(greenBulbTime)?.toISOString() || greenBulbTime) : (data.lastModified || data.updatedAt);

  return {
    ...data,
    selectedDate: targetDateYMD,
    shots: filteredShots,
    pits: filteredPits,
    depthPoints: filteredDepthPoints,
    updatedAt: greenBulbIso,
    lastModified: greenBulbIso,
    trench: {
      lengthMeters: totalTrenchMeters,
      formattedDistance: formattedTrenchDistance,
      numShots: filteredShots.length
    },
    latestPosition,
    statistics: {
      totalShots: filteredShots.length,
      totalPits: filteredPits.length,
      totalDepthReadings: filteredDepthPoints.length,
      formattedDistance: formattedTrenchDistance,
      depthRange: depthRangeStr
    }
  };
};

export const isMongoHexId = (val) => typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val.trim());

export const mapHddExecutionResponse = (task, execution = null) => {
  if (!task) return null;

  const loc = task.locationSnapshot || task.location || {};
  const execData = task?.taskExecution || execution?.data || execution || null;
  const fieldData = execData?.fieldData || execData?.trenching || execData || {};
  const trenching = fieldData?.trenching || execData?.trenching || fieldData || {};

  // Find human-readable task code (e.g. TASK-2026-54398, TASK-2026-55844), NEVER a 24-character Mongo hex ID
  const rawCodes = [
    task.taskCode,
    task.task_code,
    task.code,
    task.title,
    task.name,
    task.externalTaskId,
    task.id,
    task._id
  ];
  const readableTaskCode = rawCodes.find(c => c && typeof c === 'string' && !isMongoHexId(c)) || '';

  const taskDisplayName = String(
    task.displayName ||
    task.taskName ||
    (task.title && task.title !== readableTaskCode && !isMongoHexId(task.title) ? task.title : '') ||
    (task.name && task.name !== readableTaskCode && !isMongoHexId(task.name) ? task.name : '') ||
    loc.locationName ||
    ''
  );

  const ringVal = String(
    task.ring ||
    task.ringId ||
    task.ringCode ||
    task.ringName ||
    task.routeSnapshot?.ringId ||
    task.routeSnapshot?.ringName ||
    task.routeSnapshot?.ring ||
    loc.ringId ||
    loc.ringName ||
    loc.ring ||
    execData?.ring ||
    execData?.ringId ||
    execData?.ringCode ||
    ''
  );

  let cleanDescriptionSegment = '';
  if (task.description && typeof task.description === 'string') {
    const rawDesc = task.description.split('(')[0].split(' - Source')[0].split(' -Source')[0].trim();
    if (rawDesc && rawDesc.length > 2 && rawDesc.length < 80) {
      cleanDescriptionSegment = rawDesc;
    }
  }

  const segmentSnapshots = Array.isArray(task.segmentSnapshots) ? task.segmentSnapshots : [];
  const firstSeg = segmentSnapshots[0] || {};
  const segmentNameVal = String(
    (task.displayName && !task.displayName.toUpperCase().endsWith('-BOQ') && !task.displayName.toUpperCase().endsWith('-BLOCK') ? task.displayName : '') ||
    task.segmentName ||
    task.segment_name ||
    firstSeg.segmentName ||
    firstSeg.name ||
    firstSeg.displayName ||
    task.routeSnapshot?.segmentName ||
    task.routeSnapshot?.routeName ||
    cleanDescriptionSegment ||
    task.taskName ||
    (task.title && task.title !== readableTaskCode && !isMongoHexId(task.title) ? task.title : '') ||
    (task.name && task.name !== readableTaskCode && !isMongoHexId(task.name) ? task.name : '') ||
    task.displayName ||
    loc.locationName ||
    ''
  );

  const createMediaItem = (rawMedia, defaultLabel = 'Photo', isVidFallback = false) => {
    if (!rawMedia) return null;
    let urlKey = typeof rawMedia === 'string' ? rawMedia : (rawMedia.photoUrl || rawMedia.url || rawMedia.src);
    if (!urlKey) return null;

    const isVid = typeof rawMedia === 'object'
      ? Boolean(rawMedia.isVideo || (rawMedia.label || '').toLowerCase().includes('video'))
      : (isVidFallback || urlKey.includes('video'));

    const mediaCode = (rawMedia && (rawMedia.taskCode || rawMedia.taskId || rawMedia.task_id)) || readableTaskCode;
    const cleanMediaCode = isMongoHexId(mediaCode) ? readableTaskCode : mediaCode;
    const mediaRing = (rawMedia && (rawMedia.ring || rawMedia.ringId || rawMedia.ringCode)) || ringVal;
    const mediaSegName = (rawMedia && (rawMedia.segmentName || rawMedia.taskName || rawMedia.task_name)) || segmentNameVal;

    return {
      id: (rawMedia && rawMedia.id) || urlKey,
      key: urlKey,
      photoUrl: urlKey,
      url: urlKey,
      src: urlKey,
      label: (rawMedia && rawMedia.label) || defaultLabel,
      taskId: cleanMediaCode || '',
      taskCode: cleanMediaCode || '',
      taskName: mediaSegName,
      segmentName: mediaSegName,
      ring: mediaRing || '',
      ringId: mediaRing || '',
      capturedAt: (rawMedia && rawMedia.capturedAt) || null,
      latitude: rawMedia && rawMedia.latitude ? Number(rawMedia.latitude) : null,
      longitude: rawMedia && rawMedia.longitude ? Number(rawMedia.longitude) : null,
      remarks: rawMedia && rawMedia.remarks,
      isVideo: isVid
    };
  };

  const availableDatesSet = new Set();

  // 1. Extract Pits and Build Pit Lookup Map
  const rawPits = trenching?.pitDetails || fieldData?.pitDetails || execData?.pitDetails || execData?.pits || fieldData?.pits || [];
  const pitsMap = new Map();

  const pits = rawPits.map((p, idx) => {
    const lat = parseFloat(p.latitude || p.pitImage_1?.latitude || p.pitDepthImage?.latitude || (p.threePointReference?.pitDepthCenterOfTheRoadImage?.latitude) || 0);
    const lng = parseFloat(p.longitude || p.pitImage_1?.longitude || p.pitDepthImage?.longitude || (p.threePointReference?.pitDepthCenterOfTheRoadImage?.longitude) || 0);
    const pitId = p.pitSerialNo || p.pitName || `PIT-${idx + 1}`;

    const rawSide = p.pitSideOfTheRoad ||
      p.sideOfTheRoad ||
      p.pitSide ||
      p.side ||
      p.pit_side_of_the_road ||
      p.pit_side ||
      p.side_of_the_road ||
      p.roadSide ||
      p.road_side ||
      p.offsetSide ||
      p.threePointReference?.pitSideOfTheRoad ||
      p.threePointReference?.sideOfTheRoad ||
      p.threePointReference?.pitSide ||
      p.threePointReference?.side ||
      p.pitImage_1?.side ||
      p.pitImage_1?.pitSide ||
      '';

    let pitSide = 'Left (LHS)';
    if (rawSide) {
      const s = String(rawSide).trim();
      const lower = s.toLowerCase();
      if (lower.includes('lhs') || lower === 'left' || lower.startsWith('left')) {
        pitSide = 'Left (LHS)';
      } else if (lower.includes('rhs') || lower === 'right' || lower.startsWith('right')) {
        pitSide = 'Right (RHS)';
      } else if (lower.includes('center') || lower.includes('centre')) {
        pitSide = 'Center';
      } else {
        pitSide = s;
      }
    }

    const rawMediaList = [
      { media: p.pitImage_1, label: `${pitId} Photo 1`, isVid: false },
      { media: p.pitImage_2, label: `${pitId} Photo 2`, isVid: false },
      { media: p.pitImage_3, label: `${pitId} Photo 3`, isVid: false },
      { media: p.pitDepthImage, label: `${pitId} Depth Photo`, isVid: false },
      { media: p.pitWidthImage, label: `${pitId} Width Photo`, isVid: false },
      { media: p.pitVideo, label: `${pitId} Video`, isVid: true }
    ];

    const photos = [];
    rawMediaList.forEach(item => {
      const mediaObj = createMediaItem(item.media, item.label, item.isVid);
      if (mediaObj) {
        if (!mediaObj.latitude) mediaObj.latitude = lat;
        if (!mediaObj.longitude) mediaObj.longitude = lng;
        if (!mediaObj.capturedAt && p.pitDiggingTime) mediaObj.capturedAt = p.pitDiggingTime;
        mediaObj.side = pitSide;
        mediaObj.pitSide = pitSide;
        mediaObj.isPitPhoto = true;
        mediaObj.depth = p.pitDepth ? Number(p.pitDepth) : null;
        photos.push(mediaObj);
      }
    });

    const pitTime = p.pitDiggingTime || p.createdAt || p.updatedAt || p.date || p.diggingTime || (p.pitImage_1 || {}).capturedAt || (p.pitDepthImage || {}).capturedAt;
    const executionDate = parseDateToYMD(pitTime);
    if (executionDate) availableDatesSet.add(executionDate);

    const pitObj = {
      id: pitId,
      serialNo: p.pitSerialNo || pitId,
      name: p.pitName || pitId,
      lat,
      lng,
      depth: p.pitDepth ? Number(p.pitDepth) : null,
      width: p.pitWidth ? Number(p.pitWidth) : null,
      side: pitSide,
      pitSide: pitSide,
      type: p.pitType || 'COUPLING_POINT',
      stage: p.taskStage || 'LOCKED',
      diggingTime: p.pitDiggingTime || 'N/A',
      executionDate,
      photos,
      userId: String(task.userId || task.assigneeId || (task.assigneeSnapshot || {}).userId || (task.assigneeSnapshot || {}).id || task.assignedTo || ''),
      user: task.userName || task.assigneeName || (task.assigneeSnapshot || {}).name || task.assignedTo?.name || 'Field Supervisor',
    };

    if (pitId) pitsMap.set(pitId, pitObj);
    if (p.pitName) pitsMap.set(p.pitName, pitObj);
    if (p.pitSerialNo) pitsMap.set(p.pitSerialNo, pitObj);
    return pitObj;
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0);

  // 2. Extract HDD Shots / Trenches (Pit-to-Pit)
  const rawShots = Array.isArray(trenching?.hddShot) ? trenching.hddShot :
    (Array.isArray(fieldData?.hddShot) ? fieldData.hddShot :
      (Array.isArray(execData?.hddShot) ? execData.hddShot :
        (Array.isArray(execData?.shots) ? execData.shots :
          (Array.isArray(fieldData?.shots) ? fieldData.shots : []))));
  let allDepthReadings = [];
  let minDepth = Infinity;
  let maxDepth = -Infinity;

  const shots = rawShots.map((shot, sIdx) => {
    const shotId = shot.hddShotSerialNo || shot.hddShotName || `TRENCH-${sIdx + 1}`;
    const startPit = pitsMap.get(shot.startPitId) || pitsMap.get(shot.startPitName) || null;
    const endPit = pitsMap.get(shot.endPitId) || pitsMap.get(shot.endPitName) || null;

    const trenchPhotos = [];
    const startPhotoObj = createMediaItem(shot.startHddShotImage, `Trench ${shotId} Start Photo`);
    if (startPhotoObj) trenchPhotos.push(startPhotoObj);

    const pitVideoObj = createMediaItem(shot.pitToPitVideo, `Trench ${shotId} Pit-to-Pit Video`, true);
    if (pitVideoObj) trenchPhotos.push(pitVideoObj);

    const shotTime = shot.hddEndTime || shot.hddStartTime || shot.hddDate || shot.createdAt || shot.updatedAt || shot.date || shot.startTime || shot.endTime;
    const executionDate = parseDateToYMD(shotTime);
    if (executionDate) availableDatesSet.add(executionDate);

    const rawCaptures = Array.isArray(shot.depthCapture) ? shot.depthCapture : [];
    const depthReadings = rawCaptures.map((dp, dIdx) => {
      const photoObj = dp.depthoMeterImage || dp.photo || dp.photoUrl || dp.image || null;
      const lat = parseFloat(dp.latitude || (photoObj && photoObj.latitude) || 0);
      const lng = parseFloat(dp.longitude || (photoObj && photoObj.longitude) || 0);
      const capturedAt = dp.capturedAt || dp.createdAt || dp.createdTime || dp.timestamp || dp.time || dp.date || (photoObj && photoObj.capturedAt) || null;
      const dpDate = parseDateToYMD(capturedAt) || executionDate;
      if (dpDate) availableDatesSet.add(dpDate);

      const dVal = Number(dp.depth || 0);
      if (dVal > 0) {
        if (dVal < minDepth) minDepth = dVal;
        if (dVal > maxDepth) maxDepth = dVal;
      }

      const dpMedia = createMediaItem(photoObj, `Depth Point ${dIdx + 1} (${dVal}m)`);
      const dpPhotos = [];
      if (dpMedia) {
        dpMedia.depth = dVal;
        if (!dpMedia.latitude) dpMedia.latitude = lat;
        if (!dpMedia.longitude) dpMedia.longitude = lng;
        if (!dpMedia.capturedAt) dpMedia.capturedAt = capturedAt;
        dpPhotos.push(dpMedia);
      }

      const dpRing = (photoObj && (photoObj.ring || photoObj.ringId || photoObj.ringCode)) || dp.ring || dp.ringId || dp.ringCode || ringVal;
      const dpSegName = dp.segmentName || dp.segment_name || dp.taskName || (photoObj && photoObj.taskName) || segmentNameVal;

      const dpCodeCandidate = [
        dp.taskCode,
        dp.task_code,
        dp.taskId,
        photoObj?.taskCode,
        photoObj?.taskId,
        readableTaskCode
      ].find(c => c && typeof c === 'string' && !isMongoHexId(c)) || readableTaskCode;

      return {
        id: dp.id || dp.depthPointId || `DPT-${shotId}-${dIdx + 1}`,
        pointNo: dIdx + 1,
        taskId: dpCodeCandidate,
        taskCode: dpCodeCandidate,
        taskName: dpSegName,
        segmentName: dpSegName,
        ring: dpRing,
        ringId: dpRing,
        depth: dVal,
        temp: dp.temperature,
        offset: dp.offsetFromCenterOfRoad,
        lat,
        lng,
        capturedAt,
        executionDate: dpDate,
        photo: photoObj,
        photos: dpPhotos,
        userId: String(task.userId || task.assigneeId || (task.assigneeSnapshot || {}).userId || (task.assigneeSnapshot || {}).id || task.assignedTo || ''),
        user: task.userName || task.assigneeName || (task.assigneeSnapshot || {}).name || task.assignedTo?.name || 'Field Supervisor',
      };
    }).filter(dp => !isNaN(dp.lat) && !isNaN(dp.lng) && dp.lat !== 0);

    allDepthReadings = allDepthReadings.concat(depthReadings);

    let avgDepth = 0;
    if (depthReadings.length > 0) {
      const sumD = depthReadings.reduce((s, r) => s + (r.depth || 0), 0);
      avgDepth = Number((sumD / depthReadings.length).toFixed(2));
    } else if (shot.depth) {
      avgDepth = Number(shot.depth);
    }

    // Only construct route from actual depth readings (NO pit to pit lines)
    const routeCoords = depthReadings.map(dp => [dp.lat, dp.lng]);

    const lengthMeters = Number(shot.tentativeShotLength) || 0;
    const formattedLength = lengthMeters >= 1000 ? `${(lengthMeters / 1000).toFixed(2)} km` : `${lengthMeters.toFixed(2)} m`;

    let midLat = 0, midLng = 0;
    if (routeCoords.length > 0) {
      const midIdx = Math.floor(routeCoords.length / 2);
      midLat = routeCoords[midIdx][0];
      midLng = routeCoords[midIdx][1];
    }

    return {
      id: shotId,
      serialNo: shot.hddShotSerialNo || shotId,
      name: shot.hddShotName || `${startPit?.name || 'Start Pit'} → ${endPit?.name || 'End Pit'}`,
      startPit,
      endPit,
      depth: avgDepth,
      depthReadingsCount: depthReadings.length,
      depthReadings,
      photos: trenchPhotos,
      lengthMeters,
      formattedLength,
      route: routeCoords,
      midpoint: { lat: midLat, lng: midLng },
      startTime: shot.hddStartTime || null,
      endTime: shot.hddEndTime || null,
      executionDate,
      cableType: shot.cableType || 'OFC',
      strataType: shot.strataType || 'Normal Soil',
      userId: String(task.userId || task.assigneeId || (task.assigneeSnapshot || {}).userId || (task.assigneeSnapshot || {}).id || task.assignedTo || ''),
      user: task.userName || task.assigneeName || (task.assigneeSnapshot || {}).name || task.assignedTo?.name || 'Field Supervisor',
    };
  });

  let totalTrenchMeters = shots.reduce((sum, s) => sum + s.lengthMeters, 0);
  const formattedTrenchDistance = totalTrenchMeters >= 1000 ? `${(totalTrenchMeters / 1000).toFixed(2)} km` : `${totalTrenchMeters.toFixed(2)} m`;
  const depthRangeStr = (minDepth !== Infinity && maxDepth !== -Infinity) ? `${minDepth.toFixed(2)}m – ${maxDepth.toFixed(2)}m` : 'N/A';

  let latestPosition = null;
  let greenBulbTime = null;
  if (allDepthReadings.length > 0) {
    const lastDp = allDepthReadings[allDepthReadings.length - 1];
    latestPosition = { lat: lastDp.lat, lng: lastDp.lng, label: `Latest Depth Pt ${lastDp.pointNo} (${lastDp.depth}m)` };
    greenBulbTime = lastDp.capturedAt || lastDp.createdAt || null;
  } else if (pits.length > 0 && hasHddShotOrTrenchingStarted({ shots, depthPoints: allDepthReadings })) {
    const lastPit = pits[pits.length - 1];
    latestPosition = { lat: lastPit.lat, lng: lastPit.lng, label: `Latest Pit ${lastPit.id}` };
    greenBulbTime = lastPit.diggingTime || lastPit.createdAt || null;
  }

  const availableDates = Array.from(availableDatesSet).sort();

  // Last Modified is strictly based on the green bulb (latest physical depth point / pit)
  let latestDateObj = parseAnyDate(greenBulbTime);

  // Fallback to shots or task dates only if no physical depth points or pits exist
  if (!latestDateObj) {
    const candidateDates = [
      task.updatedAt,
      task.lastModified,
      task.modifiedAt,
      task.createdAt,
      execution?.updatedAt,
      execution?.createdAt,
      task.taskExecution?.updatedAt,
      task.taskExecution?.createdAt,
      execData?.updatedAt,
      execData?.createdAt,
      fieldData?.submittedAt,
    ];

    shots.forEach(s => {
      candidateDates.push(s.endTime, s.startTime, s.updatedAt, s.createdAt);
    });

    let maxTime = -Infinity;
    candidateDates.forEach(val => {
      const d = parseAnyDate(val);
      if (d && d.getTime() > maxTime) {
        maxTime = d.getTime();
        latestDateObj = d;
      }
    });
  }

  const finalUpdatedAt = latestDateObj ? latestDateObj.toISOString() : (task.updatedAt || null);
  const finalLastModified = latestDateObj ? latestDateObj.toISOString() : (task.updatedAt || null);
  const finalDate = latestDateObj ? latestDateObj.toISOString().split('T')[0] : (task.updatedAt ? new Date(task.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

  return {
    id: String(task.id || task._id || ''),
    mongoId: String(task.id || task._id || ''),
    taskId: readableTaskCode,
    taskCode: readableTaskCode,
    displayName: taskDisplayName || loc.locationName || 'HDD Execution Task',
    taskName: taskDisplayName,
    ring: ringVal,
    ringId: ringVal,
    state: loc.circle || task.circle || task.state || loc.state || 'RAJASTHAN',
    district: loc.district || task.district || loc.districtName || 'OTHER',
    block: loc.blockName || loc.block || task.block || task.blockName || 'OTHER',
    userId: String(task.userId || task.assigneeId || task.assigneeSnapshot?.userId || task.assigneeSnapshot?.id || task.assignedTo || (task.taskExecution || {}).userId || (task.taskExecution || {}).createdById || ''),
    user: task.userName || task.assigneeName || task.assigneeSnapshot?.name || task.assignee?.name || task.assignedTo?.name || task.user?.name || task.username || 'Field Supervisor',
    userRole: task.assigneeSnapshot?.designation || task.assignee?.designation || 'Project Manager',
    vendorId: task.vendorId,
    vendorName: task.vendorName,
    date: finalDate,
    updatedAt: finalUpdatedAt,
    lastModified: finalLastModified,
    status: task.status || 'CREATED',
    workExecutionMode: fieldData?.workExecutionMode || (trenching ? 'HDD' : 'N/A'),
    shots,
    pits,
    depthPoints: allDepthReadings,
    availableDates,
    trench: {
      lengthMeters: totalTrenchMeters,
      formattedDistance: formattedTrenchDistance,
      numShots: shots.length
    },
    latestPosition,
    statistics: {
      totalShots: shots.length,
      totalPits: pits.length,
      totalDepthReadings: allDepthReadings.length,
      formattedDistance: formattedTrenchDistance,
      depthRange: depthRangeStr
    }
  };
};

export const mergeMultipleTasksExecution = (tasksList, activeDate = null, options = {}) => {
  if (!Array.isArray(tasksList) || tasksList.length === 0) return null;

  const normalizedList = tasksList.map(t => mapHddExecutionResponse(t)).filter(Boolean);
  if (normalizedList.length === 0) return null;

  const primary = normalizedList[0];
  const allShots = [];
  const allPits = [];
  const allDepthPoints = [];
  const seenShots = new Set();
  const seenPits = new Set();
  const seenDepthPoints = new Set();
  const availableDatesSet = new Set();
  const usersSet = new Set();

  normalizedList.forEach(t => {
    if (t.user && t.user !== 'Field Supervisor') usersSet.add(t.user);
    (t.availableDates || []).forEach(d => availableDatesSet.add(d));

    (t.shots || []).forEach(s => {
      const k = `${s.id || s.serialNo || s.name || ''}_${s.startTime || ''}_${s.endTime || ''}`;
      if (!seenShots.has(k)) {
        seenShots.add(k);
        allShots.push({
          ...s,
          user: s.user || t.user,
          userId: s.userId || t.userId,
        });
      }
    });

    (t.pits || []).forEach(p => {
      const k = `${p.id || p.serialNo || p.name || ''}_${p.diggingTime || ''}_${p.lat}_${p.lng}`;
      if (!seenPits.has(k)) {
        seenPits.add(k);
        allPits.push({
          ...p,
          user: p.user || t.user,
          userId: p.userId || t.userId,
        });
      }
    });

    (t.depthPoints || []).forEach(dp => {
      const k = `${dp.id || ''}_${dp.lat}_${dp.lng}_${dp.capturedAt || ''}_${dp.depth || ''}`;
      if (!seenDepthPoints.has(k)) {
        seenDepthPoints.add(k);
        allDepthPoints.push({
          ...dp,
          user: dp.user || t.user,
          userId: dp.userId || t.userId,
          taskCode: dp.taskCode || t.taskCode,
          taskId: dp.taskId || t.taskId,
        });
      }
    });
  });

  const availableDates = Array.from(availableDatesSet).sort();
  const isBlockMode = options.mode === 'block' || options.isBlock;

  let latestPosition = null;
  let greenBulbTime = null;
  let maxTime = -Infinity;

  allDepthPoints.forEach(dp => {
    const d = parseAnyDate(dp.capturedAt || dp.createdAt);
    if (d && d.getTime() > maxTime) {
      maxTime = d.getTime();
      greenBulbTime = d.toISOString();
      latestPosition = { lat: dp.lat, lng: dp.lng, label: `Latest Depth Pt ${dp.pointNo || ''} (${dp.depth}m)` };
    }
  });

  if (!greenBulbTime) {
    allPits.forEach(p => {
      const d = parseAnyDate(p.diggingTime || p.createdAt);
      if (d && d.getTime() > maxTime) {
        maxTime = d.getTime();
        greenBulbTime = d.toISOString();
        latestPosition = { lat: p.lat, lng: p.lng, label: `Latest Pit ${p.id || ''}` };
      }
    });
  }

  if (!greenBulbTime && normalizedList.length > 0) {
    normalizedList.forEach(t => {
      const d = parseAnyDate(t.updatedAt || t.lastModified);
      if (d && d.getTime() > maxTime) {
        maxTime = d.getTime();
        greenBulbTime = d.toISOString();
      }
    });
  }

  const totalTrenchMeters = allShots.reduce((sum, s) => sum + (s.lengthMeters || 0), 0);
  const formattedTrenchDistance = totalTrenchMeters >= 1000 ? `${(totalTrenchMeters / 1000).toFixed(2)} km` : `${totalTrenchMeters.toFixed(2)} m`;

  const depths = allDepthPoints.map(dp => Number(dp.depth)).filter(d => !isNaN(d) && d > 0);
  const minDepth = depths.length > 0 ? Math.min(...depths) : 0;
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
  const depthRangeStr = depths.length > 0 ? `${minDepth.toFixed(2)}m – ${maxDepth.toFixed(2)}m` : 'N/A';

  const userDisplayName = isBlockMode
    ? `Block ${options.block || primary.block} (${usersSet.size} ${usersSet.size === 1 ? 'user' : 'users'})`
    : (options.userName || primary.user);

  return {
    id: options.taskId || primary.id || 'merged-task',
    mongoId: primary.mongoId || primary.id,
    taskId: options.taskCode || primary.taskCode || (isBlockMode ? `BLOCK-${primary.block}` : primary.taskId),
    taskCode: options.taskCode || primary.taskCode || (isBlockMode ? `BLOCK-${primary.block}` : primary.taskCode),
    displayName: isBlockMode ? `Block: ${options.block || primary.block}` : `Task Execution: ${userDisplayName}`,
    taskName: isBlockMode ? `Block: ${options.block || primary.block}` : `Task Execution: ${userDisplayName}`,
    ring: primary.ring,
    ringId: primary.ringId,
    state: options.state || primary.state,
    district: options.district || primary.district,
    block: options.block || primary.block,
    userId: isBlockMode ? 'BLOCK' : (options.userId || primary.userId),
    user: isBlockMode ? `Full Block: ${options.block || primary.block}` : (options.userName || primary.user),
    userRole: isBlockMode ? 'Block Level' : primary.userRole,
    usersList: Array.from(usersSet),
    isBlockMap: isBlockMode,
    vendorId: primary.vendorId,
    vendorName: primary.vendorName,
    date: greenBulbTime ? greenBulbTime.split('T')[0] : (primary.date || new Date().toISOString().split('T')[0]),
    updatedAt: greenBulbTime || primary.updatedAt,
    lastModified: greenBulbTime || primary.lastModified,
    status: primary.status,
    workExecutionMode: primary.workExecutionMode,
    shots: allShots,
    pits: allPits,
    depthPoints: allDepthPoints,
    latestPosition: latestPosition || primary.latestPosition,
    availableDates,
    trench: {
      lengthMeters: totalTrenchMeters,
      formattedDistance: formattedTrenchDistance,
      numShots: allShots.length
    },
    statistics: {
      totalShots: allShots.length,
      totalPits: allPits.length,
      totalDepthReadings: allDepthPoints.length,
      formattedDistance: formattedTrenchDistance,
      depthRange: depthRangeStr
    }
  };
};

