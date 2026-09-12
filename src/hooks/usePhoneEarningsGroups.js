import { useMemo } from 'react';
import { useDeviceCombinations } from './useDeviceCombinations';
import { useLicenseLabels } from './useLicenseLabels';
import { useLicensePresetTags } from './useLicensePresetTags';
import {
  buildCloneIndexMap,
  getLicenseBackendName,
  getLicenseDisplayName,
} from '../utils/licenseDisplay';
import { formatDateShort, getRewardDayKey, truncateHex } from '../utils/formatters';

export function usePhoneEarningsGroups({ userId, licenseMetadata, allocations }) {
  const { deviceAliasLookup } = useDeviceCombinations(userId);
  const { getLabel } = useLicenseLabels(userId);
  const { presetTags, cloneTagOrder, workTagOrder, getPresetTag } = useLicensePresetTags(userId);

  const licenseInfoById = useMemo(
    () => Object.fromEntries((licenseMetadata || []).map((license) => [license.id, license])),
    [licenseMetadata]
  );

  const tagIndexById = useMemo(
    () => buildCloneIndexMap(presetTags, (licenseId) => getLicenseBackendName(licenseInfoById[licenseId], deviceAliasLookup), {
      clone: cloneTagOrder,
      work: workTagOrder,
    }),
    [cloneTagOrder, deviceAliasLookup, licenseInfoById, presetTags, workTagOrder]
  );

  const licenseDisplayById = useMemo(() => {
    return Object.fromEntries((licenseMetadata || []).map((license) => {
      const backendName = getLicenseBackendName(license, deviceAliasLookup);
      const presetTag = getPresetTag(license.id);
      const displayName = getLicenseDisplayName({
        customLabel: getLabel(license.id),
        backendName,
        presetTag,
        tagIndex: tagIndexById[license.id] || null,
      }) || truncateHex(license.id);

      return [license.id, {
        backendName,
        displayName,
        deviceId: license.deviceId || '',
        validationLastSuccessAt: license.validationLastSuccessAt || null,
        lastActivityAt: license.lastActivityAt || license.validationLastSuccessAt || null,
      }];
    }));
  }, [deviceAliasLookup, getLabel, getPresetTag, licenseMetadata, tagIndexById]);

  return useMemo(() => {
    const groupsByPhone = new Map();

    (allocations || []).forEach((allocation) => {
      const licenseInfo = licenseDisplayById[allocation.licenseId];
      const phoneName = licenseInfo?.backendName || 'Unknown Phone';
      const group = groupsByPhone.get(phoneName) || {
        phoneName,
        totalMicros: 0,
        entries: 0,
        latestRewardAt: null,
        latestRewardMicros: 0,
        lastActivityAt: null,
        dailyMap: new Map(),
        licenses: new Map(),
      };
      const license = group.licenses.get(allocation.licenseId) || {
        licenseId: allocation.licenseId,
        displayName: licenseInfo?.displayName || truncateHex(allocation.licenseId),
        totalMicros: 0,
        entries: 0,
        latestRewardAt: null,
        latestRewardMicros: 0,
        ...licenseInfo,
      };
      const dayKey = getRewardDayKey(allocation.completedAt);
      const currentDailyMicros = group.dailyMap.get(dayKey) || 0;

      group.totalMicros += allocation.amountMicros;
      group.entries += 1;
      group.dailyMap.set(dayKey, currentDailyMicros + allocation.amountMicros);

      if (!group.latestRewardAt || new Date(allocation.completedAt) > new Date(group.latestRewardAt)) {
        group.latestRewardAt = allocation.completedAt;
        group.latestRewardMicros = allocation.amountMicros;
      }
      if (licenseInfo?.lastActivityAt && (!group.lastActivityAt || new Date(licenseInfo.lastActivityAt) > new Date(group.lastActivityAt))) {
        group.lastActivityAt = licenseInfo.lastActivityAt;
      }

      license.totalMicros += allocation.amountMicros;
      license.entries += 1;
      if (!license.latestRewardAt || new Date(allocation.completedAt) > new Date(license.latestRewardAt)) {
        license.latestRewardAt = allocation.completedAt;
        license.latestRewardMicros = allocation.amountMicros;
      }

      group.licenses.set(allocation.licenseId, license);
      groupsByPhone.set(phoneName, group);
    });

    return Array.from(groupsByPhone.values())
      .map((group) => {
        const licenses = Array.from(group.licenses.values())
          .map((license) => ({
            ...license,
            amount: Number((license.totalMicros / 1_000_000).toFixed(4)),
          }))
          .sort((left, right) => right.totalMicros - left.totalMicros);
        const dailyData = Array.from(group.dailyMap.entries())
          .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
          .map(([dayKey, totalMicros]) => ({
            dayKey,
            label: formatDateShort(dayKey),
            amount: Number((totalMicros / 1_000_000).toFixed(2)),
          }));

        return {
          phoneName: group.phoneName,
          totalMicros: group.totalMicros,
          amount: Number((group.totalMicros / 1_000_000).toFixed(2)),
          entries: group.entries,
          licenseCount: licenses.length,
          averagePerLicense: licenses.length ? Number((group.totalMicros / licenses.length / 1_000_000).toFixed(2)) : 0,
          latestRewardAt: group.latestRewardAt,
          latestRewardMicros: group.latestRewardMicros,
          lastActivityAt: group.lastActivityAt,
          dailyData,
          contributorData: licenses.slice(0, 8).map((license) => ({
            name: license.displayName,
            amount: Number((license.totalMicros / 1_000_000).toFixed(2)),
            entries: license.entries,
          })),
          licenses,
        };
      })
      .sort((left, right) => right.totalMicros - left.totalMicros);
  }, [allocations, licenseDisplayById]);
}
