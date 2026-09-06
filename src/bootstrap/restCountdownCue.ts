import type {
  RestCountdownCuePort,
} from "../domains/rest/restCountdownCuePort";
import {
  useExpoRestCountdownCueAdapter,
} from "../platform/audio/expoRestCountdownCueAdapter";

/**
 * Composes the native audio adapter at the bootstrap boundary so routes remain
 * isolated from platform modules. The returned port only observes countdowns.
 */
export function useRestCountdownCue(): RestCountdownCuePort {
  return useExpoRestCountdownCueAdapter();
}
