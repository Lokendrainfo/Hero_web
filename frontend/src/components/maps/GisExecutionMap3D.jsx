import React, { useEffect, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildGis3dScene, depthPoleHtml, flagMarkerHtml, gisPopupHtml } from '../../utils/gisMapMarkers';
import { formatDepthM } from '../../utils/formatters';

const SAT_MAX_ZOOM = 20;
const STREET_MAX_ZOOM = 20;

const rasterStyle = (mapType) => {
  const isStreet = mapType === 'street';
  const tiles = isStreet
    ? ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']
    : [
      'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    ];
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        minzoom: 0,
        maxzoom: isStreet ? STREET_MAX_ZOOM : SAT_MAX_ZOOM,
        attribution: isStreet ? '© OpenStreetMap' : 'Imagery',
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
};

const maxZoomFor = (mapType) => (mapType === 'street' ? STREET_MAX_ZOOM : SAT_MAX_ZOOM);

const fitScene = (map, scene) => {
  if (!scene.bbox) return;
  map.fitBounds(scene.bbox, {
    padding: { top: 88, bottom: 110, left: 96, right: 96 },
    pitch: 54,
    bearing: scene.bearing,
    duration: 900,
    maxZoom: 16.2,
  });
};

const formatCaptured = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const applyFlagMarkers = (map, scene, markersRef, onOpenRef) => {
  markersRef.current.forEach((m) => m.remove());
  const flagMarkers = (scene.flags || []).flatMap((flag) => {
    if (flag.lng == null || flag.lat == null) return [];
    try {
    const el = document.createElement('div');
    el.className = `gis-flag-marker gis-flag-marker--${flag.role}`;
    el.innerHTML = flagMarkerHtml(flag);
    const marker = new Marker({ element: el, anchor: 'bottom-left', offset: [1, 0] })
      .setLngLat([flag.lng, flag.lat])
      .setPopup(new Popup({ offset: 18, maxWidth: 260, className: 'gis-popup' }).setHTML(gisPopupHtml({
        eyebrow: flag.role === 'live' ? 'Latest point' : flag.role === 'start' ? 'Start pit' : 'End pit',
        title: flag.name || flag.title || (flag.role === 'start' ? 'Start pit' : flag.role === 'end' ? 'End pit' : 'Latest'),
        rows: flag.rows || [],
        actionLabel: flag.photos?.length ? `View media (${flag.photos.length})` : '',
      })))
      .addTo(map);

    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (flag.photos?.length && onOpenRef.current) {
        onOpenRef.current(flag.photos, 0);
      }
    });
    return [marker];
    } catch (err) {
      console.warn('[Gis3D] flag', err);
      return [];
    }
  });

  const poleMarkers = (scene.poles || []).flatMap((pole) => {
    if (pole.lng == null || pole.lat == null) return [];
    try {
      const el = document.createElement('div');
      el.className = [
        'gis-pole-marker',
        pole.keep ? 'is-keep' : '',
        pole.labeled ? 'is-labeled' : '',
      ].filter(Boolean).join(' ');
      el.innerHTML = depthPoleHtml(pole);
      const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, 0] })
        .setLngLat([pole.lng, pole.lat])
        .setPopup(new Popup({ offset: 14, maxWidth: 260, className: 'gis-popup' }).setHTML(gisPopupHtml({
          eyebrow: pole.live ? 'Latest point' : 'Depth capture',
          title: pole.label,
          rows: [
            ['Depth', pole.label],
            ['Point', pole.pointNo],
          ],
        })))
        .addTo(map);

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (scene.depthPhotos?.length && onOpenRef.current) {
          onOpenRef.current(scene.depthPhotos, Math.min(pole.index || 0, scene.depthPhotos.length - 1));
        }
      });
      return [marker];
    } catch (err) {
      console.warn('[Gis3D] pole', err);
      return [];
    }
  });

  markersRef.current = [...flagMarkers, ...poleMarkers];
};

const sceneLayersReady = (map) => Boolean(map?.getLayer('depth-poles') && map?.getLayer('trench-line'));

const applyScene = (map, scene, markersRef, onOpenRef, shouldFit, refreshFlags = false) => {
  if (!map || !scene) return false;
  if (refreshFlags || markersRef.current.length === 0) {
    applyFlagMarkers(map, scene, markersRef, onOpenRef);
  }
  try {
    addSceneLayers(map, scene);
  } catch (err) {
    console.warn('[Gis3D] layers', err);
  }
  const ready = sceneLayersReady(map);
  if (shouldFit && ready) {
    try {
      fitScene(map, scene);
    } catch (err) {
      console.warn('[Gis3D] fit', err);
    }
  }
  return ready;
};

const upsertSource = (map, id, data) => {
  if (map.getSource(id)) {
    map.getSource(id).setData(data);
    return;
  }
  map.addSource(id, { type: 'geojson', data });
};

const addSceneLayers = (map, scene) => {
  upsertSource(map, 'trench-routes', {
    type: 'FeatureCollection',
    features: (scene.routes || []).map((coords) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
    })),
  });
  if (!map.getLayer('trench-halo')) {
    map.addLayer({
      id: 'trench-halo',
      type: 'line',
      source: 'trench-routes',
      paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.35 },
    });
    map.addLayer({
      id: 'trench-line',
      type: 'line',
      source: 'trench-routes',
      paint: { 'line-color': '#5b21b6', 'line-width': 1.75, 'line-opacity': 0.95 },
    });
  }

  upsertSource(map, 'pit-links', {
    type: 'FeatureCollection',
    features: (scene.pitLinks || []).map((coords) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
    })),
  });
  if (!map.getLayer('pit-links')) {
    map.addLayer({
      id: 'pit-links',
      type: 'line',
      source: 'pit-links',
      paint: { 'line-color': '#111827', 'line-width': 1.5, 'line-opacity': 0.78 },
    });
  }

  upsertSource(map, 'depth-poles', scene.columns || { type: 'FeatureCollection', features: [] });
  if (!map.getLayer('depth-poles')) {
    map.addLayer({
      id: 'depth-poles',
      type: 'fill-extrusion',
      source: 'depth-poles',
      paint: {
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-color': [
          'case',
          ['==', ['get', 'live'], 1], '#6d28d9',
          [
            'interpolate',
            ['linear'],
            ['get', 'depth'],
            1.2, '#ddd6fe',
            1.8, '#a78bfa',
            2.4, '#7c3aed',
            3.2, '#4c1d95',
          ],
        ],
      },
    });
  }

  upsertSource(map, 'landmark-poles', scene.landmarks || { type: 'FeatureCollection', features: [] });
  if (!map.getLayer('landmark-poles')) {
    map.addLayer({
      id: 'landmark-poles',
      type: 'fill-extrusion',
      source: 'landmark-poles',
      paint: {
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-color': [
          'match',
          ['get', 'kind'],
          'start', '#059669',
          'end', '#6d28d9',
          '#111827',
        ],
      },
    });
  }

  ['depth-bases', 'depth-poles', 'landmark-poles'].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  });

};

const enableAtmosphere = (map) => {
  try {
    if (typeof map.setTerrain === 'function') map.setTerrain(null);
  } catch (err) {
    /* keep poles on the ground plane */
  }
  try {
    if (typeof map.setFog === 'function') {
      map.setFog({
        color: 'rgb(186, 210, 228)',
        'high-color': 'rgb(120, 168, 210)',
        'horizon-blend': 0.02,
        range: [8, 22],
      });
    }
  } catch (err) {
    /* atmosphere is optional */
  }
};

export class Gis3dErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="gis-map3d-loading">
          3D view could not start. Switch back to 2D.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function GisExecutionMap3D({
  executionData,
  mapType = 'satellite',
  fitNonce = 0,
  onOpenLightbox,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const sceneRef = useRef(null);
  const onOpenRef = useRef(onOpenLightbox);
  const [initError, setInitError] = useState(null);
  onOpenRef.current = onOpenLightbox;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    let map;
    try {
      map = new Map({
        container: containerRef.current,
        style: rasterStyle(mapType),
        center: [73.536244, 29.841128],
        zoom: 13,
        pitch: 54,
        bearing: 0,
        minZoom: 9,
        maxZoom: maxZoomFor(mapType),
        maxPitch: 78,
        attributionControl: false,
        hash: false,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      });

      map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
      mapRef.current = map;
      const declutterPoleLabels = () => {
        const wrap = containerRef.current?.parentElement;
        if (!wrap?.classList.contains('gis-poles-labeled')) return;
        const labels = [...wrap.querySelectorAll('.gis-pole-label')];
        labels.forEach((el) => el.classList.remove('is-occluded'));
        const items = labels
          .filter((el) => getComputedStyle(el).display !== 'none' && el.offsetParent)
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter((item) => item.r.width > 4 && item.r.height > 4)
          .sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top);
        const kept = [];
        const pad = 8;
        items.forEach((item) => {
          const hits = kept.some((k) => (
            item.r.left < k.r.right + pad
            && item.r.right > k.r.left - pad
            && item.r.top < k.r.bottom + pad
            && item.r.bottom > k.r.top - pad
          ));
          if (hits) item.el.classList.add('is-occluded');
          else kept.push(item);
        });
      };
      const syncPoleZoom = () => {
        const wrap = containerRef.current?.parentElement;
        if (!wrap) return;
        const z = map.getZoom();
        wrap.classList.toggle('gis-poles-far', z < 13.6);
        wrap.classList.toggle('gis-poles-mid', z >= 13.6 && z < 15.6);
        wrap.classList.toggle('gis-poles-near', z >= 15.6);
        wrap.classList.toggle('gis-poles-labeled', z >= 16.4);
        requestAnimationFrame(declutterPoleLabels);
      };
      map.on('zoom', syncPoleZoom);
      map.on('moveend', syncPoleZoom);
      syncPoleZoom();
      map.on('error', (e) => console.warn('[Gis3D]', e?.error?.message || e));
    } catch (err) {
      setInitError(err?.message || 'Could not start the 3D map.');
      return undefined;
    }

    const onReady = () => {
      if (sceneRef.current) applyScene(map, sceneRef.current, markersRef, onOpenRef, true);
      enableAtmosphere(map);
    };
    map.on('load', onReady);
    map.on('style.load', onReady);
    map.on('idle', onReady);
    const readyPoll = setInterval(() => {
      if (!mapRef.current || !sceneRef.current) return;
      const ready = applyScene(map, sceneRef.current, markersRef, onOpenRef, !sceneLayersReady(map));
      if (ready) clearInterval(readyPoll);
    }, 250);
    map.__gisReadyPoll = readyPoll;

    const lockZoom = () => {
      const cap = map.getMaxZoom();
      if (map.getZoom() > cap) map.setZoom(cap);
    };
    map.on('zoomend', lockZoom);

    const openFromFeature = (e) => {
      const feature = e.features?.[0];
      const scene = sceneRef.current;
      if (!feature || !scene?.depthPhotos?.length || !onOpenRef.current) return;
      const idx = Number(feature.properties?.index) || 0;
      onOpenRef.current(scene.depthPhotos, Math.min(idx, scene.depthPhotos.length - 1));
    };
    map.on('click', 'depth-poles', openFromFeature);

    const hoverPopup = new Popup({ closeButton: false, closeOnClick: false, offset: 16, className: 'gis-popup' });
    const showHover = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      const kind = f.properties?.kind;
      const eyebrow = kind === 'start' ? 'Start pit' : kind === 'end' ? 'End pit' : kind === 'latest' ? 'Latest point' : 'Depth capture';
      const title = f.properties?.name || f.properties?.label || formatDepthM(f.properties?.depth);
      hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(gisPopupHtml({
          eyebrow,
          title,
          rows: [
            ['Depth', formatDepthM(f.properties?.depth)],
            ['Point', f.properties?.pointNo],
            ['Width', f.properties?.width ? `${Number(f.properties.width).toFixed(2)}m` : ''],
            ['Side', f.properties?.side],
            ['Type', f.properties?.type],
            ['Time', f.properties?.diggingTime || formatCaptured(f.properties?.capturedAt)],
          ],
        }))
        .addTo(map);
    };
    const hideHover = () => {
      map.getCanvas().style.cursor = '';
      hoverPopup.remove();
    };
    ['trench-line', 'pit-links'].forEach((layer) => {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mousemove', layer, showHover);
      map.on('mouseleave', layer, hideHover);
    });

    return () => {
      clearInterval(readyPoll);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !executionData) return;

    let scene;
    try {
      scene = buildGis3dScene(executionData);
    } catch (err) {
      console.warn('[Gis3D] scene', err);
      return;
    }
    sceneRef.current = scene;
    const sync = (shouldFit) => applyScene(map, scene, markersRef, onOpenRef, shouldFit, true);
    sync(false);
    map.once('load', () => sync(true));
    map.once('idle', () => sync(true));
    setTimeout(() => sync(false), 800);
  }, [executionData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMaxZoom(maxZoomFor(mapType));
    const source = map.getSource('basemap');
    if (source && typeof source.setTiles === 'function') {
      source.setTiles(mapType === 'street'
        ? ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']
        : [
          'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        ]);
    }
    if (map.getZoom() > map.getMaxZoom()) map.setZoom(map.getMaxZoom());
  }, [mapType]);

  useEffect(() => {
    const map = mapRef.current;
    const scene = sceneRef.current;
    if (!map || !scene || fitNonce < 1) return;
    fitScene(map, scene);
  }, [fitNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const resize = () => map.resize();
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', resize);
    const t = setTimeout(resize, 120);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', resize);
      clearTimeout(t);
    };
  }, []);

  if (initError) {
    return <div className="gis-map3d-loading">{initError} Switch back to 2D to continue.</div>;
  }

  return (
    <div className="gis-map3d-wrap">
      <div ref={containerRef} className="gis-map3d-canvas" />
      <div className="gis-map3d-hint">Drag to rotate · Ctrl+drag to tilt · Scroll to zoom</div>
    </div>
  );
}
