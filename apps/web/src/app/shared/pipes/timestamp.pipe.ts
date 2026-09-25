import { Pipe, PipeTransform } from '@angular/core';

// Built from UTC fields so the output never depends on runtime locale data.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** Server timestamps as operators read them: day, month, year and UTC time. */
@Pipe({ name: 'obTimestamp' })
export class TimestampPipe implements PipeTransform {
  transform(value: string | null | undefined, withZone = false): string {
    if (!value) {
      return '';
    }
    const d = new Date(value);
    const text =
      `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    return withZone ? `${text} UTC` : text;
  }
}
