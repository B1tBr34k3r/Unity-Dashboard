export const LICENSE_TAG_PRESETS = ['Clone', 'Work', 'Secure Folder', 'Main'];
export const NUMBERED_LICENSE_TAGS = ['clone', 'work'];
export const DEFAULT_DEVICE_COMBINATIONS = [
  {
    label: "Prakhar's A30",
    aliases: ["Prakhar's A30", 'SM-A305F'],
  },
  {
    label: 'realme X',
    aliases: ['realme X', 'RMX1901'],
  },
];

const NUMBERED_LICENSE_TAG_SET = new Set(NUMBERED_LICENSE_TAGS);

export function normalizeDeviceAliasKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function applyDeviceCombination(lookup, combination, overwrite = false) {
  if (!combination || typeof combination !== 'object' || Array.isArray(combination)) {
    return;
  }

  const label = typeof combination.label === 'string' ? combination.label.trim() : '';
  const aliases = Array.isArray(combination.aliases) ? combination.aliases : [];

  if (!label) {
    return;
  }

  const aliasNames = [label, ...aliases];

  aliasNames.forEach((aliasName) => {
    const alias = typeof aliasName === 'string' ? aliasName.trim() : '';
    const aliasKey = normalizeDeviceAliasKey(alias);

    if (!alias || !aliasKey) {
      return;
    }

    if (!overwrite && lookup[aliasKey]) {
      return;
    }

    lookup[aliasKey] = label;
  });
}

const DEFAULT_DEVICE_ALIAS_LOOKUP = (() => {
  const lookup = {};

  DEFAULT_DEVICE_COMBINATIONS.forEach((combination) => {
    applyDeviceCombination(lookup, combination, true);
  });

  return lookup;
})();

export function buildDeviceAliasLookup(deviceCombinations = []) {
  if (!Array.isArray(deviceCombinations) || !deviceCombinations.length) {
    return DEFAULT_DEVICE_ALIAS_LOOKUP;
  }

  const lookup = { ...DEFAULT_DEVICE_ALIAS_LOOKUP };

  deviceCombinations.forEach((combination) => {
    applyDeviceCombination(lookup, combination, true);
  });

  return lookup;
}

export function getCanonicalDeviceName(name, deviceAliasLookup = null) {
  const trimmedName = name ? name.trim() : '';
  if (!trimmedName) return '';

  const aliasKey = normalizeDeviceAliasKey(trimmedName);

  if (deviceAliasLookup?.[aliasKey]) {
    return deviceAliasLookup[aliasKey];
  }

  return DEFAULT_DEVICE_ALIAS_LOOKUP[aliasKey] || trimmedName;
}

function normalizePresetTagBucketKey(baseName) {
  return (baseName || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getTaggedLicenseIds(presetTags, targetTag) {
  return Object.keys(presetTags || {}).filter((licenseId) => {
    const presetTag = presetTags[licenseId];
    return presetTag && presetTag.toLowerCase() === targetTag;
  });
}

function normalizeTagOrders(tagOrder) {
  if (Array.isArray(tagOrder)) {
    return { clone: tagOrder };
  }

  return tagOrder && typeof tagOrder === 'object' ? tagOrder : {};
}

export function getLicenseOriginalBackendName(license) {
  return license?.alias?.trim() || license?.deviceName?.trim() || '';
}

export function getLicenseBackendName(license, deviceAliasLookup = null) {
  return getCanonicalDeviceName(getLicenseOriginalBackendName(license), deviceAliasLookup);
}

export function buildCloneIndexMap(presetTags, getBackendName, tagOrder = []) {
  const normalizedTagOrders = normalizeTagOrders(tagOrder);

  return NUMBERED_LICENSE_TAGS.reduce((tagIndexesById, targetTag) => {
    const taggedLicenseIds = getTaggedLicenseIds(presetTags, targetTag);
    const taggedLicenseIdSet = new Set(taggedLicenseIds);
    const orderedTaggedIds = [];
    const seen = new Set();
    const targetTagOrder = Array.isArray(normalizedTagOrders[targetTag]) ? normalizedTagOrders[targetTag] : [];

    targetTagOrder.forEach((licenseId) => {
      if (!taggedLicenseIdSet.has(licenseId) || seen.has(licenseId)) {
        return;
      }

      seen.add(licenseId);
      orderedTaggedIds.push(licenseId);
    });

    const fallbackTaggedIds = taggedLicenseIds
      .filter((licenseId) => !seen.has(licenseId))
      .sort((leftId, rightId) => {
        const leftBucketKey = normalizePresetTagBucketKey(getBackendName(leftId)) || `__${targetTag}__:${leftId}`;
        const rightBucketKey = normalizePresetTagBucketKey(getBackendName(rightId)) || `__${targetTag}__:${rightId}`;
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

    [...orderedTaggedIds, ...fallbackTaggedIds].forEach((licenseId) => {
      const bucketKey = normalizePresetTagBucketKey(getBackendName(licenseId)) || `__${targetTag}__:${licenseId}`;
      const nextIndex = (countsByBucketKey.get(bucketKey) || 0) + 1;

      countsByBucketKey.set(bucketKey, nextIndex);
      tagIndexesById[licenseId] = nextIndex;
    });

    return tagIndexesById;
  }, {});
}

export function formatTaggedLicenseName(baseName, presetTag, tagIndex = null) {
  const trimmedBaseName = baseName ? baseName.trim() : '';
  const trimmedPresetTag = presetTag ? presetTag.trim() : '';
  const numberedPresetTag =
    NUMBERED_LICENSE_TAG_SET.has(trimmedPresetTag.toLowerCase()) && typeof tagIndex === 'number' && tagIndex > 0
      ? `${trimmedPresetTag} ${tagIndex}`
      : trimmedPresetTag;

  if (!trimmedPresetTag) return trimmedBaseName;
  if (!trimmedBaseName) return numberedPresetTag;

  return `${trimmedBaseName} ${numberedPresetTag}`;
}

export function getLicenseDisplayName({ customLabel, backendName, presetTag, tagIndex = null, cloneIndex = null }) {
  const trimmedLabel = customLabel ? customLabel.trim() : '';
  if (trimmedLabel) return trimmedLabel;

  return formatTaggedLicenseName(backendName, presetTag, tagIndex ?? cloneIndex);
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