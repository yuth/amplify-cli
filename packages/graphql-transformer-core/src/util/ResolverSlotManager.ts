import { } from '.'
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
    const slot = this.slots.get(slotName);
    slot.push(content);
  }
  get(name: string): string[] {
    return this.slots.get(name);
  }
}
