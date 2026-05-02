/**
 * Freeze detection for session playback (demo-friendly).
 *
 * A “freeze” means: after a user stops speaking, the bot does not answer in time
 * (next turn is another user, or the call ends) and the gap exceeds a minimum.
 *
 * **Rules (per user turn, in time order):**
 * 1. If the **next** turn is **assistant** → not a freeze from this rule (bot replied).
 * 2. If the **next** turn is **user** → gap = `next.start_ts - user.end_ts` (no assistant in between in our turn list).
 * 3. If there is **no** next turn → gap = `recording_ended_at - user.end_ts` (requires `recording_ended_at` in the JSON).
 * 4. If `gap <= minGapSeconds` → ignore.
 * 5. Otherwise this user end is a **candidate** freeze start. We take the **earliest** such `user.end`
 *    on the timeline. The UI then shades **from that time to the end of the waveform** (terminal freeze UI).
 */

/** Turn shape needed for detection (matches normalized transcript turns on the client). */
export type FreezeTurn = {
  role: 'user' | 'assistant'
  start_ts: number | null
  end_ts: number
  /** End time relative to recording start (seconds), same as used for the waveform. */
  end: number
}

export const DEFAULT_FREEZE_MIN_GAP_SECONDS = 5

export type FreezeTailResult = {
  startsAtRel: number
  triggerGapSeconds: number
}

/**
 * @param turns — Chronological turns with valid `start_ts` (already normalized/sorted).
 * @param recordingEndedAtUnix — Absolute Unix time when recording stopped (`recording_ended_at` from JSON), or null.
 * @param audioDurationSeconds — WAV length from WaveSurfer (`getDuration()`).
 * @param minGapSeconds — Minimum silence gap to count as freeze (default {@link DEFAULT_FREEZE_MIN_GAP_SECONDS}).
 */
export function detectFreezeTail (
  turns: readonly FreezeTurn[],
  recordingEndedAtUnix: number | null,
  audioDurationSeconds: number,
  minGapSeconds: number = DEFAULT_FREEZE_MIN_GAP_SECONDS
): FreezeTailResult | null {
  if (!turns.length || audioDurationSeconds <= 0) return null

  let earliestEndRel = Infinity
  let gapAtEarliest = 0

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]
    if (t.role !== 'user') continue
    const next = turns[i + 1]

    let gap: number
    if (next) {
      if (next.role === 'assistant') continue
      gap = (next.start_ts as number) - t.end_ts
    } else {
      if (recordingEndedAtUnix == null) continue
      gap = recordingEndedAtUnix - t.end_ts
    }

    if (gap <= minGapSeconds) continue
    if (t.end < earliestEndRel) {
      earliestEndRel = t.end
      gapAtEarliest = gap
    }
  }

  if (earliestEndRel === Infinity || earliestEndRel >= audioDurationSeconds)
    return null

  return {
    startsAtRel: earliestEndRel,
    triggerGapSeconds: gapAtEarliest
  }
}

/** Percent positions for a full-width overlay from freeze start to end of waveform. */
export function freezeOverlayPercentages (
  startsAtRel: number,
  audioDurationSeconds: number
) {
  const left = (startsAtRel / audioDurationSeconds) * 100
  return { leftPct: left, widthPct: 100 - left }
}
