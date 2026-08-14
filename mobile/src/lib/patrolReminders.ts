import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PatrolToday } from '@/api/types';

/**
 * Marks the alarms this app owns, so a resync can clear its own reminders
 * without touching a notification scheduled by anything else.
 */
const PATROL_REMINDER = 'patrol-round';

const ANDROID_CHANNEL_ID = 'patrol-reminders';

let configured = false;

const configure = async () => {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      // A patrol reminder at 3am has to wake a guard who is not looking at the
      // phone; a silent banner would be pointless.
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Patrol reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
};

/**
 * Rewrites the device's patrol alarms to match the schedule the office has set.
 *
 * These are local, repeating, on-device alarms rather than server push: they
 * need no FCM credentials and, more importantly, they still fire at a site with
 * no mobile signal, which is exactly where the rounds that matter are walked.
 * The trade is that a schedule change only reaches the device the next time the
 * app syncs — so this runs on every successful patrol fetch.
 */
/**
 * What the currently scheduled alarms were built from. Patrol data refetches
 * often — on focus, on reconnect, after every queue drain — and rebuilding the
 * alarms each time means repeatedly cancelling and re-adding identical ones,
 * with a window where a reminder is not scheduled at all.
 */
let syncedSignature: string | null = null;
let inFlight: Promise<void> | null = null;

const signatureOf = (patrol: PatrolToday) =>
  JSON.stringify(
    (patrol.reminders ?? [])
      .map((reminder) => [reminder.schedule_id, reminder.start_time, [...reminder.days_of_week].sort()])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );

export const syncPatrolReminders = async (patrol: PatrolToday) => {
  const signature = signatureOf(patrol);
  if (signature === syncedSignature) return;
  // Two refetches landing together would otherwise interleave cancel and
  // schedule calls and leave a half-built set of alarms.
  if (inFlight) await inFlight.catch(() => undefined);
  if (signature === syncedSignature) return;

  inFlight = applyReminders(patrol, signature);
  await inFlight;
  inFlight = null;
};

const applyReminders = async (patrol: PatrolToday, signature: string) => {
  try {
    await configure();

    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) {
      const request = await Notifications.requestPermissionsAsync();
      if (!request.granted) return;
    }

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((notification) => notification.content.data?.type === PATROL_REMINDER)
        .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
    );

    const channel = Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {};

    await Promise.all(
      (patrol.reminders ?? []).flatMap((reminder) => {
        const [hour, minute] = reminder.start_time.split(':').map(Number);
        const content = {
          title: 'Patrol round due',
          body: `${reminder.route_name} at ${reminder.start_time}. Scan every checkpoint.`,
          data: { type: PATROL_REMINDER, routeId: reminder.route_id, scheduleId: reminder.schedule_id },
        };

        // A round that runs every day needs one repeating alarm; anything else
        // gets one per weekday so a guard is never woken on their day off.
        if (reminder.days_of_week.length === 7) {
          return [
            Notifications.scheduleNotificationAsync({
              content,
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
                ...channel,
              },
            }),
          ];
        }

        return reminder.days_of_week.map((isoDay) =>
          Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              // Expo counts weekdays from Sunday = 1; our schedules use ISO,
              // where Monday = 1 and Sunday = 7.
              weekday: isoDay === 7 ? 1 : isoDay + 1,
              hour,
              minute,
              ...channel,
            },
          }),
        );
      }),
    );

    syncedSignature = signature;
  } catch {
    // A device that refuses to schedule notifications must not break the patrol
    // screen. The guard can still walk and record the round without a reminder.
    // Leaving the signature unset means the next sync retries rather than
    // assuming the alarms were placed.
  }
};

export const cancelPatrolReminders = async () => {
  // The next signed-in guard must get their own alarms rebuilt from scratch.
  syncedSignature = null;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((notification) => notification.content.data?.type === PATROL_REMINDER)
        .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
    );
  } catch {
    // Nothing actionable; the alarms are local and harmless if they remain.
  }
};
