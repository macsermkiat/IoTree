'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DashboardCard } from '@/components/dashboard-card';
import { ErrorPanel, LoadingPanel } from '@/components/state-panels';
import { ProgressBar } from '@/components/progress-bar';
import { StatusBadge } from '@/components/status-badge';
import { ToggleSwitch } from '@/components/toggle-switch';
import { usePlantDashboard } from '@/hooks/use-plant-dashboard';

export default function HomePage() {
  const {
    soilMoisture,
    threshold,
    led,
    motor,
    loading,
    error,
    lastUpdated,
    smartChannels,
    isAuthenticated,
    detectedSoilPath,
    detectedControlRoot,
    writeThreshold,
    writeLed,
    writeMotor,
    toggleSmartChannel,
    initializeDefaults,
  } = usePlantDashboard();

  const [thresholdInput, setThresholdInput] = useState(threshold);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [actionLabel, setActionLabel] = useState<string | null>(null);

  const humidityLabel = useMemo(() => `${Math.max(0, Math.min(100, soilMoisture)).toFixed(0)}%`, [soilMoisture]);

  useEffect(() => {
    setThresholdInput(threshold);
  }, [threshold]);

  const runAction = async (label: string, action: () => Promise<void>, fallbackError: string) => {
    setActionError(null);
    setActionLabel(label);
    setIsMutating(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof Error) {
        setActionError(error.message);
      } else {
        setActionError(fallbackError);
      }
    } finally {
      setIsMutating(false);
      setActionLabel(null);
    }
  };

  const handleThresholdSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAction(
      'Saving threshold...',
      () => writeThreshold(thresholdInput),
      'Could not update moisture threshold. Check Firebase permissions.'
    );
  };

  const handleToggle = (runner: (value: boolean) => Promise<void>, value: boolean, label: string) => {
    void runAction(`Updating ${label}...`, () => runner(value), `Could not update ${label}.`);
  };

  const handleSmartChannel = (index: number) => {
    void runAction(
      `Updating SmartHome channel ${index + 1}...`,
      () => toggleSmartChannel(index),
      `Could not update SmartHome channel ${index + 1}.`
    );
  };

  const handleInitialize = () => {
    void runAction(
      'Initializing Firebase paths...',
      () => initializeDefaults(),
      'Could not initialize Firebase defaults.'
    );
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <p className="text-sm font-medium uppercase tracking-wider text-brand-700">ESP8266 Smart Plant System</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Plant Watering Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          Last updated:{' '}
          {lastUpdated ? lastUpdated.toLocaleString() : 'Waiting for first Firebase payload...'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Firebase session: {isAuthenticated ? 'authenticated' : 'not authenticated yet'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCard title="Soil Moisture" subtitle="Live sensor value">
          {loading ? (
            <LoadingPanel message="Connecting to sensor stream..." />
          ) : (
            <>
              <p className="text-4xl font-bold text-brand-700">{humidityLabel}</p>
              <ProgressBar value={soilMoisture} />
            </>
          )}
        </DashboardCard>

        <DashboardCard title="Moisture Control" subtitle="Threshold at /control/value" action={<StatusBadge active={threshold > 0} activeLabel="ACTIVE" inactiveLabel="IDLE" />}>
          <form className="space-y-3" onSubmit={handleThresholdSubmit}>
            <label className="text-sm font-medium text-slate-600" htmlFor="threshold">
              Threshold %
            </label>
            <input
              id="threshold"
              type="number"
              min={0}
              max={100}
              value={thresholdInput}
              onChange={(event) => setThresholdInput(Number(event.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 transition focus:ring"
            />
            <p className="text-xs text-slate-500">Current threshold in DB: {threshold}%</p>
            <button
              type="submit"
              disabled={isMutating}
              className="w-full rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isMutating ? actionLabel ?? 'Working...' : 'Save Threshold'}
            </button>
          </form>
        </DashboardCard>

        <DashboardCard title="Water Pump" subtitle="Realtime motor control" action={<StatusBadge active={motor} />}>
          <ToggleSwitch
            label="Pump Power"
            checked={motor}
            onChange={(nextValue) => handleToggle(writeMotor, nextValue, 'water pump')}
            disabled={isMutating || loading}
          />
        </DashboardCard>

        <DashboardCard title="LED Grow Light" subtitle="Realtime LED control" action={<StatusBadge active={led} />}>
          <ToggleSwitch
            label="Grow Light"
            checked={led}
            onChange={(nextValue) => handleToggle(writeLed, nextValue, 'LED grow light')}
            disabled={isMutating || loading}
          />
        </DashboardCard>

        <DashboardCard title="SmartHome Channels" subtitle="6-channel bitmask writer to /control/SMhome" action={<span className="text-xs text-slate-500">Mask: {smartChannels.reduce((acc, enabled, idx) => (enabled ? acc + (1 << idx) : acc), 0)}</span>}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {smartChannels.map((enabled, index) => (
              <ToggleSwitch
                key={index}
                label={`Channel ${index + 1}`}
                checked={enabled}
                onChange={() => handleSmartChannel(index)}
                disabled={isMutating || loading}
              />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Connection / Debug" subtitle="Quick checks if dashboard seems empty">
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Auth: <span className="font-semibold">{isAuthenticated ? 'Connected' : 'Not connected'}</span>
            </p>
            <p>
              Soil Moisture (raw): <span className="font-semibold">{soilMoisture}</span>
            </p>
            <p>
              LED command (raw): <span className="font-semibold">{led ? 'ON' : 'OFF'}</span>
            </p>
            <p>
              Motor command (raw): <span className="font-semibold">{motor ? 'ON' : 'OFF'}</span>
            </p>
            <p>
              Soil path: <span className="font-semibold break-all">{detectedSoilPath}</span>
            </p>
            <p>
              Control path: <span className="font-semibold break-all">{detectedControlRoot}</span>
            </p>
            <button
              type="button"
              onClick={handleInitialize}
              disabled={isMutating}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isMutating ? actionLabel ?? 'Working...' : 'Initialize Firebase Paths'}
            </button>
            <p className="text-xs text-slate-500">
              If this is your first run, click initialize once, then toggle LED/Pump and confirm values
              change in Firebase console.
            </p>
          </div>
        </DashboardCard>
      </div>

      <section className="mt-4 space-y-3">
        {error ? <ErrorPanel message={error} /> : null}
        {actionError ? <ErrorPanel message={actionError} /> : null}
      </section>
    </main>
  );
}
