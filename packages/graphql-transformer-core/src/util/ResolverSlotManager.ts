export enum ResolverSlots {
  'PREPARE' = 'PREPARE',
  PRE_INIT = 'PRE_INIT',
  INIT = 'INTI',
  POST_INIT = 'POST_INIT',
  PRE_AUTH = 'PRE_AUTH',
  AUTH = 'AUTH',
  POST_AUTH = 'POST_AUTH',
  PRE_DATA_LOAD = 'PRE_DATA_LOAD',
  POST_DATA_LOAD = 'PRE_DATA_LOAD',
  'PRE_AUTH_FILTER' = 'PRE_AUTH_FILTER',
  'AUTH_FILTER' = 'AUTH_FILTER',
  'POST_AUTH_FILTER' = 'POST_AUTH_FILTER',
  'FINISH' = 'FINISH'
}
export class ResolverSlotManager {
  private slots: Map<string, string[]> = new Map();
  constructor(private slotsNames: string[]) {
    slotsNames.forEach(name => {
      this.slots.set(name, []);
    });
  }

  addTo(slotName: string, content: string): void {
    if (!this.slotsNames.includes(slotName)) {
      throw new Error(`Missing slot ${slotName}`);
    }
    slotName;
  }
}
