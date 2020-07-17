
export class TransformerContextMetadata {
  /**
   * Used by transformers to pass information between one another.
   */
  private metadata: { [key: string]: any; } = {};


  public get(key: string): any {
    return this.metadata[key];
  }


  public set(key: string, val: any): void {
    return (this.metadata[key] = val);
  }


  public has(key: string) {
    return Boolean(this.metadata[key] !== undefined);
  }
}
