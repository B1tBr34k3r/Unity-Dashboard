export const LICENSE_TAG_PRESETS = ['Clone', 'Work', 'Secure Folder', 'Main'];

const DEVICE_NAME_CANONICAL_MAP = {
  prakharsa30: "Prakhar's A30",
  sma305f: "Prakhar's A30",
};

function normalizeDeviceAliasKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getCanonicalDeviceName(name) {
  const trimmedName = name ? name.trim() : '';
  if (!trimmedName) return '';

  return DEVICE_NAME_CANONICAL_MAP[normalizeDeviceAliasKey(trimmedName)] || trimmedName;
}

function normalizeCloneBucketKey(baseName) {
  return (baseName || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getLicenseOriginalBackendName(license) {
  return license?.alias?.trim() || license?.deviceName?.trim() || '';
}

export function getLicenseBackendName(license) {
  return getCanonicalDeviceName(getLicenseOriginalBackendName(license));
}

export function buildCloneIndexMap(presetTags, getBackendName, cloneTagOrder = []) {
  const cloneLicenseIds = Object.keys(presetTags || {}).filter((licenseId) => {
    const presetTag = presetTags[licenseId];
    return presetTag && presetTag.toLowerCase() === 'clone';
  });
  const cloneLicenseIdSet = new Set(cloneLicenseIds);
  const orderedCloneIds = [];
  const seen = new Set();

  cloneTagOrder.forEach((licenseId) => {
    if (!cloneLicenseIdSet.has(licenseId) || seen.has(licenseId)) {
      return;
    }

    seen.add(licenseId);
    orderedCloneIds.push(licenseId);
  });

  const fallbackCloneIds = cloneLicenseIds
    .filter((licenseId) => !seen.has(licenseId))
    .sort((leftId, rightId) => {
      const leftBucketKey = normalizeCloneBucketKey(getBackendName(leftId)) || `__clone__:${leftId}`;
      const rightBucketKey = normalizeCloneBucketKey(getBackendName(rightId)) || `__clone__:${rightId}`;
      const bucketComparison = leftBucketKey.localeCompare(rightBucketKey, undefined, {
        sensitivity: 'base',
        numeric: true,
      });

      if (bucketComparison !== 0) {
        return bucketComparison;
      }

      return leftId.localeCompare(rightId, undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    });

  const countsByBucketKey = new Map();

  return [...orderedCloneIds, ...fallbackCloneIds].reduce((cloneIndexesById, licenseId) => {
    const bucketKey = normalizeCloneBucketKey(getBackendName(licenseId)) || `__clone__:${licenseId}`;
    const nextIndex = (countsByBucketKey.get(bucketKey) || 0) + 1;

    countsByBucketKey.set(bucketKey, nextIndex);
    cloneIndexesById[licenseId] = nextIndex;
    return cloneIndexesById;
  }, {});
}

export function formatTaggedLicenseName(baseName, presetTag, cloneIndex = null) {
  const trimmedBaseName = baseName ? baseName.trim() : '';
  const trimmedPresetTag = presetTag ? presetTag.trim() : '';
  const numberedPresetTag =
    trimmedPresetTag.toLowerCase() === 'clone' && typeof cloneIndex === 'number' && cloneIndex > 0
      ? `${trimmedPresetTag} ${cloneIndex}`
      : trimmedPresetTag;

  if (!trimmedPresetTag) return trimmedBaseName;
  if (!trimmedBaseName) return numberedPresetTag;

  return `${trimmedBaseName} ${numberedPresetTag}`;
}

export function getLicenseDisplayName({ customLabel, backendName, presetTag, cloneIndex }) {
  const trimmedLabel = customLabel ? customLabel.trim() : '';
  if (trimmedLabel) return trimmedLabel;

  return formatTaggedLicenseName(backendName, presetTag, cloneIndex);
}

export function getLicenseDistribution(leaseSharePercentage) {
  if (typeof leaseSharePercentage !== 'number' || Number.isNaN(leaseSharePercentage)) {
    return { ulo: null, uno: null };
  }

  const uno = Math.max(0, Math.min(100, Number(leaseSharePercentage.toFixed(2))));
  const ulo = Math.max(0, Math.min(100, Number((100 - uno).toFixed(2))));

  return { ulo, uno };
}

export function formatLicenseDistribution(leaseSharePercentage) {
  const { ulo, uno } = getLicenseDistribution(leaseSharePercentage);
  if (ulo === null || uno === null) return '—';

  return `ULO ${ulo}% · UNO ${uno}%`;
}

export function formatLeaseTimeLeft(leaseTo, now = Date.now()) {
  if (!leaseTo) return '—';

  const endTime = new Date(leaseTo).getTime();
  if (Number.isNaN(endTime)) return '—';

  const remainingMs = endTime - now;
  if (remainingMs <= 0) return 'Expired';

  const totalDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    return months > 0 ? `${years}y ${months}mo left` : `${years}y left`;
  }

  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    return days > 0 ? `${months}mo ${days}d left` : `${months}mo left`;
  }

  return `${totalDays}d left`;
}