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

  // Filter Pits created from selectedDate onwards or connected to filteredShots
  const activePitIds = new Set();
  filteredShots.forEach(s => {
    if (s.startPit && s.startPit.id) activePitIds.add(s.startPit.id);
    if (s.endPit && s.endPit.id) activePitIds.add(s.endPit.id);
  });

  const filteredPits = (data.pits || []).filter(pit => {
    const pDate = pit.executionDate || parseDateToYMD(pit.diggingTime);
    if (!pDate || pDate >= targetDateYMD) return true;
    if (activePitIds.has(pit.id)) return true;
    return false;
  });

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

  // Determine Latest Position for selectedDateYMD
  let latestPosition = null;
  if (filteredDepthPoints.length > 0) {
    const lastDp = filteredDepthPoints[filteredDepthPoints.length - 1];
    latestPosition = { lat: lastDp.lat, lng: lastDp.lng, label: `Latest Depth Dt ${lastDp.pointNo} (${lastDp.depth}m)` };
  } else if (filteredPits.length > 0) {
    const lastPit = filteredPits[filteredPits.length - 1];
    latestPosition = { lat: lastPit.lat, lng: lastPit.lng, label: `Latest Pit ${lastPit.id}` };
  }

  return {
    ...data,
    selectedDate: targetDateYMD,
    shots: filteredShots,
    pits: filteredPits,
    depthPoints: filteredDepthPoints,
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

export const mapHddExecutionResponse = (task, execution = null) => {
  if (!task) return null;

  const loc = task.locationSnapshot || task.location || {};
  const execData = task.taskExecution || execution?.data || execution || null;
  const fieldData = execData?.fieldData || (execData && !execData.id ? execData : {});
  const trenching = fieldData?.trenching || null;

  const createMediaItem = (rawMedia, defaultLabel = 'Photo', isVidFallback = false) => {
    if (!rawMedia) return null;
    let urlKey = typeof rawMedia === 'string' ? rawMedia : (rawMedia.photoUrl || rawMedia.url || rawMedia.src);
    if (!urlKey) return null;

    const isVid = typeof rawMedia === 'object'
      ? Boolean(rawMedia.isVideo || (rawMedia.label || '').toLowerCase().includes('video'))
      : (isVidFallback || urlKey.includes('video'));

    return {
      id: (rawMedia && rawMedia.id) || urlKey,
      key: urlKey,
      photoUrl: urlKey,
      url: urlKey,
      src: urlKey,
      label: (rawMedia && rawMedia.label) || defaultLabel,
      capturedAt: (rawMedia && rawMedia.capturedAt) || null,
      latitude: rawMedia && rawMedia.latitude ? Number(rawMedia.latitude) : null,
      longitude: rawMedia && rawMedia.longitude ? Number(rawMedia.longitude) : null,
      remarks: rawMedia && rawMedia.remarks,
      isVideo: isVid
    };
  };

  const availableDatesSet = new Set();

  // 1. Extract Pits and Build Pit Lookup Map
  const rawPits = trenching?.pitDetails || fieldData?.pitDetails || [];
  const pitsMap = new Map();

  const pits = rawPits.map((p, idx) => {
    const lat = parseFloat(p.latitude || p.pitImage_1?.latitude || p.pitDepthImage?.latitude || (p.threePointReference?.pitDepthCenterOfTheRoadImage?.latitude) || 0);
    const lng = parseFloat(p.longitude || p.pitImage_1?.longitude || p.pitDepthImage?.longitude || (p.threePointReference?.pitDepthCenterOfTheRoadImage?.longitude) || 0);
    const pitId = p.pitSerialNo || p.pitName || `PIT-${idx + 1}`;

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
        photos.push(mediaObj);
      }
    });

    const executionDate = parseDateToYMD(p.pitDiggingTime) || parseDateToYMD((p.pitImage_1 || {}).capturedAt);
    if (executionDate) availableDatesSet.add(executionDate);

    const pitObj = {
      id: pitId,
      serialNo: p.pitSerialNo || pitId,
      name: p.pitName || pitId,
      lat,
      lng,
      depth: p.pitDepth ? Number(p.pitDepth) : null,
      width: p.pitWidth ? Number(p.pitWidth) : null,
      side: p.pitSide || 'LHS',
      type: p.pitType || 'COUPLING_POINT',
      stage: p.taskStage || 'LOCKED',
      diggingTime: p.pitDiggingTime || 'N/A',
      executionDate,
      photos
    };

    if (pitId) pitsMap.set(pitId, pitObj);
    if (p.pitName) pitsMap.set(p.pitName, pitObj);
    if (p.pitSerialNo) pitsMap.set(p.pitSerialNo, pitObj);
    return pitObj;
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0);

  // 2. Extract HDD Shots / Trenches (Pit-to-Pit)
  const rawShots = Array.isArray(trenching?.hddShot) ? trenching.hddShot : (Array.isArray(fieldData?.hddShot) ? fieldData.hddShot : []);
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

    const executionDate = parseDateToYMD(shot.hddEndTime) || parseDateToYMD(shot.hddStartTime) || parseDateToYMD(shot.hddDate);
    if (executionDate) availableDatesSet.add(executionDate);

    const rawCaptures = Array.isArray(shot.depthCapture) ? shot.depthCapture : [];
    const depthReadings = rawCaptures.map((dp, dIdx) => {
      const photoObj = dp.depthoMeterImage || dp.photo || dp.photoUrl || dp.image || null;
      const lat = parseFloat(dp.latitude || (photoObj && photoObj.latitude) || 0);
      const lng = parseFloat(dp.longitude || (photoObj && photoObj.longitude) || 0);
      const capturedAt = dp.capturedAt || dp.createdAt || dp.createdTime || (photoObj && photoObj.capturedAt) || null;
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

      return {
        id: dp.id || dp.depthPointId || `DPT-${shotId}-${dIdx + 1}`,
        pointNo: dIdx + 1,
        depth: dVal,
        temp: dp.temperature,
        offset: dp.offsetFromCenterOfRoad,
        lat,
        lng,
        capturedAt,
        executionDate: dpDate,
        photo: photoObj,
        photos: dpPhotos
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
      strataType: shot.strataType || 'Normal Soil'
    };
  });

  let totalTrenchMeters = shots.reduce((sum, s) => sum + s.lengthMeters, 0);
  const formattedTrenchDistance = totalTrenchMeters >= 1000 ? `${(totalTrenchMeters / 1000).toFixed(2)} km` : `${totalTrenchMeters.toFixed(2)} m`;
  const depthRangeStr = (minDepth !== Infinity && maxDepth !== -Infinity) ? `${minDepth.toFixed(2)}m – ${maxDepth.toFixed(2)}m` : 'N/A';

  let latestPosition = null;
  if (allDepthReadings.length > 0) {
    const lastDp = allDepthReadings[allDepthReadings.length - 1];
    latestPosition = { lat: lastDp.lat, lng: lastDp.lng, label: `Latest Depth Pt ${lastDp.pointNo} (${lastDp.depth}m)` };
  } else if (pits.length > 0) {
    const lastPit = pits[pits.length - 1];
    latestPosition = { lat: lastPit.lat, lng: lastPit.lng, label: `Latest Pit ${lastPit.id}` };
  }

  const availableDates = Array.from(availableDatesSet).sort();

  return {
    id: String(task.id),
    taskCode: task.taskCode || task.id,
    displayName: task.displayName || loc.locationName || 'HDD Execution Task',
    state: loc.circle || 'RAJASTHAN',
    district: loc.district || 'GANGANAGAR',
    block: loc.blockName || loc.block || 'KARANPUR',
    user: task.assigneeSnapshot?.name || task.assigneeName || task.assignee?.name || task.assignedTo?.name || task.user?.name || task.username || 'Field Supervisor',
    userRole: task.assigneeSnapshot?.designation || task.assignee?.designation || 'Project Manager',
    vendorId: task.vendorId,
    vendorName: task.vendorName,
    date: task.updatedAt ? new Date(task.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    updatedAt: task.updatedAt || null,
    lastModified: task.updatedAt ? new Date(task.updatedAt).toLocaleString() : 'N/A',
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
