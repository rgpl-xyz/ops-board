import { Pipe, PipeTransform } from '@angular/core';

/** Turns a type name such as `IncidentCreated` into "Incident created". */
@Pipe({ name: 'obHumanize' })
export class HumanizePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}
