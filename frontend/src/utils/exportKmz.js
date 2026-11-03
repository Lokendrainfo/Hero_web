import JSZip from 'jszip';

/**
 * Format relative image URL to absolute https URL
 */
export const formatImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://ilync.tech/${url.replace(/^\/+/, '')}`;
};

/**
 * Utility to escape XML special characters
 */
const escapeXml = (unsafe) => {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Format date for display in descriptions
 */
const formatDateTime = (val) => {
  if (!val || val === 'N/A' || val === '—') return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return String(val);
  }
};

/**
 * Build HTML balloon description for a Trench / Shot
 */
const buildTrenchBalloonHtml = (shot, pitConnection = '', shotDist = '') => {
  const photos = Array.isArray(shot.photos) ? shot.photos : [];
  const photoThumbnails = photos.slice(0, 4).map((p, idx) => {
    const url = formatImageUrl(p.photoUrl || p.url || p.src || p.key);
    if (!url) return '';
    return `
      <div style="display:inline-block; margin:4px 6px 4px 0; text-align:center;">
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <img src="${url}" width="110" height="80" style="object-fit:cover; border-radius:4px; border:1px solid #cbd5e1; display:block;" alt="${escapeXml(p.label || 'Trench Photo')}" />
        </a>
        <div style="font-size:10px; color:#64748b; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">
          ${escapeXml(p.label || `Photo ${idx + 1}`)}
        </div>
      </div>
    `;
  }).join('');

  const startPitDisplay = shot.startPit?.name || shot.startPit?.serialNo || shot.startPit?.id || shot.startPitName || '-';
  const endPitDisplay = shot.endPit?.name || shot.endPit?.serialNo || shot.endPit?.id || shot.endPitName || '-';
  const lengthDisplay = shotDist || shot.formattedLength || (shot.lengthMeters ? shot.lengthMeters + ' m' : '-');

  return `<![CDATA[
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #1e293b; max-width: 380px;">
      <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff; padding: 10px 14px; border-radius: 6px 6px 0 0; margin: -10px -10px 10px -10px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85;">HDD Trench / Shot Line</div>
        <div style="font-size: 15px; font-weight: 700;">${escapeXml(pitConnection || shot.name || shot.id || 'HDD Shot')}</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px;">
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b; width: 40%;">Trench ID</td><td style="padding: 4px 0; font-weight: 600;">${escapeXml(shot.id || shot.serialNo || '-')}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Shot Distance</td><td style="padding: 4px 0; font-weight: 700; color: #059669;">${escapeXml(lengthDisplay)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">PIT Connection</td><td style="padding: 4px 0; font-weight: 600;">${escapeXml(startPitDisplay)} &rarr; ${escapeXml(endPitDisplay)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Avg Depth</td><td style="padding: 4px 0; font-weight: 600; color: #059669;">${shot.depth != null ? shot.depth + ' m' : '-'}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Depth Readings</td><td style="padding: 4px 0; font-weight: 600;">${shot.depthReadingsCount || (shot.depthReadings ? shot.depthReadings.length : 0)} points</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Start Pit</td><td style="padding: 4px 0;">${escapeXml(startPitDisplay)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">End Pit</td><td style="padding: 4px 0;">${escapeXml(endPitDisplay)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Cable / Strata</td><td style="padding: 4px 0;">${escapeXml(shot.cableType || 'OFC')} &middot; ${escapeXml(shot.strataType || 'Normal Soil')}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Start Time</td><td style="padding: 4px 0;">${escapeXml(formatDateTime(shot.startTime))}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">End Time</td><td style="padding: 4px 0;">${escapeXml(formatDateTime(shot.endTime))}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Field Supervisor</td><td style="padding: 4px 0; font-weight: 500;">${escapeXml(shot.user || '-')}</td></tr>
        </tbody>
      </table>
      ${photos.length > 0 ? `
        <div style="margin-top: 8px;">
          <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px;">TRENCH PHOTOS (${photos.length})</div>
          <div>${photoThumbnails}</div>
        </div>
      ` : ''}
    </div>
  ]]>`;
};

/**
 * Build HTML balloon description for a Pit
 */
const buildPitBalloonHtml = (pit) => {
  const photos = Array.isArray(pit.photos) ? pit.photos : [];
  const photoThumbnails = photos.slice(0, 4).map((p, idx) => {
    const url = formatImageUrl(p.photoUrl || p.url || p.src || p.key);
    if (!url) return '';
    return `
      <div style="display:inline-block; margin:4px 6px 4px 0; text-align:center;">
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <img src="${url}" width="110" height="80" style="object-fit:cover; border-radius:4px; border:1px solid #cbd5e1; display:block;" alt="${escapeXml(p.label || 'Pit Photo')}" />
        </a>
        <div style="font-size:10px; color:#64748b; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">
          ${escapeXml(p.label || `Photo ${idx + 1}`)}
        </div>
      </div>
    `;
  }).join('');

  return `<![CDATA[
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #1e293b; max-width: 380px;">
      <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; padding: 10px 14px; border-radius: 6px 6px 0 0; margin: -10px -10px 10px -10px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85;">Pit Details</div>
        <div style="font-size: 16px; font-weight: 700;">${escapeXml(pit.name || pit.id || 'Pit')}</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px;">
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b; width: 40%;">Pit Serial / ID</td><td style="padding: 4px 0; font-weight: 600;">${escapeXml(pit.serialNo || pit.id || '-')}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Pit Type</td><td style="padding: 4px 0; font-weight: 600;">${escapeXml(pit.type || 'COUPLING_POINT')}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Depth &amp; Width</td><td style="padding: 4px 0; font-weight: 600;">${pit.depth != null ? pit.depth + ' m' : '-'} / ${pit.width != null ? pit.width + ' m' : '-'}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Road Side</td><td style="padding: 4px 0;">${escapeXml(pit.side || pit.pitSide || 'LHS')}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">GPS Coordinates</td><td style="padding: 4px 0; font-family: monospace;">${Number(pit.lat).toFixed(6)}, ${Number(pit.lng).toFixed(6)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Digging Time</td><td style="padding: 4px 0;">${escapeXml(formatDateTime(pit.diggingTime))}</td></tr>
          <tr><td style="padding: 4px 0; color: #64748b;">Field Supervisor</td><td style="padding: 4px 0; font-weight: 500;">${escapeXml(pit.user || '-')}</td></tr>
        </tbody>
      </table>
      ${photos.length > 0 ? `
        <div style="margin-top: 8px;">
          <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px;">PIT PHOTOS (${photos.length})</div>
          <div>${photoThumbnails}</div>
        </div>
      ` : ''}
    </div>
  ]]>`;
};

/**
 * Build HTML balloon description for a Depth Point
 */
const buildDepthPointBalloonHtml = (dp, shotName = '') => {
  const photo = dp.photo || (dp.photos && dp.photos[0]);
  const photoUrl = photo ? formatImageUrl(photo.photoUrl || photo.url || photo.src || photo.key) : '';

  return `<![CDATA[
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #1e293b; max-width: 360px;">
      <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff; padding: 10px 14px; border-radius: 6px 6px 0 0; margin: -10px -10px 10px -10px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85;">GPS Depth Reading</div>
        <div style="font-size: 18px; font-weight: 800;">${dp.depth != null ? Number(dp.depth).toFixed(2) + ' m' : '-'}</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px;">
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b; width: 40%;">Point No</td><td style="padding: 4px 0; font-weight: 600;">Point #${escapeXml(dp.pointNo || dp.id || '-')}</td></tr>
          ${shotName ? `<tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Trench</td><td style="padding: 4px 0; font-weight: 500;">${escapeXml(shotName)}</td></tr>` : ''}
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">GPS Coordinates</td><td style="padding: 4px 0; font-family: monospace;">${Number(dp.lat).toFixed(6)}, ${Number(dp.lng).toFixed(6)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Altitude / Accuracy</td><td style="padding: 4px 0;">${dp.altitude != null ? dp.altitude + ' m' : '-'} / ${dp.accuracy != null ? dp.accuracy + ' m' : '-'}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Captured At</td><td style="padding: 4px 0;">${escapeXml(formatDateTime(dp.capturedAt))}</td></tr>
          ${dp.taskCode ? `<tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0; color: #64748b;">Task Code</td><td style="padding: 4px 0;">${escapeXml(dp.taskCode)}</td></tr>` : ''}
          <tr><td style="padding: 4px 0; color: #64748b;">Field Supervisor</td><td style="padding: 4px 0; font-weight: 500;">${escapeXml(dp.user || '-')}</td></tr>
        </tbody>
      </table>
      ${photoUrl ? `
        <div style="margin-top: 6px;">
          <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px;">DEPTH PHOTO</div>
          <a href="${photoUrl}" target="_blank" rel="noopener noreferrer">
            <img src="${photoUrl}" style="width: 100%; max-height: 180px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1; display: block;" alt="Depth Photo" />
          </a>
        </div>
      ` : ''}
    </div>
  ]]>`;
};

/**
 * Generate full KML XML content from execution data.
 * STRICT: Live HDD machine markers, machine placemarks, machine icons,
 * machine names and machine labels are COMPLETELY EXCLUDED.
 * Only green HDD trench/shot lines, green GPS measurement points, and pits are exported.
 */
export const generateWorkDoneKml = ({
  executionData,
  includeDepthPoints = true,
  includePits = true,
  includeTrenches = true,
  titleOverride = null
}) => {
  if (!executionData) {
    throw new Error('No execution data available to export');
  }

  const docTitle = titleOverride || (executionData.isBlockMap
    ? `Hero HDD Work Done - Block ${executionData.block || ''} (${executionData.district || ''})`
    : `Hero HDD Work Done - ${executionData.displayName || executionData.taskCode || 'Task Execution'}`);

  const blockName = executionData.block || '—';
  const districtName = executionData.district || '—';
  const stateName = executionData.state || '—';
  const selectedDate = executionData.selectedDate || 'Cumulative / All Dates';
  const stats = executionData.statistics || {};
  const shots = Array.isArray(executionData.shots) ? executionData.shots : [];
  const pits = Array.isArray(executionData.pits) ? executionData.pits : [];
  const depthPoints = Array.isArray(executionData.depthPoints) ? executionData.depthPoints : [];

  // Document Summary description
  const docDescription = `
    <![CDATA[
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #1e293b;">
        <h2 style="margin: 0 0 10px 0; color: #0f172a; border-bottom: 2px solid #059669; padding-bottom: 6px;">
          ${escapeXml(docTitle)}
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px;">
          <tbody>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Block:</td><td style="padding: 4px 0; font-weight: 700;">${escapeXml(blockName)}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">District / State:</td><td style="padding: 4px 0;">${escapeXml(districtName)}, ${escapeXml(stateName)}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Target Execution Date:</td><td style="padding: 4px 0; font-weight: 600; color: #059669;">${escapeXml(selectedDate)}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Total Trenches / Shots:</td><td style="padding: 4px 0; font-weight: 700;">${stats.totalShots ?? shots.length}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Total Pits:</td><td style="padding: 4px 0; font-weight: 700;">${stats.totalPits ?? pits.length}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Total Executed Distance:</td><td style="padding: 4px 0; font-weight: 700; color: #059669;">${escapeXml(stats.formattedDistance || '—')}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Depth Readings Count:</td><td style="padding: 4px 0; font-weight: 700;">${stats.totalDepthReadings ?? depthPoints.length}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Depth Range:</td><td style="padding: 4px 0;">${escapeXml(stats.depthRange || '—')}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0; color: #64748b; font-weight: 500;">Exported At:</td><td style="padding: 4px 0; font-size: 11px; color: #64748b;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)</td></tr>
          </tbody>
        </table>
        <p style="font-size: 11px; color: #94a3b8; margin: 0;">Exported from Hero HDD Enterprise Platform &middot; Google Earth KMZ Format</p>
      </div>
    ]]>
  `.trim();

  // KML Header and Styles
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document id="root_doc">
    <name>${escapeXml(docTitle)}</name>
    <description>${docDescription}</description>
    <open>1</open>

    <!-- Styles for Green HDD Trench / Shot Lines (KML Color: aabbggrr) -->
    <Style id="trenchLine_green">
      <LineStyle>
        <color>ff00c800</color> <!-- Solid Bright Green: alpha=ff, blue=00, green=c8, red=00 -->
        <width>4.5</width>
      </LineStyle>
      <PolyStyle>
        <color>4000c800</color>
      </PolyStyle>
    </Style>

    <Style id="trenchLine_compliant">
      <LineStyle>
        <color>ff00c800</color> <!-- Solid Bright Green -->
        <width>4.5</width>
      </LineStyle>
      <PolyStyle>
        <color>4000c800</color>
      </PolyStyle>
    </Style>

    <Style id="trenchLine_shallow">
      <LineStyle>
        <color>ff00c800</color> <!-- Solid Bright Green -->
        <width>4.5</width>
      </LineStyle>
      <PolyStyle>
        <color>4000c800</color>
      </PolyStyle>
    </Style>

    <Style id="trenchLine_default">
      <LineStyle>
        <color>ff00c800</color> <!-- Solid Bright Green -->
        <width>4.5</width>
      </LineStyle>
      <PolyStyle>
        <color>4000c800</color>
      </PolyStyle>
    </Style>

    <!-- Styles for Pits -->
    <Style id="pit_entry">
      <IconStyle>
        <color>ff00cc44</color>
        <scale>1.1</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>

    <Style id="pit_exit">
      <IconStyle>
        <color>ff2233ee</color>
        <scale>1.1</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>

    <Style id="pit_coupling">
      <IconStyle>
        <color>ff0099ff</color>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.75</scale>
      </LabelStyle>
    </Style>

    <!-- Styles for Green GPS Measurement Points -->
    <Style id="depth_point_green">
      <IconStyle>
        <color>ff00bb22</color> <!-- Green -->
        <scale>0.75</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
      </LabelStyle>
    </Style>

    <Style id="depth_compliant">
      <IconStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
      </LabelStyle>
    </Style>

    <Style id="depth_shallow">
      <IconStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
      </LabelStyle>
    </Style>

    <Style id="depth_deep">
      <IconStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
      </LabelStyle>
    </Style>

    <Style id="depth_unknown">
      <IconStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ff00bb22</color>
        <scale>0.75</scale>
      </LabelStyle>
    </Style>
`;

  // 1. Trenches Folder (Green HDD Trench / Shot Lines)
  if (includeTrenches && shots.length > 0) {
    kml += `
    <Folder>
      <name>Trenches &amp; HDD Shots (${shots.length})</name>
      <open>1</open>
`;

    shots.forEach((shot, sIdx) => {
      // Build coordinates string: "lng,lat,alt lng,lat,alt ..."
      // Priority 1: depth readings with coordinates
      const dps = Array.isArray(shot.depthReadings) ? shot.depthReadings : [];
      let coordsList = [];

      if (dps.length > 0) {
        coordsList = dps
          .filter(dp => !isNaN(dp.lat) && !isNaN(dp.lng) && dp.lat !== 0)
          .map(dp => `${Number(dp.lng).toFixed(7)},${Number(dp.lat).toFixed(7)},${Number(dp.altitude || 0).toFixed(1)}`);
      }

      // Priority 2: shot.route [[lat, lng], [lat, lng]]
      if (coordsList.length === 0 && Array.isArray(shot.route) && shot.route.length > 0) {
        coordsList = shot.route
          .filter(pt => Array.isArray(pt) && !isNaN(pt[0]) && !isNaN(pt[1]) && pt[0] !== 0)
          .map(pt => `${Number(pt[1]).toFixed(7)},${Number(pt[0]).toFixed(7)},0`);
      }

      // Priority 3: startPit -> endPit
      if (coordsList.length === 0 && shot.startPit && shot.endPit && shot.startPit.lat && shot.endPit.lat) {
        coordsList = [
          `${Number(shot.startPit.lng).toFixed(7)},${Number(shot.startPit.lat).toFixed(7)},0`,
          `${Number(shot.endPit.lng).toFixed(7)},${Number(shot.endPit.lat).toFixed(7)},0`
        ];
      }

      if (coordsList.length >= 2) {
        const startPitLabel = shot.startPit?.name || shot.startPit?.serialNo || shot.startPit?.id || shot.startPitName || '';
        const endPitLabel = shot.endPit?.name || shot.endPit?.serialNo || shot.endPit?.id || shot.endPitName || '';
        const pitConnection = (startPitLabel && endPitLabel) ? `${startPitLabel} → ${endPitLabel}` : '';
        const shotDist = shot.formattedLength || (shot.lengthMeters ? `${Number(shot.lengthMeters).toFixed(1)} m` : '');

        let shotTitle = shot.name || shot.id || `Shot ${sIdx + 1}`;
        if (pitConnection) {
          shotTitle = `${pitConnection}${shotDist ? ` (${shotDist})` : ''}`;
        } else if (shotDist) {
          shotTitle = `${shotTitle} (${shotDist})`;
        }

        kml += `
      <Placemark id="trench_${sIdx + 1}">
        <name>${escapeXml(shotTitle)}</name>
        <styleUrl>#trenchLine_green</styleUrl>
        <ExtendedData>
          <Data name="TrenchId"><value>${escapeXml(shot.id || '')}</value></Data>
          <Data name="StartPit"><value>${escapeXml(startPitLabel)}</value></Data>
          <Data name="EndPit"><value>${escapeXml(endPitLabel)}</value></Data>
          <Data name="ShotDistance"><value>${escapeXml(shotDist)}</value></Data>
          <Data name="LengthMeters"><value>${shot.lengthMeters || 0}</value></Data>
          <Data name="AvgDepth"><value>${shot.depth || 0}</value></Data>
          <Data name="DepthReadings"><value>${dps.length}</value></Data>
          <Data name="Supervisor"><value>${escapeXml(shot.user || '')}</value></Data>
        </ExtendedData>
        <description>${buildTrenchBalloonHtml(shot, pitConnection, shotDist)}</description>
        <LineString>
          <extrude>0</extrude>
          <tessellate>1</tessellate>
          <altitudeMode>clampToGround</altitudeMode>
          <coordinates>${coordsList.join(' ')}</coordinates>
        </LineString>
      </Placemark>
`;
      }
    });

    kml += `    </Folder>\n`;
  }

  // 2. Pits Folder
  if (includePits && pits.length > 0) {
    kml += `
    <Folder>
      <name>Pits &amp; Joint Locations (${pits.length})</name>
      <open>1</open>
`;

    pits.forEach((pit, pIdx) => {
      if (isNaN(pit.lat) || isNaN(pit.lng) || pit.lat === 0) return;

      const pType = String(pit.type || '').toUpperCase();
      let styleId = 'pit_coupling';
      if (pType.includes('ENTRY')) styleId = 'pit_entry';
      else if (pType.includes('EXIT')) styleId = 'pit_exit';

      const pitLabel = `${pit.name || pit.id || `Pit ${pIdx + 1}`}${pit.depth ? ` (${pit.depth}m)` : ''}`;

      kml += `
      <Placemark id="pit_${pIdx + 1}">
        <name>${escapeXml(pitLabel)}</name>
        <styleUrl>#${styleId}</styleUrl>
        <ExtendedData>
          <Data name="PitId"><value>${escapeXml(pit.id || '')}</value></Data>
          <Data name="PitType"><value>${escapeXml(pit.type || 'COUPLING_POINT')}</value></Data>
          <Data name="Depth"><value>${pit.depth || ''}</value></Data>
          <Data name="Width"><value>${pit.width || ''}</value></Data>
          <Data name="RoadSide"><value>${escapeXml(pit.side || pit.pitSide || '')}</value></Data>
          <Data name="Supervisor"><value>${escapeXml(pit.user || '')}</value></Data>
        </ExtendedData>
        <description>${buildPitBalloonHtml(pit)}</description>
        <Point>
          <altitudeMode>clampToGround</altitudeMode>
          <coordinates>${Number(pit.lng).toFixed(7)},${Number(pit.lat).toFixed(7)},0</coordinates>
        </Point>
      </Placemark>
`;
    });

    kml += `    </Folder>\n`;
  }

  // 3. Green GPS Measurement Points Folder
  if (includeDepthPoints && depthPoints.length > 0) {
    kml += `
    <Folder>
      <name>Recorded Depth Readings (${depthPoints.length})</name>
      <open>1</open>
`;

    depthPoints.forEach((dp, dIdx) => {
      if (isNaN(dp.lat) || isNaN(dp.lng) || dp.lat === 0) return;

      const dpLabel = dp.depth != null ? `${Number(dp.depth).toFixed(2)}m` : `Pt ${dp.pointNo || dIdx + 1}`;

      kml += `
      <Placemark id="dp_${dIdx + 1}">
        <name>${escapeXml(dpLabel)}</name>
        <styleUrl>#depth_point_green</styleUrl>
        <ExtendedData>
          <Data name="PointNo"><value>${dp.pointNo || dIdx + 1}</value></Data>
          <Data name="Depth"><value>${dp.depth != null ? Number(dp.depth).toFixed(2) : 0}</value></Data>
          <Data name="Altitude"><value>${dp.altitude || 0}</value></Data>
          <Data name="Accuracy"><value>${dp.accuracy || ''}</value></Data>
          <Data name="CapturedAt"><value>${escapeXml(dp.capturedAt || '')}</value></Data>
          <Data name="TaskCode"><value>${escapeXml(dp.taskCode || '')}</value></Data>
          <Data name="Supervisor"><value>${escapeXml(dp.user || '')}</value></Data>
        </ExtendedData>
        <description>${buildDepthPointBalloonHtml(dp)}</description>
        <Point>
          <altitudeMode>clampToGround</altitudeMode>
          <coordinates>${Number(dp.lng).toFixed(7)},${Number(dp.lat).toFixed(7)},${Number(dp.altitude || 0).toFixed(1)}</coordinates>
        </Point>
      </Placemark>
`;
    });

    kml += `    </Folder>\n`;
  }

  // Close KML Document
  kml += `  </Document>\n</kml>\n`;

  return kml;
};

/**
 * Trigger download in the browser for Blob or String
 */
export const downloadFile = (blobOrString, filename, mimeType = 'application/vnd.google-earth.kmz') => {
  const blob = typeof blobOrString === 'string'
    ? new Blob([blobOrString], { type: mimeType })
    : blobOrString;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * Main function: Export execution data directly to KMZ or KML.
 * STRICT: Live HDD machine markers, placemarks, and labels are NEVER included.
 */
export const exportWorkDoneKmz = async ({
  executionData,
  includeDepthPoints = true,
  includePits = true,
  includeTrenches = true,
  mode = 'kmz', // 'kmz' | 'kml'
  titleOverride = null,
  customFilename = null
}) => {
  if (!executionData) {
    throw new Error('No execution data available to export');
  }

  // 1. Generate KML string with only green shot lines and green GPS measurement points
  const kmlString = generateWorkDoneKml({
    executionData,
    includeDepthPoints,
    includePits,
    includeTrenches,
    titleOverride
  });

  // 2. Build clean, safe filename
  const cleanStr = (s) => String(s || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const blockPart = cleanStr(executionData.block || 'Work_Done');
  const districtPart = cleanStr(executionData.district || '');
  const datePart = cleanStr(executionData.selectedDate || 'Cumulative_All_Dates');
  const ext = mode === 'kml' ? 'kml' : 'kmz';

  const defaultFilename = executionData.isBlockMap
    ? `Hero_HDD_Work_Done_Block_${blockPart}${districtPart ? '_' + districtPart : ''}_${datePart}.${ext}`
    : `Hero_HDD_Work_Done_Task_${cleanStr(executionData.taskCode || executionData.taskId || 'Task')}_${datePart}.${ext}`;

  const finalFilename = customFilename || defaultFilename;

  // 3. Export as KMZ (ZIP containing doc.kml) or raw KML
  if (mode === 'kml') {
    downloadFile(kmlString, finalFilename, 'application/vnd.google-earth.kml+xml');
    return {
      success: true,
      filename: finalFilename,
      format: 'kml',
      counts: {
        trenches: (executionData.shots || []).length,
        pits: (executionData.pits || []).length,
        depths: (executionData.depthPoints || []).length
      }
    };
  }

  // KMZ mode: Zip doc.kml with JSZip
  const zip = new JSZip();
  zip.file('doc.kml', kmlString);

  const kmzBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  downloadFile(kmzBlob, finalFilename, 'application/vnd.google-earth.kmz');

  return {
    success: true,
    filename: finalFilename,
    format: 'kmz',
    counts: {
      trenches: (executionData.shots || []).length,
      pits: (executionData.pits || []).length,
      depths: (executionData.depthPoints || []).length
    }
  };
};

export default exportWorkDoneKmz;
