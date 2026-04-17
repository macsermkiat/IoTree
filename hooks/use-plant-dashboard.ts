'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { get, onValue, ref, set, update } from 'firebase/database';
import { auth, db } from '@/lib/firebase';

const ROOT_PATH = '/plants/plant1';
const REQUEST_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

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

async function authenticateClient() {
  if (auth.currentUser) return;

  const email = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMAIL;
  const password = process.env.NEXT_PUBLIC_FIREBASE_AUTH_PASSWORD;

  if (email && password) {
    await withTimeout(signInWithEmailAndPassword(auth, email, password), 'Firebase email sign-in');
    return;
  }

  await withTimeout(signInAnonymously(auth), 'Firebase anonymous sign-in');
}


async function ensureAuthenticated() {
  if (!auth.currentUser) {
    await authenticateClient();
  }
}

export function usePlantDashboard() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    let mounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!mounted) return;
      setAuthUser(user);
    });

    authenticateClient().catch((authError) => {
      if (!mounted) return;
      setLoading(false);
      setError(
        `Firebase auth failed: ${
          authError instanceof Error ? authError.message : 'Unknown authentication error.'
        }`
      );
    });

    return () => {
      mounted = false;
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;

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
        () => {
          setLoading(false);
          setError('Failed to read soil moisture value from Firebase. Check database rules and auth.');
        }
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
          setState((prev) => ({ ...prev, led: String(snapshot.val()).trim().toUpperCase() === 'ON' }));
          markUpdated();
        },
        () => setError('Failed to read LED status from Firebase.')
      ),
      onValue(
        refs.motor,
        (snapshot) => {
          setState((prev) => ({ ...prev, motor: String(snapshot.val()).trim().toUpperCase() === 'ON' }));
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
  }, [authUser]);

  const writeThreshold = useCallback(async (threshold: number) => {
    await ensureAuthenticated();
    const safeValue = Math.max(0, Math.min(100, Math.round(threshold)));
    await withTimeout(set(ref(db, `${ROOT_PATH}/control/value`), safeValue), 'Write control/value');
  }, []);

  const writeLed = useCallback(async (enabled: boolean) => {
    await ensureAuthenticated();
    await withTimeout(set(ref(db, `${ROOT_PATH}/control/LED`), enabled ? 'ON' : 'OFF'), 'Write control/LED');
  }, []);

  const writeMotor = useCallback(async (enabled: boolean) => {
    await ensureAuthenticated();
    await withTimeout(
      set(ref(db, `${ROOT_PATH}/control/motor`), enabled ? 'ON' : 'OFF'),
      'Write control/motor'
    );
  }, []);

  const writeSmartHomeMask = useCallback(async (mask: number) => {
    await ensureAuthenticated();
    await withTimeout(
      set(ref(db, `${ROOT_PATH}/control/SMhome`), Math.max(0, Math.floor(mask))),
      'Write control/SMhome'
    );
  }, []);


  const initializeDefaults = useCallback(async () => {
    await ensureAuthenticated();

    const controlRef = ref(db, `${ROOT_PATH}/control`);
    const sensorsRef = ref(db, `${ROOT_PATH}/sensors`);

    const [controlSnapshot, sensorSnapshot] = await Promise.all([
      withTimeout(get(controlRef), 'Read /control'),
      withTimeout(get(sensorsRef), 'Read /sensors'),
    ]);

    const control = (controlSnapshot.val() ?? {}) as Record<string, unknown>;
    const sensors = (sensorSnapshot.val() ?? {}) as Record<string, unknown>;

    const controlPatch: Record<string, unknown> = {};
    if (control.value === undefined || control.value === null) controlPatch.value = 40;
    if (typeof control.LED !== 'string') controlPatch.LED = 'OFF';
    if (typeof control.motor !== 'string') controlPatch.motor = 'OFF';
    if (typeof control.SMhome !== 'number') controlPatch.SMhome = 0;

    if (Object.keys(controlPatch).length) {
      await withTimeout(update(controlRef, controlPatch), 'Update /control defaults');
    }

    if (sensors.soilMoisture === undefined || sensors.soilMoisture === null) {
      await withTimeout(update(sensorsRef, { soilMoisture: 0 }), 'Update /sensors defaults');
    }
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
    isAuthenticated: Boolean(authUser),
    smartChannels,
    writeThreshold,
    writeLed,
    writeMotor,
    toggleSmartChannel,
    initializeDefaults,
  };
}
