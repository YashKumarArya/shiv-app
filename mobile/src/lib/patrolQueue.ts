import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { api } from '@/api/client';

const QUEUE_KEY = 'patrol_queue_v1';

/**
 * Operations a guard performs during a round, recorded locally first and sent
 * when there is signal.
 *
 * Order is significant and the queue is strictly sequential: a scan references
 * its session by client_uuid, so the session must reach the server first. One
 * failed item therefore blocks the ones behind it rather than being skipped.
 */
export type PatrolOperation =
  | {
      kind: 'start';
      id: string;
      sessionClientUuid: string;
      routeId: number;
      scheduleId: number | null;
      startedAt: string;
    }
  | {
      kind: 'scan';
      id: string;
      sessionClientUuid: string;
      qrPayload: string;
      scannedAt: string;
      /** Local file URI until it is uploaded; replaced by the server path on sync. */
      photoUri: string;
      latitude: number | null;
      longitude: number | null;
      checkpointId: number;
      checkpointName: string;
    }
  | { kind: 'complete'; id: string; sessionClientUuid: string };

export interface QueueState {
  pending: PatrolOperation[];
  /** Set when the head of the queue was rejected permanently and needs the guard. */
  blockedReason?: string;
}

type Listener = (state: QueueState) => void;

let cache: QueueState | null = null;
const listeners = new Set<Listener>();

const emit = (state: QueueState) => {
  cache = state;
  listeners.forEach((listener) => listener(state));
};

const read = async (): Promise<QueueState> => {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    cache = raw ? (JSON.parse(raw) as QueueState) : { pending: [] };
  } catch {
    // A corrupt queue must not brick the patrol screen on launch.
    cache = { pending: [] };
  }
  return cache;
};

const write = async (state: QueueState) => {
  emit(state);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(state)).catch(() => undefined);
};

export const subscribeToQueue = (listener: Listener) => {
  listeners.add(listener);
  void read().then(listener);
  return () => listeners.delete(listener);
};

export const getQueue = read;

export const enqueue = async (operation: PatrolOperation) => {
  const state = await read();
  await write({ ...state, pending: [...state.pending, operation] });
};

/** Clears a block after the guard has been told what went wrong. */
export const dismissBlock = async () => {
  const state = await read();
  if (!state.blockedReason) return;
  await write({ pending: state.pending.slice(1) });
};

const uploadPhoto = async (uri: string) => {
  const form = new FormData();
  form.append('file', {
    uri,
    // The server re-decodes and re-encodes whatever arrives, so a generic
    // filename and type here is safe; it never trusts either value.
    name: 'checkpoint.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  const { data } = await api.post('/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60_000,
  });
  return data.path as string;
};

const send = async (operation: PatrolOperation) => {
  if (operation.kind === 'start') {
    await api.post('/patrols/my/sessions', {
      client_uuid: operation.sessionClientUuid,
      route_id: operation.routeId,
      schedule_id: operation.scheduleId,
      started_at: operation.startedAt,
    });
    return;
  }

  if (operation.kind === 'complete') {
    await api.post(`/patrols/my/sessions/${operation.sessionClientUuid}/complete`);
    return;
  }

  await api.post('/patrols/my/scans', {
    session_client_uuid: operation.sessionClientUuid,
    qr_payload: operation.qrPayload,
    // The guard's clock at the checkpoint. This is what decides whether the
    // round was walked on time, so it is sent unchanged however late it syncs.
    scanned_at: operation.scannedAt,
    photo: operation.photoUri,
    latitude: operation.latitude,
    longitude: operation.longitude,
  });
};

/** True once the photo has been uploaded and photoUri holds the stored path. */
const isUploaded = (operation: PatrolOperation) =>
  operation.kind !== 'scan' || operation.photoUri.startsWith('/uploads/');

let draining = false;

/**
 * Sends everything queued, oldest first.
 *
 * A network failure stops the drain and leaves the queue intact for the next
 * attempt. A 4xx is different: the server has made a final decision, retrying
 * forever would wedge the queue, so the item is held at the head with a reason
 * for the guard to see and dismiss.
 */
export const drainQueue = async (): Promise<QueueState> => {
  if (draining) return read();
  draining = true;
  try {
    let state = await read();
    if (state.blockedReason) return state;

    while (state.pending.length) {
      let [next] = state.pending;
      const rest = state.pending.slice(1);
      try {
        if (!isUploaded(next)) {
          // Record the stored path before posting the scan. Without this a
          // failure between the two steps re-uploads the same photo on every
          // retry, leaving an orphaned file on the server each time.
          const photoUri = await uploadPhoto((next as Extract<PatrolOperation, { kind: 'scan' }>).photoUri);
          next = { ...next, photoUri } as PatrolOperation;
          state = { ...state, pending: [next, ...rest] };
          await write(state);
        }
        await send(next);
        state = { pending: rest };
        await write(state);
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          const reason = (axios.isAxiosError(error)
            && (error.response?.data as { error?: string })?.error)
            || 'This checkpoint could not be recorded.';
          state = { ...state, blockedReason: reason };
          await write(state);
        }
        // Offline, timeout, or a server error: keep the queue and try later.
        return state;
      }
    }
    return state;
  } finally {
    draining = false;
  }
};

export const pendingScanCount = (state: QueueState) =>
  state.pending.filter((operation) => operation.kind === 'scan').length;

/** Checkpoints scanned on this device but not yet confirmed by the server. */
export const locallyScannedCheckpointIds = (state: QueueState, sessionClientUuid: string) =>
  state.pending
    .filter(
      (operation): operation is Extract<PatrolOperation, { kind: 'scan' }> =>
        operation.kind === 'scan' && operation.sessionClientUuid === sessionClientUuid,
    )
    .map((operation) => operation.checkpointId);

// ============================================================
// Rounds started on this device
// ============================================================

const SESSIONS_KEY = 'patrol_local_sessions_v1';

/**
 * A round begun with no signal has no server id yet, but the guard may still
 * background the app, lose battery, or walk out of range mid-round. Remembering
 * the generated client_uuid locally is what lets them resume the same round
 * instead of starting a duplicate that the server would later reject.
 */
type LocalSessions = Record<string, string>;

export const localSessionKey = (routeId: number, scheduleId: number | null, patrolDate: string) =>
  `${routeId}:${scheduleId ?? 'adhoc'}:${patrolDate}`;

const readLocalSessions = async (): Promise<LocalSessions> => {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as LocalSessions) : {};
  } catch {
    return {};
  }
};

export const rememberLocalSession = async (key: string, clientUuid: string) => {
  const sessions = await readLocalSessions();
  if (sessions[key] === clientUuid) return;
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify({ ...sessions, [key]: clientUuid }))
    .catch(() => undefined);
};

export const getLocalSessions = readLocalSessions;

/** Drops entries for days gone by, so the store cannot grow without bound. */
export const pruneLocalSessions = async (keepFromDate: string) => {
  const sessions = await readLocalSessions();
  const kept = Object.fromEntries(
    Object.entries(sessions).filter(([key]) => (key.split(':')[2] ?? '') >= keepFromDate),
  );
  if (Object.keys(kept).length === Object.keys(sessions).length) return;
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(kept)).catch(() => undefined);
};
