'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { db } from '@/lib/firebase';

const ROOT_PATH = '/plants/plant1';

function parseSoilMoistureValue(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (raw && typeof raw === 'object' && 'value' in raw) {
    const parsed = Number((raw as { value: unknown }).value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

interface DashboardState {
  soilMoisture: number;
  threshold: number;
  led: boolean;
  motor: boolean;
  smhomeMask: number;
}

const initialState: DashboardState = {
  soilMoisture: 0,
  threshold: 40,
  led: false,
  motor: false,
  smhomeMask: 0,
};

export function usePlantDashboard() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const refs = {
      soilMoisture: ref(db, `${ROOT_PATH}/sensors/soilMoisture`),
      threshold: ref(db, `${ROOT_PATH}/control/value`),
      led: ref(db, `${ROOT_PATH}/control/LED`),
      motor: ref(db, `${ROOT_PATH}/control/motor`),
      smhomeMask: ref(db, `${ROOT_PATH}/control/SMhome`),
    };

    const markUpdated = () => {
      setLastUpdated(new Date());
      setLoading(false);
      setError(null);
    };

    const unsubscribers = [
      onValue(
        refs.soilMoisture,
        (snapshot) => {
          const value = parseSoilMoistureValue(snapshot.val());
          setState((prev) => ({ ...prev, soilMoisture: Number.isNaN(value) ? 0 : value }));
          markUpdated();
        },
        () => setError('Failed to read soil moisture value from Firebase.')
      ),
      onValue(
        refs.threshold,
        (snapshot) => {
          const value = Number(snapshot.val() ?? 0);
          setState((prev) => ({ ...prev, threshold: Number.isNaN(value) ? 0 : value }));
          markUpdated();
        },
        () => setError('Failed to read control threshold from Firebase.')
      ),
      onValue(
        refs.led,
        (snapshot) => {
          setState((prev) => ({ ...prev, led: String(snapshot.val()).toUpperCase() === 'ON' }));
          markUpdated();
        },
        () => setError('Failed to read LED status from Firebase.')
      ),
      onValue(
        refs.motor,
        (snapshot) => {
          setState((prev) => ({ ...prev, motor: String(snapshot.val()).toUpperCase() === 'ON' }));
          markUpdated();
        },
        () => setError('Failed to read motor status from Firebase.')
      ),
      onValue(
        refs.smhomeMask,
        (snapshot) => {
          const value = Number(snapshot.val() ?? 0);
          setState((prev) => ({ ...prev, smhomeMask: Number.isNaN(value) ? 0 : value }));
          markUpdated();
        },
        () => setError('Failed to read SmartHome channels from Firebase.')
      ),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const writeThreshold = useCallback(async (threshold: number) => {
    const safeValue = Math.max(0, Math.min(100, Math.round(threshold)));
    await set(ref(db, `${ROOT_PATH}/control/value`), safeValue);
  }, []);

  const writeLed = useCallback(async (enabled: boolean) => {
    await set(ref(db, `${ROOT_PATH}/control/LED`), enabled ? 'ON' : 'OFF');
  }, []);

  const writeMotor = useCallback(async (enabled: boolean) => {
    await set(ref(db, `${ROOT_PATH}/control/motor`), enabled ? 'ON' : 'OFF');
  }, []);

  const writeSmartHomeMask = useCallback(async (mask: number) => {
    await set(ref(db, `${ROOT_PATH}/control/SMhome`), Math.max(0, Math.floor(mask)));
  }, []);

  const smartChannels = useMemo(
    () => Array.from({ length: 6 }, (_, index) => Boolean(state.smhomeMask & (1 << index))),
    [state.smhomeMask]
  );

  const toggleSmartChannel = useCallback(
    async (index: number) => {
      const nextMask = state.smhomeMask ^ (1 << index);
      await writeSmartHomeMask(nextMask);
    },
    [state.smhomeMask, writeSmartHomeMask]
  );

  return {
    ...state,
    loading,
    error,
    lastUpdated,
    smartChannels,
    writeThreshold,
    writeLed,
    writeMotor,
    toggleSmartChannel,
  };
}
