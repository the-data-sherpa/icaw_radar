// Audio Alert System for Severe Weather Warnings
// Uses Web Audio API to generate professional EAS-style alert tones

// Alert sound frequencies and patterns based on EAS (Emergency Alert System) standards
const ALERT_TONES = {
  tornado: {
    frequency: 853, // EAS attention signal frequency
    harmonics: [1046.5], // Additional harmonic for distinctive sound
    pattern: [1000, 500, 1000, 500, 1000], // on, off, on, off, on (ms)
    urgent: true,
  },
  severe: {
    frequency: 960,
    harmonics: [1200],
    pattern: [500, 250, 500, 250, 500],
    urgent: true,
  },
  flood: {
    frequency: 440,
    harmonics: [550],
    pattern: [300, 200, 300, 200, 300],
    urgent: false,
  },
  winter: {
    frequency: 520,
    harmonics: [650],
    pattern: [400, 300, 400],
    urgent: false,
  },
  default: {
    frequency: 660,
    harmonics: [825],
    pattern: [200, 150, 200],
    urgent: false,
  },
} as const;

type AlertType = keyof typeof ALERT_TONES;

class AudioAlertSystem {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = false;
  private lastAlertId: string | null = null;
  private isPlaying: boolean = false;
  private playedAlerts: Set<string> = new Set();

  /**
   * Enable audio alerts and initialize AudioContext
   */
  enable(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    this.enabled = true;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("audio-alerts-enabled", "true");
    }
  }

  /**
   * Disable audio alerts
   */
  disable(): void {
    this.enabled = false;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("audio-alerts-enabled", "false");
    }
  }

  /**
   * Check if audio alerts are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Load saved preference from localStorage
   */
  loadPreference(): boolean {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("audio-alerts-enabled");
      this.enabled = saved === "true";
    }
    return this.enabled;
  }

  /**
   * Map event string to alert type
   */
  getAlertType(event: string): AlertType {
    const e = event.toLowerCase();
    if (e.includes("tornado")) return "tornado";
    if (e.includes("severe thunderstorm")) return "severe";
    if (e.includes("flood") || e.includes("flash flood")) return "flood";
    if (e.includes("winter") || e.includes("blizzard") || e.includes("ice")) {
      return "winter";
    }
    return "default";
  }

  /**
   * Check if an alert has already been played
   */
  hasPlayed(alertId: string): boolean {
    return this.playedAlerts.has(alertId);
  }

  /**
   * Clear played alerts (call when alerts expire or are dismissed)
   */
  clearPlayed(alertId: string): void {
    this.playedAlerts.delete(alertId);
  }

  /**
   * Play an alert tone for the given event
   */
  async playAlert(event: string, alertId: string): Promise<void> {
    // Skip if disabled, no audio context, already playing, or already played this alert
    if (!this.enabled || !this.audioContext) return;
    if (this.isPlaying) return;
    if (this.playedAlerts.has(alertId)) return;

    // Mark as played and track last alert
    this.playedAlerts.add(alertId);
    this.lastAlertId = alertId;
    this.isPlaying = true;

    const type = this.getAlertType(event);
    const tone = ALERT_TONES[type];

    try {
      // Resume audio context if suspended (browser autoplay policy)
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Play the tone pattern
      let time = this.audioContext.currentTime;

      for (let i = 0; i < tone.pattern.length; i++) {
        const duration = tone.pattern[i] / 1000;

        if (i % 2 === 0) {
          // On phase - play tone
          this.createTone(
            this.audioContext,
            tone.frequency,
            tone.harmonics,
            time,
            duration,
            tone.urgent,
          );
        }

        time += duration;
      }

      // Reset playing state after all tones complete
      const totalDuration = tone.pattern.reduce((a, b) => a + b, 0);
      setTimeout(() => {
        this.isPlaying = false;
      }, totalDuration);
    } catch (error) {
      console.error("Audio alert playback failed:", error);
      this.isPlaying = false;
    }
  }

  /**
   * Create a professional-sounding tone with harmonics
   */
  private createTone(
    ctx: AudioContext,
    frequency: number,
    harmonics: readonly number[],
    startTime: number,
    duration: number,
    urgent: boolean,
  ): void {
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Main oscillator
    const mainOsc = ctx.createOscillator();
    const mainGain = ctx.createGain();
    mainOsc.connect(mainGain);
    mainGain.connect(masterGain);

    mainOsc.frequency.value = frequency;
    mainOsc.type = "sine";

    // Smooth envelope to avoid clicks
    mainGain.gain.setValueAtTime(0, startTime);
    mainGain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
    mainGain.gain.setValueAtTime(0.25, startTime + duration - 0.03);
    mainGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    mainOsc.start(startTime);
    mainOsc.stop(startTime + duration);

    // Add harmonics for richer sound
    harmonics.forEach((harmFreq) => {
      const harmOsc = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harmOsc.connect(harmGain);
      harmGain.connect(masterGain);

      harmOsc.frequency.value = harmFreq;
      harmOsc.type = "sine";

      // Lower volume for harmonics
      harmGain.gain.setValueAtTime(0, startTime);
      harmGain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
      harmGain.gain.setValueAtTime(0.1, startTime + duration - 0.03);
      harmGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      harmOsc.start(startTime);
      harmOsc.stop(startTime + duration);
    });

    // Add slight vibrato for urgent alerts to make them more attention-grabbing
    if (urgent) {
      const vibratoOsc = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(mainOsc.frequency);

      vibratoOsc.frequency.value = 8; // 8 Hz vibrato
      vibratoGain.gain.value = 15; // +/- 15 Hz modulation

      vibratoOsc.start(startTime);
      vibratoOsc.stop(startTime + duration);
    }

    // Master volume envelope
    masterGain.gain.setValueAtTime(0.3, startTime);
    masterGain.gain.setValueAtTime(0.3, startTime + duration);
  }

  /**
   * Test the audio system with a short beep
   */
  async testAudio(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 800;
    osc.type = "sine";

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// Singleton instance
export const audioAlerts = new AudioAlertSystem();
