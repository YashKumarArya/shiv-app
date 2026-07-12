import { useState } from 'react';
import { employeeName, type Attendance } from '@/api/types';
import { DateStepper } from '@/components/DateStepper';
import { ResourceList } from '@/components/ResourceList';
import { ListCard } from '@/components/ui/ListCard';
import { Screen } from '@/components/ui/Screen';
import { today } from '@/lib/format';

const time = (value?: string) => value?.slice(0, 5) ?? '--:--';

export default function AttendanceTab() {
  const [date, setDate] = useState(today());
  return (
    <Screen>
      <DateStepper value={date} onChange={setDate} />
      <ResourceList<Attendance>
        resource="attendance"
        params={{ attendance_date: date }}
        addHref={`/attendance/mark?date=${date}`}
        renderItem={(a) => (
          <ListCard
            title={employeeName(a)}
            subtitle={`${time(a.check_in)} → ${time(a.check_out)}${a.site_name ? ` · ${a.site_name}` : ''}`}
            badge={a.status}
            href={`/attendance/mark?id=${a.id}`}
          />
        )}
      />
    </Screen>
  );
}
