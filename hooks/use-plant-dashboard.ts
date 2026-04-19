'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Auth,
  User,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Database, get, onValue, ref, set, update } from 'firebase/database';

import { getFirebaseServices } from '@/lib/firebase';

const REQUEST_TIMEOUT_MS = 10000;
const ROOT_PATH = '/plants/plant';

interface PathConfig {
  soilPath: string;
  controlRoot: string;
}

const DEFAULT_PATHS: PathConfig = {
  soilPath: `${ROOT_PATH}/sensors/soilMoisture`,
  controlRoot: `${ROOT_PATH}/control`,
};

const CANDIDATE_SOIL_PATHS = [
  '/plants/plant/sensors/soilMoisture',
  '/plants/plant/Sensor/soilMoisture',
  '/plants/plant/Sensor',
  '/plants/plant1/sensors/soilMoisture',
  '/plants/plant1/Sensor/soilMoisture',
  '/plants/plant1/Sensor',
  '/Plant1/Sensor/soilMoisture',
  '/Plant1/Sensor',
  '/Plant1/sensors/soilMoisture',
  '/plant1/sensors/soilMoisture',
  '/plant1/Sensor/soilMoisture',
  '/plant1/Sensor',
];

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

interface MoistureSample {
  timestamp: number;
  value: number;
}

const HISTORY_STORAGE_KEY = 'iotree-soil-history-v1';
const HISTORY_RETENTION_MS = 48 * 60 * 60 * 1000;

function sanitizeHistory(history: MoistureSample[]): MoistureSample[] {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  return history
    .filter((item) => Number.isFinite(item.timestamp) && Number.isFinite(item.value) && item.timestamp >= cutoff)
    .slice(-4000);
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

async function authenticateClient(auth: Auth) {
  if (auth.currentUser) return;

  const email = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMAIL;
  const password = process.env.NEXT_PUBLIC_FIREBASE_AUTH_PASSWORD;

  if (email && password) {
    await withTimeout(signInWithEmailAndPassword(auth, email, password), 'Firebase email sign-in');
    return;
  }

  await withTimeout(signInAnonymously(auth), 'Firebase anonymous sign-in');
}

async function ensureAuthenticated(auth: Auth) {
  if (!auth.currentUser) {
    await authenticateClient(auth);
  }
}

async function detectPaths(db: Database): Promise<PathConfig> {
  for (const soilPath of CANDIDATE_SOIL_PATHS) {
    const soilSnapshot = await withTimeout(get(ref(db, soilPath)), `Read ${soilPath}`);
    if (soilSnapshot.exists()) {
      const basePath = soilPath.replace(/\/(sensors|Sensor)(\/soilMoisture)?$/, '');
      const lowerControl = `${basePath}/control`;
      const upperControl = `${basePath}/Control`;

      const [lowerSnap, upperSnap] = await Promise.all([
        withTimeout(get(ref(db, lowerControl)), `Read ${lowerControl}`),
        withTimeout(get(ref(db, upperControl)), `Read ${upperControl}`),
      ]);

      if (lowerSnap.exists()) return { soilPath, controlRoot: lowerControl };
      if (upperSnap.exists()) return { soilPath, controlRoot: upperControl };

      // If no control node exists yet, follow casing style of the sensor node.
      if (soilPath.includes('/Sensor')) return { soilPath, controlRoot: upperControl };
      return { soilPath, controlRoot: lowerControl };
    }
  }

  return DEFAULT_PATHS;
}

export function usePlantDashboard() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [paths, setPaths] = useState<PathConfig>(DEFAULT_PATHS);
  const [soilHistory, setSoilHistory] = useState<MoistureSample[]>([]);

  useEffect(() => {
    try {
      const { auth, db } = getFirebaseServices();
      setAuth(auth);
      setDb(db);
    } catch (serviceError) {
      setLoading(false);
      setError(serviceError instanceof Error ? serviceError.message : 'Failed to initialize Firebase services.');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const cached = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached) as MoistureSample[];
      setSoilHistory(sanitizeHistory(parsed));
    } catch {
      setSoilHistory([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sanitizeHistory(soilHistory)));
  }, [soilHistory]);

  useEffect(() => {
    if (!auth) return;

    let mounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!mounted) return;
      setAuthUser(user);
    });

    authenticateClient(auth).catch((authError) => {
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
  }, [auth]);

  useEffect(() => {
    if (!authUser || !db) return;

    let active = true;

    detectPaths(db)
      .then((detected) => {
        if (!active) return;
        setPaths(detected);
      })
      .catch(() => {
        if (!active) return;
        setPaths(DEFAULT_PATHS);
      });

    return () => {
      active = false;
    };
  }, [authUser, db]);

  useEffect(() => {
    if (!authUser || !db) return;

    const control = (name: string) => `${paths.controlRoot}/${name}`;

    const refs = {
      soilMoisture: ref(db, paths.soilPath),
      threshold: ref(db, control('value')),
      led: ref(db, control('LED')),
      motor: ref(db, control('motor')),
      smhomeMask: ref(db, control('SMhome')),
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
          const safeValue = Number.isNaN(value) ? 0 : value;
          setState((prev) => ({ ...prev, soilMoisture: safeValue }));
          setSoilHistory((prev) =>
            sanitizeHistory([
              ...prev,
              {
                timestamp: Date.now(),
                value: safeValue,
              },
            ])
          );
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
  }, [authUser, db, paths]);

  const writeThreshold = useCallback(
    async (threshold: number) => {
      if (!auth || !db) throw new Error('Firebase is not initialized yet.');
      await ensureAuthenticated(auth);
      const safeValue = Math.max(0, Math.min(100, Math.round(threshold)));
      await withTimeout(set(ref(db, `${paths.controlRoot}/value`), safeValue), 'Write control/value');
    },
    [auth, db, paths]
  );

  const writeLed = useCallback(
    async (enabled: boolean) => {
      if (!auth || !db) throw new Error('Firebase is not initialized yet.');
      await ensureAuthenticated(auth);
      await withTimeout(set(ref(db, `${paths.controlRoot}/LED`), enabled ? 'ON' : 'OFF'), 'Write control/LED');
    },
    [auth, db, paths]
  );

  const writeMotor = useCallback(
    async (enabled: boolean) => {
      if (!auth || !db) throw new Error('Firebase is not initialized yet.');
      await ensureAuthenticated(auth);
      await withTimeout(
        set(ref(db, `${paths.controlRoot}/motor`), enabled ? 'ON' : 'OFF'),
        'Write control/motor'
      );
    },
    [auth, db, paths]
  );

  const writeSmartHomeMask = useCallback(
    async (mask: number) => {
      if (!auth || !db) throw new Error('Firebase is not initialized yet.');
      await ensureAuthenticated(auth);
      await withTimeout(
        set(ref(db, `${paths.controlRoot}/SMhome`), Math.max(0, Math.floor(mask))),
        'Write control/SMhome'
      );
    },
    [auth, db, paths]
  );

  const initializeDefaults = useCallback(async () => {
    if (!auth || !db) throw new Error('Firebase is not initialized yet.');

    await ensureAuthenticated(auth);

    const controlRef = ref(db, paths.controlRoot);

    const controlSnapshot = await withTimeout(get(controlRef), `Read ${paths.controlRoot}`);
    const control = (controlSnapshot.val() ?? {}) as Record<string, unknown>;

    const controlPatch: Record<string, unknown> = {};
    if (control.value === undefined || control.value === null) controlPatch.value = 40;
    if (typeof control.LED !== 'string') controlPatch.LED = 'OFF';
    if (typeof control.motor !== 'string') controlPatch.motor = 'OFF';
    if (typeof control.SMhome !== 'number') controlPatch.SMhome = 0;

    if (Object.keys(controlPatch).length) {
      await withTimeout(update(controlRef, controlPatch), `Update ${paths.controlRoot} defaults`);
    }

    const soilRef = ref(db, paths.soilPath);
    const soilSnap = await withTimeout(get(soilRef), `Read ${paths.soilPath}`);
    if (!soilSnap.exists()) {
      await withTimeout(set(soilRef, 0), `Create ${paths.soilPath}`);
    }
  }, [auth, db, paths]);

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
    detectedSoilPath: paths.soilPath,
    detectedControlRoot: paths.controlRoot,
    soilHistory,
    smartChannels,
    writeThreshold,
    writeLed,
    writeMotor,
    toggleSmartChannel,
    initializeDefaults,
  };
}
