import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import HoverRevealText from '../components/common/HoverRevealText';
import { LicenseDetailSkeleton } from '../components/common/Skeleton';
import LicenseStatusBadge from '../components/licenses/LicenseStatusBadge';
import LicenseTagPicker from '../components/licenses/LicenseTagPicker';
import OperatorPicker from '../components/licenses/OperatorPicker';
import { getLicenseSnapshotStatus } from '../data/licenseSnapshotHistory';
import { useLicenseDeviceHistory } from '../hooks/useLicenseDeviceHistory';
import { useLicenseLabels } from '../hooks/useLicenseLabels';
import { useLicensePresetTags } from '../hooks/useLicensePresetTags';
import { useLicenseSnapshotHistory } from '../hooks/useLicenseSnapshotHistory';
import { useOperatorTags } from '../hooks/useOperatorTags';
import { truncateHex } from '../utils/formatters';
import { buildCloneIndexMap, formatTaggedLicenseName, getLicenseBackendName, getLicenseDisplayName } from '../utils/licenseDisplay';

function formatDayKey(dayKey) {
  if (!dayKey) {
    return '—';
  }

  return new Date(`${dayKey}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatHistoryTimestamp(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDeviceName(deviceName, deviceId) {
  if (deviceName) {
    return deviceName;
  }

  if (deviceId) {
    return `Device ${String(deviceId).slice(0, 8)}`;
  }

  return 'No remembered device';
}

function formatPercent(value) {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : '—';
}

function getCurrentLinkStateSummary({ licenseDetails, currentLink, latestLink }) {
  const currentDeviceLabel = formatDeviceName(
    getLicenseBackendName(licenseDetails) || currentLink?.deviceName || latestLink?.deviceName || '',
    normalizeDeviceIdentifier(licenseDetails?.deviceId) || currentLink?.deviceId || latestLink?.deviceId || ''
  );

  if (normalizeDeviceIdentifier(licenseDetails?.deviceId) || normalizeDeviceIdentifier(getLicenseBackendName(licenseDetails)) || currentLink) {
    return {
      title: `Currently linked to ${currentDeviceLabel}`,
      detail: currentLink?.linkedAt
        ? `Linked since ${formatHistoryTimestamp(currentLink.linkedAt)}`
        : 'Using live API device state.',
    };
  }

  return {
    title: 'Currently unbound',
    detail: latestLink?.unlinkedAt
      ? `Last unlinked ${formatHistoryTimestamp(latestLink.unlinkedAt)}`
      : 'No device is currently linked to this license.',
  };
}

function normalizeDeviceIdentifier(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function sameDeviceIdentity(link, deviceId, deviceName) {
  if (!link) {
    return false;
  }

  const normalizedDeviceId = normalizeDeviceIdentifier(deviceId);
  const normalizedDeviceName = normalizeDeviceIdentifier(deviceName);

  if (normalizedDeviceId && link.deviceId) {
    return link.deviceId === normalizedDeviceId;
  }

  return Boolean(normalizedDeviceName) && link.deviceName === normalizedDeviceName;
}

function reconcileLiveLinkPeriods(rawLinkPeriods, liveLicense) {
  const links = [...(rawLinkPeriods || [])]
    .map((link) => ({ ...link }))
    .sort((left, right) => new Date(left.linkedAt) - new Date(right.linkedAt));

  if (!links.length) {
    return [];
  }

  const liveDeviceId = normalizeDeviceIdentifier(liveLicense?.deviceId);
  const liveDeviceName = normalizeDeviceIdentifier(getLicenseBackendName(liveLicense));

  if (!liveDeviceId && !liveDeviceName) {
    return links.sort((left, right) => new Date(right.linkedAt) - new Date(left.linkedAt));
  }

  let currentIndex = links.findIndex((link) => link.current);

  if (currentIndex !== -1 && sameDeviceIdentity(links[currentIndex], liveDeviceId, liveDeviceName)) {
    return links.sort((left, right) => new Date(right.linkedAt) - new Date(left.linkedAt));
  }

  let matchingIndex = -1;
  for (let index = links.length - 1; index >= 0; index -= 1) {
    if (sameDeviceIdentity(links[index], liveDeviceId, liveDeviceName)) {
      matchingIndex = index;
      break;
    }
  }

  if (matchingIndex === -1) {
    return links.sort((left, right) => new Date(right.linkedAt) - new Date(left.linkedAt));
  }

  if (currentIndex !== -1) {
    links[currentIndex] = {
      ...links[currentIndex],
      current: false,
      unlinkedAt: links[currentIndex].unlinkedAt || links[currentIndex].linkedAt,
    };
  }

  links[matchingIndex] = {
    ...links[matchingIndex],
    current: true,
    unlinkedAt: null,
  };

  return links.sort((left, right) => new Date(right.linkedAt) - new Date(left.linkedAt));
}

function buildLinkEvents(linkPeriods) {
  return (linkPeriods || [])
    .flatMap((link, index) => {
      const deviceLabel = formatDeviceName(link.deviceName, link.deviceId);
      const linkKey = `${link.linkedAt}-${link.deviceId || link.deviceName || index}`;
      const events = [
        {
          id: `${linkKey}-linked`,
          type: 'linked',
          timestamp: link.linkedAt,
          deviceLabel,
          deviceId: link.deviceId || '',
          current: Boolean(link.current),
        },
      ];

      if (!link.current && link.unlinkedAt) {
        events.push({
          id: `${linkKey}-unlinked`,
          type: 'unlinked',
          timestamp: link.unlinkedAt,
          deviceLabel,
          deviceId: link.deviceId || '',
          current: false,
        });
      }

      return events;
    })
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
}

function getLiveStatus(license) {
  if (!license?.deviceId && !license?.deviceName) {
    return 'unbound';
  }

  if (
    typeof license?.uptime === 'number'
    && typeof license?.leaseMinUptimePercentage === 'number'
    && license.uptime * 100 < license.leaseMinUptimePercentage
  ) {
    return 'below-min';
  }

  return license?.isOnline ? 'online' : 'offline';
}

export default function LicenseHistoryDetailPage({ api }) {
  const { id } = useParams();
  const decodedId = decodeURIComponent(id);
  const { user, licenses, isLoading } = api;
  const { deviceHistory } = useLicenseDeviceHistory(user?.id, licenses);
  const { days: snapshotDays } = useLicenseSnapshotHistory(user?.id, licenses);
  const { getLabel, setLabel } = useLicenseLabels(user?.id);
  const { getPresetTag, setPresetTag, presetTags, cloneTagOrder } = useLicensePresetTags(user?.id);
  const { getOperator, setOperator, allOperators } = useOperatorTags(user?.id);

  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenses || []).map((license) => [license.id, license])),
    [licenses]
  );

  const licenseDetails = licenseInfoById[decodedId] || null;
  const historyRecord = deviceHistory[decodedId] || null;

  const snapshotTimeline = useMemo(() => {
    return Object.keys(snapshotDays || {})
      .sort((left, right) => right.localeCompare(left))
      .map((dayKey) => {
        const snapshot = snapshotDays?.[dayKey]?.licenses?.[decodedId] || null;

        if (!snapshot) {
          return null;
        }

        return {
          dayKey,
          capturedAt: snapshotDays[dayKey].capturedAt,
          snapshot,
          status: getLicenseSnapshotStatus(snapshot),
        };
      })
      .filter(Boolean);
  }, [snapshotDays, decodedId]);

  const linkPeriods = useMemo(() => {
    return reconcileLiveLinkPeriods(historyRecord?.links || [], licenseDetails);
  }, [historyRecord, licenseDetails]);
  const linkEvents = useMemo(() => buildLinkEvents([...linkPeriods].reverse()), [linkPeriods]);

  const latestLink = linkPeriods[0] || null;
  const currentLink = linkPeriods.find((link) => link.current) || null;
  const latestSnapshotEntry = snapshotTimeline[0] || null;
  const baseDeviceName = getLicenseBackendName(licenseDetails) || currentLink?.deviceName || latestLink?.deviceName || latestSnapshotEntry?.snapshot?.deviceName || '';
  const cloneIndexById = useMemo(
    () => buildCloneIndexMap(
      presetTags,
      (licenseId) => {
        if (licenseId === decodedId) {
          return baseDeviceName;
        }

        return getLicenseBackendName(licenseInfoById[licenseId]);
      },
      cloneTagOrder
    ),
    [presetTags, decodedId, baseDeviceName, licenseInfoById, cloneTagOrder]
  );

  const label = getLabel(decodedId);
  const presetTag = getPresetTag(decodedId);
  const cloneIndex = cloneIndexById[decodedId] || null;
  const taggedName = formatTaggedLicenseName(baseDeviceName, presetTag, cloneIndex);
  const displayName = getLicenseDisplayName({
    customLabel: label,
    backendName: baseDeviceName,
    presetTag,
    cloneIndex,
  }) || `License ${truncateHex(decodedId, 8, 6)}`;
  const operator = getOperator(decodedId);
  const currentStatus = latestSnapshotEntry?.status || getLiveStatus(licenseDetails);
  const firstSnapshotDayKey = snapshotTimeline[snapshotTimeline.length - 1]?.dayKey || null;
  const lastChangeAt = historyRecord?.lastChangedAt || latestLink?.linkedAt || null;
  const currentDeviceSummary = formatDeviceName(
    getLicenseBackendName(licenseDetails) || currentLink?.deviceName || latestLink?.deviceName || latestSnapshotEntry?.snapshot?.deviceName || '',
    licenseDetails?.deviceId || currentLink?.deviceId || latestLink?.deviceId || latestSnapshotEntry?.snapshot?.deviceId || ''
  );
  const uptimePercentage = typeof licenseDetails?.uptime === 'number' ? Number((licenseDetails.uptime * 100).toFixed(2)) : latestSnapshotEntry?.snapshot?.uptimePercentage ?? null;
  const minUptimePercentage = typeof licenseDetails?.leaseMinUptimePercentage === 'number'
    ? licenseDetails.leaseMinUptimePercentage
    : latestSnapshotEntry?.snapshot?.minUptimePercentage ?? null;
  const currentLinkState = getCurrentLinkStateSummary({
    licenseDetails,
    currentLink,
    latestLink,
  });

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const copyId = () => {
    navigator.clipboard.writeText(decodedId);
    toast.success('License ID copied');
  };

  const startEditing = () => {
    setEditValue(displayName);
    setEditing(true);
  };

  const saveLabel = () => {
    const success = setLabel(decodedId, editValue);

    if (success) {
      setEditing(false);
    }
  };

  if (isLoading) {
    return <LicenseDetailSkeleton />;
  }

  if (!historyRecord && !snapshotTimeline.length && !licenseDetails) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Link to="/license-history" className="p-2 rounded-xl hover:bg-white/[0.04] text-white/40">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">History Not Found</h1>
        </div>
        <p className="text-white/40">No stored history was found for this license yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-6">
        <Link to="/license-history" className="p-2 rounded-xl hover:bg-white/[0.04] text-white/40 shrink-0 mt-0.5">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveLabel();
                      if (event.key === 'Escape') setEditing(false);
                    }}
                    placeholder="e.g. Phone-01, Laptop..."
                    className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-base sm:text-lg text-white placeholder-white/30 focus:outline-none focus:border-accent/50 w-full max-w-[220px]"
                    autoFocus
                  />
                  <button onClick={saveLabel} className="text-success hover:text-success/80 p-1">
                    <Check size={18} />
                  </button>
                  <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/60 p-1">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <HoverRevealText
                    as="h1"
                    text={displayName}
                    className="text-xl sm:text-2xl font-bold text-white truncate"
                    wrapperClassName="flex-1 min-w-0"
                  />
                  <button onClick={startEditing} className="text-white/20 hover:text-white/60 shrink-0">
                    <Pencil size={14} />
                  </button>
                  <LicenseTagPicker
                    value={presetTag}
                    onChange={(tag) => setPresetTag(decodedId, tag)}
                    onRemove={() => setPresetTag(decodedId, '')}
                  />
                  <OperatorPicker
                    value={operator}
                    allOperators={allOperators}
                    onChange={(name) => setOperator(decodedId, name)}
                    onRemove={() => setOperator(decodedId, '')}
                  />
                </div>
              )}

              {(label && baseDeviceName) || (label && taggedName) ? (
                <HoverRevealText
                  as="p"
                  text={taggedName ? `Auto tag name: ${taggedName}` : `Latest device: ${baseDeviceName}`}
                  className="text-xs sm:text-sm text-white/35 mt-1 truncate"
                />
              ) : null}
              {!label && presetTag && baseDeviceName && (
                <HoverRevealText
                  as="p"
                  text={`Tag preset: ${presetTag}`}
                  className="text-xs sm:text-sm text-white/35 mt-1 truncate"
                />
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs sm:text-sm text-white/30 font-mono truncate">{truncateHex(decodedId, 8, 6)}</span>
                <button onClick={copyId} className="text-white/30 hover:text-white/60 shrink-0">
                  <Copy size={14} />
                </button>
                <LicenseStatusBadge status={currentStatus} size="sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Link Periods</p>
          <p className="text-base sm:text-xl font-bold text-white mt-0.5 sm:mt-1">{linkPeriods.length}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">remembered changes</p>
        </div>
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Snapshot Days</p>
          <p className="text-base sm:text-xl font-bold text-accent-light mt-0.5 sm:mt-1">{snapshotTimeline.length}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">stored daily states</p>
        </div>
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Last Change</p>
          <p className="text-base sm:text-xl font-bold text-white/70 mt-0.5 sm:mt-1 truncate">{formatHistoryTimestamp(lastChangeAt)}</p>
        </div>
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Tracked Since</p>
          <p className="text-base sm:text-xl font-bold text-white/70 mt-0.5 sm:mt-1 truncate">{formatDayKey(firstSnapshotDayKey)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Current Link State</p>
          <HoverRevealText
            as="p"
            text={currentLinkState.title}
            className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate"
          />
          <p className="text-[9px] sm:text-[10px] text-white/30">{currentLinkState.detail}</p>
        </div>
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Current Status</p>
          <div className="mt-2">
            <LicenseStatusBadge status={currentStatus} />
          </div>
          <p className="text-[9px] sm:text-[10px] text-white/30">
            {latestSnapshotEntry ? `Latest snapshot ${formatDayKey(latestSnapshotEntry.dayKey)}` : 'No snapshot captured yet'}
          </p>
        </div>
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Uptime</p>
          <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">{formatPercent(uptimePercentage)}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">Min. {formatPercent(minUptimePercentage)}</p>
        </div>
        <div className="glass p-3 sm:p-4">
          <p className="text-[9px] sm:text-xs text-white/40 uppercase tracking-wider">Coverage</p>
          <p className="text-base sm:text-lg font-bold text-white mt-0.5 sm:mt-1 truncate">{formatDayKey(firstSnapshotDayKey)}</p>
          <p className="text-[9px] sm:text-[10px] text-white/30">
            through {formatDayKey(latestSnapshotEntry?.dayKey || null)}
          </p>
        </div>
      </div>

      <div className="glass-subtle px-3 sm:px-4 py-2.5 sm:py-3 mb-4 sm:mb-6 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">License ID</p>
          <p className="text-xs text-white/50 font-mono truncate">{decodedId}</p>
        </div>
        <button onClick={copyId} className="text-white/30 hover:text-white/60 shrink-0 ml-3 p-1">
          <Copy size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-4">
        <div className="glass p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">Link Action Timeline</h2>
            <span className="text-xs text-white/20">{linkEvents.length} actions</span>
          </div>

          <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Current State</p>
            <p className="text-sm font-medium text-white mt-1">{currentLinkState.title}</p>
            <p className="text-[11px] text-white/40 mt-1">{currentLinkState.detail}</p>
            <p className="text-[11px] text-white/30 mt-2">
              {currentDeviceSummary !== 'No remembered device' ? `Latest known device: ${currentDeviceSummary}` : 'No device has been remembered yet.'}
            </p>
          </div>

          {linkEvents.length ? (
            <div className="space-y-3">
              {linkEvents.map((event, index) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex w-6 shrink-0 flex-col items-center">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${event.type === 'linked' ? 'bg-success shadow-[0_0_12px_rgba(34,197,94,0.35)]' : 'bg-warning shadow-[0_0_12px_rgba(245,158,11,0.28)]'}`}
                    />
                    {index < linkEvents.length - 1 ? <span className="mt-1 w-px flex-1 bg-white/[0.08]" /> : null}
                  </div>

                  <div className="glass-subtle min-w-0 flex-1 rounded-xl p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <HoverRevealText
                          as="p"
                          text={event.type === 'linked' ? `Linked to ${event.deviceLabel}` : `Unlinked from ${event.deviceLabel}`}
                          className="text-sm sm:text-base font-semibold text-white truncate"
                        />
                        <p className="text-[11px] text-white/25 mt-1 font-mono truncate">{event.deviceId || 'No device ID stored'}</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            event.type === 'linked'
                              ? 'border-success/20 bg-success/10 text-success'
                              : 'border-warning/20 bg-warning/10 text-warning'
                          }`}
                        >
                          {event.type === 'linked' ? 'Linked' : 'Unlinked'}
                        </span>
                        {event.current && event.type === 'linked' ? (
                          <span className="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-light">
                            Current Device
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-white/45">
                      {formatHistoryTimestamp(event.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-sm text-white/40">
              No remembered link or unlink actions have been stored for this license yet.
            </div>
          )}
        </div>

        <div className="glass p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">Snapshot Timeline</h2>
            <span className="text-xs text-white/20">{snapshotTimeline.length} days</span>
          </div>

          {snapshotTimeline.length ? (
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {snapshotTimeline.map((entry) => (
                <div key={entry.dayKey} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{formatDayKey(entry.dayKey)}</p>
                      <p className="text-[11px] text-white/30 mt-1">Captured {formatHistoryTimestamp(entry.capturedAt)}</p>
                    </div>
                    <LicenseStatusBadge status={entry.status} size="sm" />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-white/45">
                    <p>Device: {formatDeviceName(entry.snapshot.deviceName, entry.snapshot.deviceId)}</p>
                    <p>Uptime: {formatPercent(entry.snapshot.uptimePercentage)} · Min {formatPercent(entry.snapshot.minUptimePercentage)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-sm text-white/40">
              No daily snapshots have been stored for this license yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}