import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LucideCamera,
  LucideCheckCircle2,
  LucideEye,
  LucideMapPin,
  LucideRefreshCw,
  LucideSend,
  LucideTrash2,
  LucideVideo,
  LucideXCircle,
} from 'lucide-react';
import { pmService } from '../../services/pmService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../../components/common/Select';
import { PmLayoutHeader, PM_FREQUENCY_LABELS } from './PmLayoutHeader';
import { PmAuthorizedPhoto } from './PmAuthorizedPhoto';
import { PmAuthorizedVideo } from './PmAuthorizedVideo';
import { PmCameraCaptureModal } from './PmCameraCaptureModal';
import { PmVideoCaptureModal } from './PmVideoCaptureModal';
import { PmPhotoLightboxModal } from './PmPhotoLightboxModal';
import { PmSubmissionDetailModal } from './PmSubmissionDetailModal';
import { evaluateActivityVisibility, isEmptyAnswer } from './pmConditionUtils';
import { evaluateGeofenceClient } from './pmGeofenceUtils';

const genRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `pm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getPhotoStateKey = (item, reqId = null) => (
  reqId ? `${item?.item_code || item?.id || ''}::req::${reqId}` : `${item?.item_code || item?.id || ''}::default`
);

const getVideoStateKey = (item, vreqId) => `${item?.item_code || item?.id || ''}::vreq::${vreqId}`;

const getLocationStateKey = (item, lreqId) => `${item?.item_code || item?.id || ''}::lreq::${lreqId}`;

const isEmptyCustomValue = (val) => {
  if (val === undefined || val === null) return true;
  if (Array.isArray(val)) return val.length === 0;
  return String(val).trim() === '';
};

export const PmFormPage = () => {
  const { machineId: routeMachineId, frequency: routeFreq } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const [roleInfo, setRoleInfo] = useState(null);
  const [machines, setMachines] = useState([]);
  const [allowedFrequencies, setAllowedFrequencies] = useState([]);

  const [selectedMachineId, setSelectedMachineId] = useState(
    routeMachineId && routeMachineId !== 'select' ? String(routeMachineId) : ''
  );
  const [machineDetail, setMachineDetail] = useState(null);
  const [selectedFreq, setSelectedFreq] = useState(routeFreq || '');
  const [hourMeter, setHourMeter] = useState('');
  const [generalRemarks, setGeneralRemarks] = useState('');

  const [checklist, setChecklist] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  // Per-item completion status, remarks, and dynamic custom field values keyed by item.id
  const [responsesMap, setResponsesMap] = useState({});
  // Independent per-activity / per-requirement camera photo state
  const [capturedPhotos, setCapturedPhotos] = useState({});
  // Independent per-activity / per-requirement live camera video clips state
  const [capturedVideos, setCapturedVideos] = useState({});
  // Independent per-activity / per-requirement GPS coordinates state
  const [capturedLocations, setCapturedLocations] = useState({});
  const [locationErrors, setLocationErrors] = useState({});
  const [locatingKey, setLocatingKey] = useState(null);
  const objectUrlsRef = useRef(new Set());
  const [cameraTarget, setCameraTarget] = useState(null); // { item, requirement }
  const [videoTarget, setVideoTarget] = useState(null); // { item, requirement }
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submittedRecord, setSubmittedRecord] = useState(null);
  const [clientRequestId, setClientRequestId] = useState(genRequestId);
  const [validationErrors, setValidationErrors] = useState({
    formError: '',
    hourMeterError: '',
    itemErrors: {},
    questionErrors: {},
  });
  const [submitBackendError, setSubmitBackendError] = useState('');

  const revokeAllObjectUrls = () => {
    objectUrlsRef.current.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // ignore
      }
    });
    objectUrlsRef.current.clear();
  };

  useEffect(() => () => revokeAllObjectUrls(), []);

  useEffect(() => {
    let active = true;
    Promise.all([pmService.getMachines(), pmService.getFrequencies(selectedMachineId || null)])
      .then(([mRes, fRes]) => {
        if (!active) return;
        setMachines(mRes?.data || []);
        const fData = fRes?.data || {};
        setRoleInfo(fData.role_info || null);
        const submittable = (fData.frequencies || []).filter((f) => f.can_submit);
        setAllowedFrequencies(submittable);
        if (!routeFreq && submittable.length > 0) {
          setSelectedFreq((prev) => prev || submittable[0].code);
        }
      })
      .catch((err) => showToastRef.current(err?.message || 'Failed to initialize maintenance form.', 'error'));
    return () => {
      active = false;
    };
  }, [routeFreq, selectedMachineId]);

  // Fetch & validate selected HERO machine
  useEffect(() => {
    if (!selectedMachineId) {
      setMachineDetail(null);
      return undefined;
    }
    let active = true;
    pmService.validateMachine(selectedMachineId)
      .then((res) => {
        if (!active) return;
        const d = res?.data || null;
        setMachineDetail(d);
        if (d && d.engine_hours !== undefined && d.engine_hours !== null) {
          setHourMeter(String(d.engine_hours));
        }
      })
      .catch((err) => {
        if (!active) return;
        setMachineDetail(null);
        showToastRef.current(err?.message || 'Failed to validate selected machine.', 'error');
      });
    return () => {
      active = false;
    };
  }, [selectedMachineId]);

  // Fetch role-authorized checklist & computed schedule when frequency or machine changes
  useEffect(() => {
    setValidationErrors({ formError: '', hourMeterError: '', itemErrors: {}, questionErrors: {} });
    setSubmitBackendError('');
    setClientRequestId(genRequestId());
    if (!selectedFreq) {
      setChecklist(null);
      return undefined;
    }
    let active = true;
    setLoadingChecklist(true);
    pmService.getChecklist(selectedFreq, selectedMachineId || null)
      .then((res) => {
        if (!active) return;
        const data = res?.data || null;
        setChecklist(data);
        setResponsesMap((prev) => {
          const initMap = {};
          (data?.items || []).forEach((it) => {
            initMap[it.id] = prev[it.id] || {
              status: 'COMPLETED',
              remarks: '',
              custom_fields: {},
            };
          });
          return initMap;
        });
      })
      .catch((err) => {
        if (!active) return;
        setChecklist(null);
        showToastRef.current(err?.message || 'Not authorized for this maintenance frequency.', 'error');
      })
      .finally(() => {
        if (active) setLoadingChecklist(false);
      });
    return () => {
      active = false;
    };
  }, [selectedFreq, selectedMachineId]);

  const updateItemState = (itemId, patch) => {
    setSubmitBackendError('');
    setValidationErrors((prev) => {
      if (!prev.itemErrors[itemId] && !prev.formError) return prev;
      const nextItems = { ...prev.itemErrors };
      delete nextItems[itemId];
      return { ...prev, formError: '', itemErrors: nextItems };
    });
    setResponsesMap((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { status: 'COMPLETED', remarks: '', custom_fields: {} }), ...patch },
    }));
  };

  const updateCustomFieldValue = (itemId, fieldId, value) => {
    setSubmitBackendError('');
    const qErrKey = `${itemId}:${fieldId}`;
    setValidationErrors((prev) => {
      if (!prev.questionErrors[qErrKey] && !prev.itemErrors[itemId] && !prev.formError) return prev;
      const nextQ = { ...prev.questionErrors };
      delete nextQ[qErrKey];
      const nextItems = { ...prev.itemErrors };
      delete nextItems[itemId];
      return { ...prev, formError: '', itemErrors: nextItems, questionErrors: nextQ };
    });
    setResponsesMap((prev) => {
      const current = prev[itemId] || { status: 'COMPLETED', remarks: '', custom_fields: {} };
      return {
        ...prev,
        [itemId]: {
          ...current,
          custom_fields: {
            ...(current.custom_fields || {}),
            [fieldId]: value,
          },
        },
      };
    });
  };

  const handleCameraPhotoCaptured = (capturedItem, file, capturedReq) => {
    const targetItem = capturedItem || cameraTarget?.item;
    const targetReq = capturedReq !== undefined ? capturedReq : cameraTarget?.requirement;
    if (!file || !targetItem) return;
    if (!selectedMachineId) {
      showToastRef.current('Please select a machine before capturing photos.', 'error');
      return;
    }

    const photoKey = getPhotoStateKey(targetItem, targetReq?.id || null);
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    setSubmitBackendError('');
    setValidationErrors((prev) => {
      if (!prev.itemErrors[targetItem.id] && !prev.formError) return prev;
      const nextItems = { ...prev.itemErrors };
      delete nextItems[targetItem.id];
      return { ...prev, formError: '', itemErrors: nextItems };
    });

    setCapturedPhotos((prev) => {
      const prevUrl = prev[photoKey]?.previewUrl;
      if (prevUrl && prevUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prevUrl);
        objectUrlsRef.current.delete(prevUrl);
      }
      return {
        ...prev,
        [photoKey]: {
          checklistItemId: targetItem.id,
          itemCode: targetItem.item_code,
          requirementId: targetReq?.id || null,
          requirementName: targetReq?.photo_name || '',
          file,
          previewUrl,
          capturedAt: new Date().toISOString(),
          captureSource: 'CAMERA',
        },
      };
    });

    setCameraTarget(null);
    const label = targetReq?.photo_name ? `${targetItem.description} — ${targetReq.photo_name}` : targetItem.description;
    showToastRef.current(`Camera photo captured for "${label}"`, 'success');
  };

  const handleCameraVideoCaptured = (file, capturedItem, capturedReq, durationSeconds) => {
    const targetItem = capturedItem || videoTarget?.item;
    const targetReq = capturedReq || videoTarget?.requirement;
    if (!file || !targetItem || !targetReq) return;

    const vKey = getVideoStateKey(targetItem, targetReq.id);
    const maxV = Number(targetReq.max_videos || 1);
    const previewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(previewUrl);
    setSubmitBackendError('');
    setValidationErrors((prev) => {
      if (!prev.itemErrors[targetItem.id] && !prev.formError) return prev;
      const nextItems = { ...prev.itemErrors };
      delete nextItems[targetItem.id];
      return { ...prev, formError: '', itemErrors: nextItems };
    });

    setCapturedVideos((prev) => {
      const existing = prev[vKey] || [];
      if (existing.length >= maxV) {
        showToastRef.current(`Maximum ${maxV} video(s) allowed for "${targetReq.video_name}".`, 'info');
        return prev;
      }
      return {
        ...prev,
        [vKey]: [
          ...existing,
          {
            file,
            previewUrl,
            durationSeconds: Number(durationSeconds || 0),
            capturedAt: new Date().toISOString(),
          },
        ],
      };
    });

    setVideoTarget(null);
    showToastRef.current(`Video recorded for "${targetReq.video_name}" (${durationSeconds}s)`, 'success');
  };

  const handleRemoveVideoClip = (item, vreq, index) => {
    const vKey = getVideoStateKey(item, vreq.id);
    setCapturedVideos((prev) => {
      const existing = prev[vKey] || [];
      const removed = existing[index];
      if (removed?.previewUrl && removed.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(removed.previewUrl);
        objectUrlsRef.current.delete(removed.previewUrl);
      }
      const next = existing.filter((_, idx) => idx !== index);
      return { ...prev, [vKey]: next };
    });
  };

  const handleCaptureGps = (item, lreq) => {
    const lKey = getLocationStateKey(item, lreq.id);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const msg = 'GPS / Location services are not available in this browser or device.';
      setLocationErrors((prev) => ({ ...prev, [lKey]: msg }));
      showToastRef.current(msg, 'error');
      return;
    }

    setLocatingKey(lKey);
    setLocationErrors((prev) => {
      const next = { ...prev };
      delete next[lKey];
      return next;
    });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = pos?.coords || {};
        const latitude = typeof coords.latitude === 'number' ? Number(coords.latitude.toFixed(6)) : null;
        const longitude = typeof coords.longitude === 'number' ? Number(coords.longitude.toFixed(6)) : null;
        const accuracy = typeof coords.accuracy === 'number' ? Number(coords.accuracy.toFixed(1)) : null;
        const capturedAt = new Date().toISOString();

        setLocatingKey(null);
        if (latitude === null || longitude === null) {
          const msg = 'Unable to read valid latitude/longitude from device GPS.';
          setLocationErrors((prev) => ({ ...prev, [lKey]: msg }));
          showToastRef.current(msg, 'error');
          return;
        }

        const geoEval = evaluateGeofenceClient(lreq, latitude, longitude);

        setCapturedLocations((prev) => ({
          ...prev,
          [lKey]: {
            locationRequirementId: lreq.id,
            locationName: lreq.location_name,
            latitude,
            longitude,
            accuracy_meters: accuracy,
            captured_at: capturedAt,
            geofenceResult: geoEval,
          },
        }));
        setSubmitBackendError('');
        setValidationErrors((prev) => {
          if (!prev.itemErrors[item.id] && !prev.formError) return prev;
          const nextItems = { ...prev.itemErrors };
          delete nextItems[item.id];
          return { ...prev, formError: '', itemErrors: nextItems };
        });

        if (
          lreq.accuracy_threshold_meters !== null &&
          lreq.accuracy_threshold_meters !== undefined &&
          accuracy !== null &&
          accuracy > Number(lreq.accuracy_threshold_meters)
        ) {
          const warn = `GPS captured (±${accuracy}m), but exceeds configured accuracy threshold (±${lreq.accuracy_threshold_meters}m). Move outdoors and retry.`;
          setLocationErrors((prev) => ({ ...prev, [lKey]: warn }));
          showToastRef.current(warn, 'error');
          return;
        }

        if (geoEval.geofenceRequired && !geoEval.isInside) {
          setLocationErrors((prev) => ({ ...prev, [lKey]: geoEval.message }));
          showToastRef.current(
            lreq.is_mandatory ? geoEval.message : `${geoEval.message} (Optional GPS — submission still allowed)`,
            lreq.is_mandatory ? 'error' : 'info'
          );
          return;
        }

        showToastRef.current(
          geoEval.geofenceRequired
            ? `GPS verified inside geofence for "${lreq.location_name}": ${latitude}, ${longitude}`
            : `GPS captured for "${lreq.location_name}": ${latitude}, ${longitude}`,
          'success'
        );
      },
      (err) => {
        setLocatingKey(null);
        let msg = 'Unable to capture GPS coordinates.';
        if (err?.code === 1) {
          msg = 'Location permission denied. Please allow browser/device GPS access and retry.';
        } else if (err?.code === 2) {
          msg = 'Device GPS position is unavailable. Check location settings and retry.';
        } else if (err?.code === 3) {
          msg = 'GPS location request timed out. Please retry.';
        } else if (err?.message) {
          msg = err.message;
        }
        setLocationErrors((prev) => ({ ...prev, [lKey]: msg }));
        showToastRef.current(msg, 'error');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const handleClearCapturedLocation = (item, lreq) => {
    const lKey = getLocationStateKey(item, lreq.id);
    setCapturedLocations((prev) => {
      const next = { ...prev };
      delete next[lKey];
      return next;
    });
    setLocationErrors((prev) => {
      const next = { ...prev };
      delete next[lKey];
      return next;
    });
  };

  const itemsList = checklist?.items || [];
  const categoryGroups = useMemo(() => {
    const apiGroups = checklist?.category_groups;
    if (Array.isArray(apiGroups) && apiGroups.length > 0) {
      return apiGroups.filter((g) => Array.isArray(g.items) && g.items.length > 0);
    }
    const groups = [];
    const byKey = new Map();
    itemsList.forEach((it) => {
      const code = String(it.category_code || it.category_name || 'GENERAL').toUpperCase();
      const name = it.category_name || it.category_code || 'Maintenance';
      if (!byKey.has(code)) {
        const grp = { category_code: code, category_name: name, items: [] };
        byKey.set(code, grp);
        groups.push(grp);
      }
      byKey.get(code).items.push(it);
    });
    return groups.filter((g) => g.items.length > 0);
  }, [checklist, itemsList]);

  const evidenceSummary = useMemo(() => {
    let requiredQuestionsTotal = 0;
    let requiredQuestionsDone = 0;
    let requiredPhotosTotal = 0;
    let requiredPhotosDone = 0;
    let totalPhotosCaptured = 0;
    let requiredVideosTotal = 0;
    let requiredVideosDone = 0;
    let totalVideosRecorded = 0;
    let requiredLocationsTotal = 0;
    let requiredLocationsDone = 0;
    let totalLocationsCaptured = 0;
    let missingRemarksCount = 0;

    itemsList.forEach((it) => {
      const itemState = responsesMap[it.id] || { status: 'COMPLETED', remarks: '', custom_fields: {} };
      const cfAnswers = itemState.custom_fields || {};
      const { visibleQuestions, allPhotos, visiblePhotos, visibleVideos, visibleLocations } = evaluateActivityVisibility(it, cfAnswers);

      visibleQuestions.forEach((cf) => {
        if (cf.field_type === 'EVIDENCE_ONLY') return;
        if (cf.is_mandatory) {
          requiredQuestionsTotal += 1;
          if (!isEmptyAnswer(cfAnswers[cf.id])) {
            requiredQuestionsDone += 1;
          }
        }
      });

      if (itemState.status === 'NOT_COMPLETED' && it.requires_remarks_if_not_completed !== false && !(itemState.remarks || '').trim()) {
        missingRemarksCount += 1;
      }

      if (allPhotos.length > 0) {
        visiblePhotos.forEach((req) => {
          const cap = Boolean(capturedPhotos[getPhotoStateKey(it, req.id)]?.file);
          if (cap) totalPhotosCaptured += 1;
          if (req.is_mandatory) {
            requiredPhotosTotal += 1;
            if (cap) requiredPhotosDone += 1;
          }
        });
      } else if (it.requires_photo !== false) {
        const cap = Boolean(capturedPhotos[getPhotoStateKey(it)]?.file);
        if (cap) totalPhotosCaptured += 1;
        requiredPhotosTotal += 1;
        if (cap) requiredPhotosDone += 1;
      }

      visibleVideos.forEach((vreq) => {
        const clips = capturedVideos[getVideoStateKey(it, vreq.id)] || [];
        totalVideosRecorded += clips.length;
        if (vreq.is_mandatory) {
          requiredVideosTotal += 1;
          if (clips.length >= Math.max(1, Number(vreq.min_videos || 1))) {
            requiredVideosDone += 1;
          }
        }
      });

      visibleLocations.forEach((lreq) => {
        const loc = capturedLocations[getLocationStateKey(it, lreq.id)];
        const hasCoords = Boolean(loc && loc.latitude !== null && loc.longitude !== null);
        if (hasCoords) totalLocationsCaptured += 1;
        if (lreq.is_mandatory) {
          requiredLocationsTotal += 1;
          const accOk =
            lreq.accuracy_threshold_meters === null ||
            lreq.accuracy_threshold_meters === undefined ||
            loc?.accuracy_meters === null ||
            loc?.accuracy_meters === undefined ||
            loc.accuracy_meters <= Number(lreq.accuracy_threshold_meters);
          const geoOk =
            !lreq.is_geofence_required ||
            (hasCoords && evaluateGeofenceClient(lreq, loc.latitude, loc.longitude).isInside === true);
          if (hasCoords && accOk && geoOk) {
            requiredLocationsDone += 1;
          }
        }
      });
    });

    const hourMeterValid = hourMeter !== '' && !Number.isNaN(Number(hourMeter)) && Number.isFinite(Number(hourMeter)) && Number(hourMeter) >= 0;
    const isDuplicateBlocked = Boolean(checklist?.schedule_status?.already_completed_for_occurrence);
    const isFormReady =
      Boolean(selectedMachineId) &&
      Boolean(selectedFreq) &&
      hourMeterValid &&
      !isDuplicateBlocked &&
      itemsList.length > 0 &&
      requiredQuestionsDone >= requiredQuestionsTotal &&
      requiredPhotosDone >= requiredPhotosTotal &&
      requiredVideosDone >= requiredVideosTotal &&
      requiredLocationsDone >= requiredLocationsTotal &&
      missingRemarksCount === 0;

    return {
      requiredQuestionsTotal,
      requiredQuestionsDone,
      requiredPhotosTotal,
      requiredPhotosDone,
      totalPhotosCaptured,
      requiredVideosTotal,
      requiredVideosDone,
      totalVideosRecorded,
      requiredLocationsTotal,
      requiredLocationsDone,
      totalLocationsCaptured,
      missingRemarksCount,
      hourMeterValid,
      isDuplicateBlocked,
      isFormReady,
    };
  }, [itemsList, responsesMap, capturedPhotos, capturedVideos, capturedLocations, hourMeter, selectedMachineId, selectedFreq, checklist]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;

    setSubmitBackendError('');
    const nextItemErrors = {};
    const nextQuestionErrors = {};
    let nextHourMeterError = '';
    let firstErrorMsg = '';
    let firstErrorElementId = '';

    const setFirstErr = (msg, elementId = '') => {
      if (!firstErrorMsg) {
        firstErrorMsg = msg;
        firstErrorElementId = elementId;
      }
    };

    if (!selectedMachineId) {
      setFirstErr('Please select a machine.');
    }
    if (!selectedFreq) {
      setFirstErr('Please select a maintenance frequency.');
    }
    if (hourMeter === '' || Number(hourMeter) < 0 || Number.isNaN(Number(hourMeter)) || !Number.isFinite(Number(hourMeter))) {
      nextHourMeterError = 'Please enter a valid non-negative machine hour-meter reading.';
      setFirstErr(nextHourMeterError, 'pm-hour-meter-input');
    }
    if (checklist?.schedule_status?.already_completed_for_occurrence) {
      setFirstErr(
        `Already completed for this scheduled occurrence (${checklist.schedule_status.current_occurrence_date}) as ${checklist.schedule_status.existing_submission_number}.`
      );
    }

    // Validate ONLY active & condition-matched mandatory questions, photos, videos, GPS, and NOT_COMPLETED remarks
    for (const item of itemsList) {
      const st = responsesMap[item.id] || { status: 'COMPLETED', remarks: '', custom_fields: {} };
      const cfValues = st.custom_fields || {};
      const { visibleQuestions, allPhotos, visiblePhotos, visibleVideos, visibleLocations } = evaluateActivityVisibility(item, cfValues);
      const itemErrs = [];

      for (const cf of visibleQuestions) {
        if (cf.field_type === 'EVIDENCE_ONLY') continue;
        const rawVal = cfValues[cf.id];
        if (cf.is_mandatory && isEmptyAnswer(rawVal)) {
          const qMsg = `Mandatory question "${cf.field_label}" is required.`;
          nextQuestionErrors[`${item.id}:${cf.id}`] = qMsg;
          itemErrs.push(qMsg);
          setFirstErr(`${qMsg} (${item.description})`, `pm-question-${item.id}-${cf.id}`);
        } else if (!isEmptyAnswer(rawVal) && cf.field_type === 'NUMBER') {
          const numVal = Number(rawVal);
          if (Number.isNaN(numVal) || !Number.isFinite(numVal)) {
            const qMsg = `"${cf.field_label}" must be a valid number.`;
            nextQuestionErrors[`${item.id}:${cf.id}`] = qMsg;
            itemErrs.push(qMsg);
            setFirstErr(`${qMsg} (${item.description})`, `pm-question-${item.id}-${cf.id}`);
          }
        }
      }

      if (allPhotos.length > 0) {
        for (const req of visiblePhotos) {
          const cap = capturedPhotos[getPhotoStateKey(item, req.id)];
          if (req.is_mandatory && (!cap || !cap.file)) {
            const pMsg = `Mandatory photo "${req.photo_name}" is missing.`;
            itemErrs.push(pMsg);
            setFirstErr(`${pMsg} (${item.description})`, `pm-activity-${item.id}`);
          }
        }
      } else if (item.requires_photo !== false) {
        const cap = capturedPhotos[getPhotoStateKey(item)];
        if (!cap || !cap.file) {
          const pMsg = 'Mandatory camera photo is missing.';
          itemErrs.push(pMsg);
          setFirstErr(`Mandatory camera photo missing for: ${item.description}`, `pm-activity-${item.id}`);
        }
      }

      for (const vreq of visibleVideos) {
        const clips = capturedVideos[getVideoStateKey(item, vreq.id)] || [];
        const minV = Number(vreq.min_videos || 0);
        const maxV = Number(vreq.max_videos || 1);
        if (vreq.is_mandatory && clips.length < Math.max(1, minV)) {
          const vMsg = `Mandatory video "${vreq.video_name}" requires at least ${Math.max(1, minV)} clip(s).`;
          itemErrs.push(vMsg);
          setFirstErr(`${vMsg} (${item.description})`, `pm-activity-${item.id}`);
        }
        if (clips.length > maxV) {
          const vMsg = `"${vreq.video_name}" allows at most ${maxV} video clip(s).`;
          itemErrs.push(vMsg);
          setFirstErr(vMsg, `pm-activity-${item.id}`);
        }
      }

      for (const lreq of visibleLocations) {
        const capLoc = capturedLocations[getLocationStateKey(item, lreq.id)];
        const hasCoords = Boolean(capLoc && capLoc.latitude !== null && capLoc.longitude !== null);
        if (lreq.is_mandatory && !hasCoords) {
          const lMsg = `Mandatory GPS location "${lreq.location_name}" is missing.`;
          itemErrs.push(lMsg);
          setFirstErr(`${lMsg} (${item.description})`, `pm-activity-${item.id}`);
        }
        if (
          lreq.is_mandatory &&
          hasCoords &&
          lreq.accuracy_threshold_meters !== null &&
          lreq.accuracy_threshold_meters !== undefined &&
          capLoc.accuracy_meters !== null &&
          capLoc.accuracy_meters !== undefined &&
          capLoc.accuracy_meters > Number(lreq.accuracy_threshold_meters)
        ) {
          const lMsg = `GPS accuracy (±${capLoc.accuracy_meters}m) exceeds maximum threshold (±${lreq.accuracy_threshold_meters}m) for "${lreq.location_name}".`;
          itemErrs.push(lMsg);
          setFirstErr(lMsg, `pm-activity-${item.id}`);
        }
        if (lreq.is_mandatory && hasCoords && lreq.is_geofence_required) {
          const geoEval = evaluateGeofenceClient(lreq, capLoc.latitude, capLoc.longitude);
          if (!geoEval.isInside) {
            itemErrs.push(geoEval.message);
            setFirstErr(geoEval.message, `pm-activity-${item.id}`);
          }
        }
      }

      if (st.status === 'NOT_COMPLETED' && item.requires_remarks_if_not_completed !== false && !(st.remarks || '').trim()) {
        const rMsg = 'Explanatory remarks are mandatory when marked Not Completed.';
        itemErrs.push(rMsg);
        setFirstErr(`Explanatory remarks required for Not Completed item: ${item.description}`, `pm-activity-${item.id}`);
      }

      if (itemErrs.length > 0) {
        nextItemErrors[item.id] = itemErrs[0];
      }
    }

    if (firstErrorMsg) {
      setValidationErrors({
        formError: firstErrorMsg,
        hourMeterError: nextHourMeterError,
        itemErrors: nextItemErrors,
        questionErrors: nextQuestionErrors,
      });
      showToastRef.current(firstErrorMsg, 'error');
      if (firstErrorElementId && typeof document !== 'undefined') {
        const el = document.getElementById(firstErrorElementId);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    setValidationErrors({ formError: '', hourMeterError: '', itemErrors: {}, questionErrors: {} });

    const fd = new FormData();
    fd.append('machine_id', String(Number(selectedMachineId)));
    if (machineDetail?.machine_number) {
      fd.append('machine_number', String(machineDetail.machine_number));
    }
    if (machineDetail?.vendor_id !== undefined && machineDetail?.vendor_id !== null) {
      fd.append('vendor_id', String(machineDetail.vendor_id));
    }
    fd.append('frequency', selectedFreq);
    fd.append('hour_meter_reading', String(Number(hourMeter)));
    if (checklist?.schedule_status?.current_occurrence_date) {
      fd.append('scheduled_date', String(checklist.schedule_status.current_occurrence_date));
    }
    fd.append('general_remarks', generalRemarks.trim());
    fd.append('client_request_id', clientRequestId);
    fd.append('capture_source', 'CAMERA');

    let firstGlobalGps = null;

    const responseMeta = itemsList.map((item) => {
      const st = responsesMap[item.id] || { status: 'COMPLETED', remarks: '', custom_fields: {} };
      const { visibleQuestions, allPhotos, visiblePhotos, visibleVideos, visibleLocations } = evaluateActivityVisibility(item, st.custom_fields || {});
      let firstCapturedAt = null;

      if (allPhotos.length > 0) {
        visiblePhotos.forEach((req) => {
          const cap = capturedPhotos[getPhotoStateKey(item, req.id)];
          if (cap?.file) {
            fd.append(`photo_${item.id}_req_${req.id}`, cap.file);
            if (!firstCapturedAt) firstCapturedAt = cap.capturedAt;
          }
        });
      } else if (item.requires_photo !== false) {
        const cap = capturedPhotos[getPhotoStateKey(item)];
        if (cap?.file) {
          fd.append(`photo_${item.id}`, cap.file);
          firstCapturedAt = cap.capturedAt;
        }
      }

      const videoDurations = {};
      visibleVideos.forEach((vreq) => {
        const clips = capturedVideos[getVideoStateKey(item, vreq.id)] || [];
        if (clips.length > 0) {
          videoDurations[String(vreq.id)] = clips.map((c) => c.durationSeconds || 0);
          clips.forEach((clip, idx) => {
            fd.append(`video_${item.id}_req_${vreq.id}_${idx}`, clip.file);
          });
        }
      });

      const locationsPayload = {};
      visibleLocations.forEach((lreq) => {
        const capLoc = capturedLocations[getLocationStateKey(item, lreq.id)];
        if (capLoc && capLoc.latitude !== null && capLoc.longitude !== null) {
          const locObj = {
            latitude: capLoc.latitude,
            longitude: capLoc.longitude,
            accuracy_meters: capLoc.accuracy_meters,
            captured_at: capLoc.captured_at,
          };
          locationsPayload[String(lreq.id)] = locObj;
          if (!firstGlobalGps) firstGlobalGps = locObj;
        }
      });

      const visibleAnswers = {};
      const questionResponses = [];
      visibleQuestions.forEach((q) => {
        if (q.field_type === 'EVIDENCE_ONLY') return;
        let ansVal;
        if (Object.prototype.hasOwnProperty.call(st.custom_fields || {}, String(q.id))) {
          ansVal = st.custom_fields[String(q.id)];
        } else if (Object.prototype.hasOwnProperty.call(st.custom_fields || {}, q.id)) {
          ansVal = st.custom_fields[q.id];
        }
        if (ansVal !== undefined) {
          visibleAnswers[q.id] = ansVal;
          questionResponses.push({
            question_id: q.id,
            question_name: q.field_label,
            selected_answer: ansVal,
          });
        }
      });

      return {
        checklist_item_id: item.id,
        item_code: item.item_code,
        activity_name: item.description,
        status: st.status,
        remarks: (st.remarks || '').trim(),
        custom_fields: visibleAnswers,
        question_responses: questionResponses,
        video_durations: videoDurations,
        locations: locationsPayload,
        captured_at: firstCapturedAt || new Date().toISOString(),
        capture_source: 'CAMERA',
      };
    });
    if (firstGlobalGps) {
      fd.append('gps', JSON.stringify(firstGlobalGps));
    }
    fd.append('responses', JSON.stringify(responseMeta));

    try {
      submittingRef.current = true;
      setSubmitting(true);
      const res = await pmService.postMaintenanceData(fd);
      const postData = res?.data || {};
      const createdId = postData.submission_id;
      const refNum = postData.submission_reference_id || postData.submission_number || `#${createdId}`;

      showToastRef.current(`Maintenance submitted successfully: ${refNum}`, 'success');
      setCapturedPhotos({});
      setCapturedVideos({});
      setCapturedLocations({});
      setLocationErrors({});
      setClientRequestId(genRequestId());
      revokeAllObjectUrls();

      // Refresh checklist schedule state cleanly in the background
      pmService.getChecklist(selectedFreq, selectedMachineId || null)
        .then((clRes) => {
          if (clRes?.data) setChecklist(clRes.data);
        })
        .catch(() => {});

      if (createdId) {
        try {
          const detailRes = await pmService.getSubmissionDetail(createdId);
          setSubmittedRecord(detailRes?.data || {
            id: createdId,
            submission_number: refNum,
            machine_number: postData.machine_number || machineDetail?.machine_number || selectedMachineId,
            machine_name: machineDetail?.name || '',
            machine_model: machineDetail?.machine_model || '',
            machine_type: machineDetail?.machine_type || '',
            vendor_name: machineDetail?.vendor_name || '',
            frequency_code: postData.frequency || selectedFreq,
            frequency_name: checklist?.frequency?.name || selectedFreq,
            hour_meter_reading: postData.hour_meter_reading ?? hourMeter,
            submitted_by_name: postData.submitted_by_name || user?.name || 'Operator',
            submitted_by_role: postData.submitted_by_role || roleInfo?.role || '',
            status: postData.status || 'COMPLETED',
            approval_status: postData.approval_status || 'PENDING_REVIEW',
            completed_items_count: postData.completed_items_count ?? itemsList.length,
            total_items: postData.total_items ?? itemsList.length,
            photo_count: postData.photo_count ?? 0,
            general_remarks: generalRemarks.trim(),
            responses: [],
          });
        } catch {
          navigate('/operations/machine-maintenance/history');
        }
      } else {
        navigate('/operations/machine-maintenance/history');
      }
    } catch (err) {
      const errMsg = err?.message || 'Maintenance submission failed. Please review the form and try again.';
      setSubmitBackendError(errMsg);
      showToastRef.current(errMsg, 'error');
      if (err?.status === 409 && selectedFreq) {
        pmService.getChecklist(selectedFreq, selectedMachineId || null)
          .then((clRes) => {
            if (clRes?.data) setChecklist(clRes.data);
          })
          .catch(() => {});
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const openCapturedPreview = (item, capturedPhoto, requirement) => {
    setPreviewPhoto({
      view_url: capturedPhoto.previewUrl,
      checklist_description: requirement?.photo_name ? `${item.description} — ${requirement.photo_name}` : item.description,
      frequency_code: selectedFreq,
      machine_number: machineDetail?.machine_number || selectedMachineId,
      uploaded_by_name: 'Device Camera Capture',
      captured_at: capturedPhoto.capturedAt,
      sha256_hash: 'Calculated on submission',
    });
  };

  const openCameraForItem = (item, requirement = null) => {
    if (!selectedMachineId) {
      showToastRef.current('Please select a machine before capturing photos.', 'error');
      return;
    }
    setCameraTarget({ item, requirement });
  };

  const openVideoForItem = (item, requirement) => {
    if (!selectedMachineId) {
      showToastRef.current('Please select a machine before recording videos.', 'error');
      return;
    }
    setVideoTarget({ item, requirement });
  };

  const renderCustomFieldInput = (item, cf, currentValue) => {
    const val = currentValue === undefined || currentValue === null ? '' : currentValue;
    const baseStyle = {
      width: '100%',
      padding: '6px 10px',
      border: cf.is_mandatory && isEmptyCustomValue(currentValue) ? '1px solid #f59e0b' : '1px solid var(--border-strong)',
      borderRadius: 'var(--radius)',
      fontSize: '0.8125rem',
      background: '#fff',
    };

    switch (cf.field_type) {
      case 'TEXTAREA':
        return (
          <textarea
            rows={2}
            value={String(val)}
            onChange={(e) => updateCustomFieldValue(item.id, cf.id, e.target.value)}
            placeholder={cf.field_description || `Enter ${cf.field_label}`}
            style={baseStyle}
          />
        );
      case 'NUMBER':
        return (
          <input
            type="number"
            step="any"
            value={String(val)}
            onChange={(e) => updateCustomFieldValue(item.id, cf.id, e.target.value)}
            placeholder={cf.field_description || '0'}
            style={{ ...baseStyle, height: '36px' }}
          />
        );
      case 'DROPDOWN':
        return (
          <select
            value={String(val)}
            onChange={(e) => updateCustomFieldValue(item.id, cf.id, e.target.value)}
            style={{ ...baseStyle, height: '36px' }}
          >
            <option value="">-- Select Option --</option>
            {(cf.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'RADIO':
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
            {(cf.options || []).map((opt) => (
              <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name={`cf-${item.id}-${cf.id}`}
                  checked={String(val) === String(opt)}
                  onChange={() => updateCustomFieldValue(item.id, cf.id, opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        );
      case 'MULTI_SELECT':
      case 'CHECKBOX': {
        const selectedArr = Array.isArray(currentValue) ? currentValue : [];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
            {(cf.options || []).map((opt) => {
              const checked = selectedArr.includes(opt);
              return (
                <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selectedArr, opt]
                        : selectedArr.filter((x) => x !== opt);
                      updateCustomFieldValue(item.id, cf.id, next);
                    }}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        );
      }
      case 'DATE':
        return (
          <input
            type="date"
            value={String(val)}
            onChange={(e) => updateCustomFieldValue(item.id, cf.id, e.target.value)}
            style={{ ...baseStyle, height: '36px' }}
          />
        );
      case 'TIME':
        return (
          <input
            type="time"
            value={String(val)}
            onChange={(e) => updateCustomFieldValue(item.id, cf.id, e.target.value)}
            style={{ ...baseStyle, height: '36px' }}
          />
        );
      case 'YES_NO':
        return (
          <div style={{ display: 'flex', gap: '8px', paddingTop: '2px' }}>
            {['Yes', 'No'].map((choice) => {
              const active = String(val).toLowerCase() === choice.toLowerCase();
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => updateCustomFieldValue(item.id, cf.id, choice)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '4px',
                    border: active ? '1px solid #047857' : '1px solid var(--border-strong)',
                    background: active ? '#047857' : '#fff',
                    color: active ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        );
      case 'TEXT':
      default:
        return (
          <input
            type="text"
            value={String(val)}
            onChange={(e) => updateCustomFieldValue(item.id, cf.id, e.target.value)}
            placeholder={cf.field_description || `Enter ${cf.field_label}`}
            style={{ ...baseStyle, height: '36px' }}
          />
        );
    }
  };

  const renderPhotoCaptureSlot = (item, requirement = null, orderNum = null) => {
    const reqId = requirement?.id || null;
    const isMandatory = requirement ? Boolean(requirement.is_mandatory) : true;
    const baseLabel = requirement?.photo_name || 'Activity Camera Photo';
    const label = orderNum ? `${orderNum}. ${baseLabel}` : baseLabel;
    const desc = requirement?.photo_description || '';
    const capturedPhoto = capturedPhotos[getPhotoStateKey(item, reqId)] || null;
    const hasPhoto = Boolean(capturedPhoto?.file && capturedPhoto?.previewUrl);

    return (
      <div
        key={reqId || 'default-photo'}
        style={{
          padding: '10px',
          borderRadius: 'var(--radius)',
          border: hasPhoto ? '1px solid #86efac' : isMandatory ? '1px solid #fecaca' : '1px solid var(--border)',
          background: hasPhoto ? '#f0fdf4' : '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {label} {isMandatory ? <span style={{ color: 'var(--danger)' }}>*</span> : null}
            </div>
            {desc ? <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>Description: {desc}</div> : null}
          </div>
          <span className={`badge-pill ${hasPhoto ? 'badge-green' : isMandatory ? 'badge-breakdown' : 'badge-neutral'}`}>
            {hasPhoto ? 'Photo Captured' : isMandatory ? 'Photo Required *' : 'Optional Photo'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {hasPhoto ? (
            <button
              type="button"
              onClick={() => openCapturedPreview(item, capturedPhoto, requirement)}
              style={{
                position: 'relative',
                height: '64px',
                minWidth: '64px',
                maxWidth: '112px',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid #16a34a',
                background: '#0f172a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                padding: 0,
                cursor: 'pointer',
              }}
              title="Click to view captured photo"
            >
              <PmAuthorizedPhoto
                viewUrl={capturedPhoto.previewUrl}
                alt={label}
                style={{ height: '64px', width: 'auto', maxWidth: '112px', objectFit: 'contain', display: 'block' }}
              />
            </button>
          ) : null}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {hasPhoto ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submitting}
                  onClick={() => openCapturedPreview(item, capturedPhoto, requirement)}
                  style={{ fontSize: '0.76rem' }}
                >
                  <LucideEye size={13} />
                  <span>View Photo</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submitting}
                  onClick={() => openCameraForItem(item, requirement)}
                  style={{ fontSize: '0.76rem' }}
                >
                  <LucideRefreshCw size={13} />
                  <span>Retake Photo</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                disabled={submitting}
                onClick={() => openCameraForItem(item, requirement)}
                style={{ fontSize: '0.76rem' }}
              >
                <LucideCamera size={13} />
                <span>Camera Capture</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVideoRequirementSlot = (item, vreq, orderNum = null) => {
    const clips = capturedVideos[getVideoStateKey(item, vreq.id)] || [];
    const minV = Number(vreq.min_videos || 0);
    const maxV = Number(vreq.max_videos || 1);
    const isMet = !vreq.is_mandatory || clips.length >= Math.max(1, minV);
    const titleLabel = orderNum ? `${orderNum}. ${vreq.video_name}` : vreq.video_name;

    return (
      <div
        key={vreq.id}
        style={{
          padding: '10px',
          borderRadius: 'var(--radius)',
          border: clips.length > 0 && isMet ? '1px solid #86efac' : vreq.is_mandatory ? '1px solid #fde68a' : '1px solid var(--border)',
          background: clips.length > 0 && isMet ? '#f0fdf4' : '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {titleLabel} {vreq.is_mandatory ? <span style={{ color: 'var(--danger)' }}>*</span> : null}
            </div>
            {vreq.video_description ? (
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>Description: {vreq.video_description}</div>
            ) : null}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Recorded: {clips.length} / Max {maxV} (Min {vreq.is_mandatory ? Math.max(1, minV) : minV}) · Max duration {vreq.max_duration_seconds}s per clip
            </div>
          </div>
          <span className={`badge-pill ${clips.length > 0 && isMet ? 'badge-green' : vreq.is_mandatory ? 'badge-breakdown' : 'badge-neutral'}`}>
            {clips.length > 0 && isMet ? `${clips.length} Video(s) Captured` : vreq.is_mandatory ? 'Video Required *' : 'Optional Video'}
          </span>
        </div>

        {clips.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
            {clips.map((clip, cIdx) => (
              <div
                key={`${clip.capturedAt}-${cIdx}`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '6px',
                  background: '#0f172a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <PmAuthorizedVideo
                  viewUrl={clip.previewUrl}
                  style={{ width: '100%', maxHeight: '150px', borderRadius: '4px', display: 'block' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e2e8f0', fontSize: '0.72rem' }}>
                  <span>Clip #{cIdx + 1} · {clip.durationSeconds || 0}s</span>
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ padding: '2px 7px', fontSize: '0.7rem' }}
                    onClick={() => handleRemoveVideoClip(item, vreq, cIdx)}
                  >
                    <LucideTrash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting || clips.length >= maxV}
            onClick={() => openVideoForItem(item, vreq)}
            style={{ fontSize: '0.76rem' }}
          >
            <LucideVideo size={13} />
            <span>{clips.length >= maxV ? `Max ${maxV} Clip(s) Reached` : clips.length > 0 ? '+ Record Another Video' : 'Record Video'}</span>
          </button>
        </div>
      </div>
    );
  };

  const renderLocationRequirementSlot = (item, lreq, orderNum = null) => {
    const lKey = getLocationStateKey(item, lreq.id);
    const capLoc = capturedLocations[lKey];
    const errMsg = locationErrors[lKey];
    const isBusy = locatingKey === lKey;
    const hasCoords = Boolean(capLoc && capLoc.latitude !== null && capLoc.longitude !== null);
    const geoEval = hasCoords ? evaluateGeofenceClient(lreq, capLoc.latitude, capLoc.longitude) : null;
    const isHardGeoBlock = Boolean(geoEval?.geofenceRequired && !geoEval.isInside && lreq.is_mandatory);
    const isSoftGeoWarn = Boolean(geoEval?.geofenceRequired && !geoEval.isInside && !lreq.is_mandatory);

    return (
      <div
        key={`loc-req-${item.id}-${lreq.id}`}
        style={{
          padding: '10px',
          borderRadius: 'var(--radius)',
          border: (errMsg && lreq.is_mandatory) || isHardGeoBlock
            ? '1px solid #fca5a5'
            : isSoftGeoWarn
              ? '1px solid #fcd34d'
              : capLoc && !errMsg
                ? '1px solid #86efac'
                : '1px solid var(--border-strong)',
          background: (errMsg && lreq.is_mandatory) || isHardGeoBlock
            ? '#fef2f2'
            : isSoftGeoWarn
              ? '#fffbeb'
              : capLoc && !errMsg
                ? '#f0fdf4'
                : 'var(--bg-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {orderNum ? `GPS ${orderNum}: ` : ''}
              {lreq.location_name}
            </div>
            {lreq.location_description ? (
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {lreq.location_description}
              </div>
            ) : null}
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Rule: {lreq.capture_rule === 'HIGH_ACCURACY' ? 'High Accuracy GPS' : 'Live Device GPS'}
              {lreq.accuracy_threshold_meters ? ` · Max ±${lreq.accuracy_threshold_meters}m` : ''}
              {lreq.is_geofence_required
                ? lreq.geofence_type === 'POLYGON'
                  ? ` · Geofence: Polygon (${(lreq.geofence_polygon || []).length} pts${lreq.geofence_reference_name ? ` · ${lreq.geofence_reference_name}` : ''})`
                  : ` · Geofence: Circle (${lreq.geofence_radius_meters}m${lreq.geofence_reference_name ? ` around ${lreq.geofence_reference_name}` : ''})`
                : ' · Geofence: Not Required'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {geoEval?.geofenceRequired && (
              <span className={`badge-pill ${geoEval.isInside ? 'badge-green' : lreq.is_mandatory ? 'badge-red' : 'badge-neutral'}`}>
                {geoEval.isInside ? 'Inside Geofence' : `Outside (+${geoEval.distanceFromBoundaryMeters ?? '?'}m)`}
              </span>
            )}
            <span className={`badge-pill ${lreq.is_mandatory ? 'badge-red' : 'badge-neutral'}`}>
              {lreq.is_mandatory ? 'Mandatory' : 'Optional'}
            </span>
          </div>
        </div>

        {capLoc && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '4px',
              background: '#fff',
              border: isHardGeoBlock ? '1px solid #fecaca' : isSoftGeoWarn ? '1px solid #fde68a' : '1px solid #bbf7d0',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '6px',
            }}
          >
            {lreq.capture_latitude !== false && (
              <div><strong>Lat:</strong> {capLoc.latitude}</div>
            )}
            {lreq.capture_longitude !== false && (
              <div><strong>Lng:</strong> {capLoc.longitude}</div>
            )}
            <div><strong>Accuracy:</strong> {capLoc.accuracy_meters !== null && capLoc.accuracy_meters !== undefined ? `±${capLoc.accuracy_meters}m` : 'N/A'}</div>
            {lreq.capture_timestamp !== false && capLoc.captured_at && (
              <div><strong>Time:</strong> {new Date(capLoc.captured_at).toLocaleTimeString()}</div>
            )}
          </div>
        )}

        {geoEval?.geofenceRequired && geoEval.isInside && (
          <div style={{ fontSize: '0.74rem', color: '#15803d', fontWeight: 600 }}>
            {geoEval.message}
          </div>
        )}

        {errMsg && (
          <div style={{ fontSize: '0.75rem', color: isSoftGeoWarn ? '#b45309' : '#b91c1c', fontWeight: 600 }}>
            {errMsg}
            {isSoftGeoWarn ? ' (Optional GPS: submission will record geofence status without blocking.)' : ''}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting || isBusy}
            onClick={() => handleCaptureGps(item, lreq)}
            style={{ fontSize: '0.76rem' }}
          >
            <LucideMapPin size={13} />
            <span>{isBusy ? 'Capturing GPS...' : capLoc ? 'Refresh GPS Coordinates' : 'Capture GPS Location'}</span>
          </button>
          {capLoc && (
            <button
              type="button"
              className="btn-danger"
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              onClick={() => handleClearCapturedLocation(item, lreq)}
            >
              <LucideTrash2 size={11} /> Clear
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderActivityCard = (item, idx) => {
    const state = responsesMap[item.id] || { status: 'COMPLETED', remarks: '', custom_fields: {} };
    const isNotCompleted = state.status === 'NOT_COMPLETED';
    const itemError = validationErrors.itemErrors[item.id] || '';
    const {
      visibleQuestions: customFields,
      visibleSections,
      allPhotos,
      visiblePhotos: photoRequirements,
      visibleVideos: videoRequirements,
      visibleLocations: locationRequirements,
    } = evaluateActivityVisibility(item, state.custom_fields || {});

    const renderQuestionCard = (cf) => {
      const qPhotos = photoRequirements.filter((p) => String(p.question_id || '') === String(cf.id));
      const qVideos = videoRequirements.filter((v) => String(v.question_id || '') === String(cf.id));
      const qLocations = locationRequirements.filter((l) => String(l.question_id || '') === String(cf.id));
      const hasQuestionEvidence = qPhotos.length > 0 || qVideos.length > 0 || qLocations.length > 0;
      const isEvidenceOnly = cf.field_type === 'EVIDENCE_ONLY';

      if (isEvidenceOnly && !hasQuestionEvidence) {
        return null;
      }

      return (
        <div
          key={cf.id}
          style={{
            padding: '10px',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {isEvidenceOnly ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span className="badge-pill badge-blue">Evidence Only (No Answer)</span>
              {cf.field_description ? (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{cf.field_description}</span>
              ) : null}
            </div>
          ) : (
            <div id={`pm-question-${item.id}-${cf.id}`}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>
                {cf.field_label} {cf.is_mandatory ? <span style={{ color: 'var(--danger)' }}>*</span> : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>}
              </label>
              {cf.field_description ? (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {cf.field_description}
                </div>
              ) : null}
              {renderCustomFieldInput(item, cf, (state.custom_fields || {})[cf.id])}
              {validationErrors.questionErrors[`${item.id}:${cf.id}`] && (
                <div style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 600, marginTop: '4px' }}>
                  {validationErrors.questionErrors[`${item.id}:${cf.id}`]}
                </div>
              )}
            </div>
          )}

          {hasQuestionEvidence && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                ...(isEvidenceOnly ? {} : { paddingTop: '8px', borderTop: '1px dashed var(--border-strong)' }),
              }}
            >
              {qPhotos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px' }}>
                  {qPhotos.map((req, pIdx) => renderPhotoCaptureSlot(item, req, pIdx + 1))}
                </div>
              )}
              {qVideos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                  {qVideos.map((vreq, vIdx) => renderVideoRequirementSlot(item, vreq, vIdx + 1))}
                </div>
              )}
              {qLocations.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                  {qLocations.map((lreq, lIdx) => renderLocationRequirementSlot(item, lreq, lIdx + 1))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div
        id={`pm-activity-${item.id}`}
        key={item.id}
        style={{
          padding: '14px',
          border: itemError ? '1.5px solid #dc2626' : isNotCompleted ? '1px solid #fca5a5' : '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: isNotCompleted ? '#fef2f2' : 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="badge-pill badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>
                #{idx + 1} · {item.item_code}
              </span>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{item.description}</strong>
            </div>
            {item.special_instructions || item.remarks ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Description: {item.special_instructions || item.remarks}
              </div>
            ) : null}
          </div>

          <div className="seg-tabs">
            <button
              type="button"
              className={`seg-tab${state.status === 'COMPLETED' ? ' is-active' : ''}`}
              onClick={() => updateItemState(item.id, { status: 'COMPLETED' })}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: state.status === 'COMPLETED' ? '#047857' : 'transparent',
                color: state.status === 'COMPLETED' ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              <LucideCheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Completed
            </button>
            <button
              type="button"
              className={`seg-tab${isNotCompleted ? ' is-active' : ''}`}
              onClick={() => updateItemState(item.id, { status: 'NOT_COMPLETED' })}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: isNotCompleted ? '#dc2626' : 'transparent',
                color: isNotCompleted ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              <LucideXCircle size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Not Completed
            </button>
          </div>
        </div>

        {/* Dynamic Sections -> Questions -> Evidence */}
        {visibleSections && visibleSections.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {visibleSections.map((sec, sIdx) => (
              <div
                key={sec.id || `sec-${sIdx}`}
                style={{
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius)',
                  padding: '10px',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Section {sIdx + 1} – {sec.section_name}
                  </div>
                  {sec.section_description ? (
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {sec.section_description}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(sec.questions || []).map((cf) => renderQuestionCard(cf))}
                </div>
              </div>
            ))}
          </div>
        ) : customFields.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {customFields.map((cf) => renderQuestionCard(cf))}
          </div>
        ) : null}

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
            Activity Remarks {isNotCompleted ? <span style={{ color: 'var(--danger)' }}>* (Mandatory)</span> : '(Optional)'}
          </label>
          <input
            type="text"
            placeholder={isNotCompleted ? 'Explain why activity was not completed...' : 'Observations or readings...'}
            value={state.remarks || ''}
            onChange={(e) => updateItemState(item.id, { remarks: e.target.value })}
            style={{
              width: '100%',
              height: '36px',
              padding: '0 10px',
              border: isNotCompleted && !(state.remarks || '').trim() ? '1px solid var(--danger)' : '1px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              fontSize: '0.8125rem',
              background: '#fff',
            }}
          />
        </div>

        {/* Unlinked / Activity-Level Evidence Requirements (backward compatible if not tied to a Question) */}
        {(() => {
          const unlinkedPhotos = photoRequirements.filter((p) => !p.question_id);
          const unlinkedVideos = videoRequirements.filter((v) => !v.question_id);
          const unlinkedLocations = locationRequirements.filter((l) => !l.question_id);
          return (
            <>
              {unlinkedPhotos.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Photo Requirements:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                    {unlinkedPhotos.map((req, pIdx) => renderPhotoCaptureSlot(item, req, pIdx + 1))}
                  </div>
                </div>
              ) : allPhotos.length === 0 && item.requires_photo !== false ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {renderPhotoCaptureSlot(item, null)}
                </div>
              ) : null}

              {unlinkedVideos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Video Requirements:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                    {unlinkedVideos.map((vreq, vIdx) => renderVideoRequirementSlot(item, vreq, vIdx + 1))}
                  </div>
                </div>
              )}

              {unlinkedLocations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>GPS Location Requirements:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                    {unlinkedLocations.map((lreq, lIdx) => renderLocationRequirementSlot(item, lreq, lIdx + 1))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
        {itemError && (
          <div style={{ padding: '7px 10px', borderRadius: 'var(--radius)', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.76rem', fontWeight: 600 }}>
            {itemError}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="screen-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PmLayoutHeader
        title="Perform Preventive Maintenance"
        subtitle="Capture individual photographic evidence for every checklist activity"
        roleInfo={roleInfo}
      />

      {allowedFrequencies.length === 0 ? (
        <div className="empty-state">
          <h3>No Maintenance Checklists Assigned to Your Role</h3>
          <p>Contact an Administrator if you need Operator, Field Engineer, or Area Manager checklist permissions.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Machine, Frequency & Hour-Meter Card */}
          <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Select HERO Machine *
                </label>
                <SearchableSelect
                  value={selectedMachineId}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  placeholder="Choose Machine..."
                >
                  <option value="">-- Select Machine --</option>
                  {machines.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.machine_number} — {m.name} ({m.vendor_name})
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Maintenance Frequency *
                </label>
                <SearchableSelect
                  value={selectedFreq}
                  onChange={(e) => setSelectedFreq(e.target.value)}
                  placeholder="Choose Frequency..."
                >
                  {allowedFrequencies.map((f) => (
                    <option key={f.code} value={f.code}>
                      {PM_FREQUENCY_LABELS[f.code] || f.name} ({f.checklist_item_count} items)
                    </option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Current Hour-Meter Reading (hrs) *
                </label>
                <input
                  id="pm-hour-meter-input"
                  type="number"
                  step="any"
                  min="0"
                  value={hourMeter}
                  onChange={(e) => {
                    setHourMeter(e.target.value);
                    setSubmitBackendError('');
                    if (validationErrors.hourMeterError || validationErrors.formError) {
                      setValidationErrors((prev) => ({ ...prev, hourMeterError: '', formError: '' }));
                    }
                  }}
                  placeholder="e.g. 245.5"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 10px',
                    border: validationErrors.hourMeterError ? '1px solid #dc2626' : '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
                {validationErrors.hourMeterError && (
                  <div style={{ fontSize: '0.73rem', color: '#dc2626', fontWeight: 600, marginTop: '4px' }}>
                    {validationErrors.hourMeterError}
                  </div>
                )}
              </div>
            </div>

            {machineDetail ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: '10px',
                  padding: '10px 12px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  fontSize: '0.78rem',
                }}
              >
                <div><span style={{ color: 'var(--text-muted)' }}>Machine ID / Number:</span><br /><strong style={{ fontFamily: 'var(--font-mono)' }}>{machineDetail.id} / {machineDetail.machine_number}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Model & Type:</span><br /><strong>{machineDetail.machine_model} ({machineDetail.machine_type})</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Vendor:</span><br /><strong>{machineDetail.vendor_name}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Assigned Operator:</span><br /><strong>{machineDetail.assigned_operator || 'Not Assigned'}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Current Hour Meter:</span><br /><strong style={{ fontFamily: 'var(--font-mono)' }}>{machineDetail.engine_hours ?? 0} hrs</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Site / Assignment:</span><br /><strong>{machineDetail.site_name || machineDetail.location_name || 'Operational'}</strong></div>
              </div>
            ) : null}

            {checklist?.schedule_status ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: checklist.schedule_status.already_completed_for_occurrence
                    ? '1px solid #fca5a5'
                    : checklist.schedule_status.status === 'OVERDUE'
                      ? '1px solid #fdba74'
                      : '1px solid #bfdbfe',
                  background: checklist.schedule_status.already_completed_for_occurrence
                    ? '#fef2f2'
                    : checklist.schedule_status.status === 'OVERDUE'
                      ? '#fff7ed'
                      : '#eff6ff',
                  fontSize: '0.79rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span>
                    <strong>Applicable Schedule:</strong>{' '}
                    {(checklist.schedule_status.schedule_summaries || []).join(' · ') || checklist.frequency?.name}
                  </span>
                  <span className="badge-pill badge-blue">{checklist.schedule_status.due_label}</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {checklist.schedule_status.current_occurrence_date && (
                    <span>Scheduled Date: {checklist.schedule_status.current_occurrence_date}</span>
                  )}
                  {checklist.frequency?.code !== 'DAILY' && checklist.schedule_status.completion_deadline_date && (
                    <span>
                      Completion Deadline: {checklist.schedule_status.completion_deadline_date}
                      {checklist.schedule_status.buffer_days > 0 ? ` (+${checklist.schedule_status.buffer_days}d buffer)` : ''}
                    </span>
                  )}
                  {checklist.schedule_status.next_scheduled_date && (
                    <span>Next Due Date: {checklist.schedule_status.next_scheduled_date}</span>
                  )}
                  {checklist.schedule_status.last_completed_date && (
                    <span>Last Completed: {checklist.schedule_status.last_completed_date}</span>
                  )}
                  {(checklist.schedule_status.upcoming_dates || []).length > 0 && (
                    <span>Upcoming: {checklist.schedule_status.upcoming_dates.join(', ')}</span>
                  )}
                </div>
                {checklist.schedule_status.already_completed_for_occurrence && (
                  <div style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.77rem' }}>
                    Already completed for the current scheduled occurrence ({checklist.schedule_status.current_occurrence_date}) as{' '}
                    {checklist.schedule_status.existing_submission_number}. Duplicate submissions are disabled for this slot.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Mandatory Photo Policy Notice */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              fontSize: '0.8rem',
              color: '#92400e',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>
              <strong>Live Camera Policy:</strong> All configured photos and videos must be captured directly using the device camera. Gallery uploads and file browsing are disabled.
            </span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              Mandatory Photos: {evidenceSummary.requiredPhotosDone} / {evidenceSummary.requiredPhotosTotal}
              {evidenceSummary.requiredVideosTotal > 0
                ? ` · Mandatory Videos: ${evidenceSummary.requiredVideosDone} / ${evidenceSummary.requiredVideosTotal}`
                : evidenceSummary.totalVideosRecorded > 0
                  ? ` · Videos Recorded: ${evidenceSummary.totalVideosRecorded}`
                  : ''}
              {evidenceSummary.requiredLocationsTotal > 0
                ? ` · Mandatory GPS: ${evidenceSummary.requiredLocationsDone} / ${evidenceSummary.requiredLocationsTotal}`
                : evidenceSummary.totalLocationsCaptured > 0
                  ? ` · GPS Captured: ${evidenceSummary.totalLocationsCaptured}`
                  : ''}
            </strong>
          </div>

          {loadingChecklist ? (
            <div className="app-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading checklist activities...
            </div>
          ) : checklist ? (
            <>
              {categoryGroups.length === 0 ? (
                <div className="app-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No active maintenance activities configured for this frequency.
                </div>
              ) : (() => {
                let runningIndex = 0;
                return categoryGroups.map((group, catIdx) => {
                  const cleanCatName = String(group.category_name || group.category_code || 'Maintenance').replace(/\s*Checklist$/i, '');
                  const startOffset = runningIndex;
                  runningIndex += group.items.length;
                  return (
                    <div
                      key={group.category_code || catIdx}
                      className="app-card"
                      style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>
                        Category {catIdx + 1}: {cleanCatName} Checklist ({group.items.length}{' '}
                        {group.items.length === 1 ? 'activity' : 'activities'})
                      </h3>
                      {group.items.map((it, idx) => renderActivityCard(it, startOffset + idx))}
                    </div>
                  );
                });
              })()}

              <div className="app-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                    General Maintenance Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={generalRemarks}
                    onChange={(e) => setGeneralRemarks(e.target.value)}
                    placeholder="Overall inspection notes, observations, or follow-up requirements..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.8125rem',
                    }}
                  />
                </div>

                {(submitBackendError || validationErrors.formError) && (
                  <div
                    role="alert"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius)',
                      background: '#fef2f2',
                      border: '1px solid #fca5a5',
                      color: '#b91c1c',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    {submitBackendError || validationErrors.formError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: evidenceSummary.isDuplicateBlocked ? '#b91c1c' : 'var(--text-muted)' }}>
                    {evidenceSummary.isDuplicateBlocked
                      ? `Already completed for current occurrence (${checklist?.schedule_status?.existing_submission_number}).`
                      : evidenceSummary.isFormReady
                        ? 'All mandatory fields and evidence captured. Ready to submit.'
                        : (() => {
                            const parts = [];
                            const remQ = Math.max(0, evidenceSummary.requiredQuestionsTotal - evidenceSummary.requiredQuestionsDone);
                            const remP = Math.max(0, evidenceSummary.requiredPhotosTotal - evidenceSummary.requiredPhotosDone);
                            const remV = Math.max(0, evidenceSummary.requiredVideosTotal - evidenceSummary.requiredVideosDone);
                            const remG = Math.max(0, evidenceSummary.requiredLocationsTotal - evidenceSummary.requiredLocationsDone);
                            if (!selectedMachineId) parts.push('select a machine');
                            if (!evidenceSummary.hourMeterValid) parts.push('enter hour-meter reading');
                            if (remQ > 0) parts.push(`answer ${remQ} mandatory question(s)`);
                            if (remP > 0) parts.push(`capture ${remP} mandatory photo(s)`);
                            if (remV > 0) parts.push(`record ${remV} mandatory video(s)`);
                            if (remG > 0) parts.push(`capture ${remG} mandatory GPS coordinate(s)`);
                            if (evidenceSummary.missingRemarksCount > 0) parts.push(`add remarks for ${evidenceSummary.missingRemarksCount} not-completed item(s)`);
                            return parts.length > 0 ? `Complete required steps to submit: ${parts.join(', ')}.` : 'Ready to submit.';
                          })()}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => navigate('/operations/machine-maintenance')}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submitting || !selectedMachineId || itemsList.length === 0 || evidenceSummary.isDuplicateBlocked}
                    >
                      <LucideSend size={14} />
                      {submitting ? 'Submitting...' : 'Submit Maintenance Checklist'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </form>
      )}

      <PmCameraCaptureModal
        isOpen={Boolean(cameraTarget)}
        onClose={() => setCameraTarget(null)}
        item={cameraTarget?.item ? { ...cameraTarget.item, description: cameraTarget.requirement?.photo_name ? `${cameraTarget.item.description} — ${cameraTarget.requirement.photo_name}` : cameraTarget.item.description } : null}
        onConfirmCapture={(file) => handleCameraPhotoCaptured(cameraTarget?.item, file, cameraTarget?.requirement || null)}
      />

      <PmVideoCaptureModal
        isOpen={Boolean(videoTarget)}
        onClose={() => setVideoTarget(null)}
        item={videoTarget?.item || null}
        requirement={videoTarget?.requirement || null}
        onConfirmCapture={handleCameraVideoCaptured}
      />

      <PmPhotoLightboxModal
        isOpen={Boolean(previewPhoto)}
        onClose={() => setPreviewPhoto(null)}
        photo={previewPhoto}
      />

      <PmSubmissionDetailModal
        isOpen={Boolean(submittedRecord)}
        onClose={() => {
          setSubmittedRecord(null);
          navigate('/operations/machine-maintenance/history');
        }}
        submission={submittedRecord}
      />
    </div>
  );
};

