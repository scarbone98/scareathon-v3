// Recover one quality tier only after ten uninterrupted seconds of spare
// frame budget. Pauses, hidden tabs and slow frames cannot earn recovery time.
export class QualityRecovery {
  private healthyTime = 0;
  reset() { this.healthyTime = 0; }
  sample(frameDelta: number) {
    if (!(frameDelta > 0 && frameDelta <= .0185)) { this.reset(); return false; }
    this.healthyTime += frameDelta;
    if (this.healthyTime < 10) return false;
    this.reset();
    return true;
  }
}
