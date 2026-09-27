// Add or edit a reminder (docs/aster-reminders-location-plan.md §3): `new`, or a reminder's
// client_uuid (from "Coming up" or a tap on its notification).
import { useLocalSearchParams } from 'expo-router';

import { SessionGate } from '@/features/profiles/SessionGate';
import { ReminderEditor } from '@/features/reminders/ReminderEditor';

export default function Reminder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionGate>
      <ReminderEditor id={id} />
    </SessionGate>
  );
}
