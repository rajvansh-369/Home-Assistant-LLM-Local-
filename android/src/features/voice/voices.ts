// The phone's voices for 5.1's "Voice and speech" (docs/aster-voice-plan.md §3 5.1): its English
// and Hindi offline voices, named by language and numbered (Android's own names, like
// "en-in-x-ahp-local", mean nothing to people), and what 5.1's row says about the choice.
import { useEffect, useState } from 'react';

import AsterSystem, { type DeviceVoice } from '../../../modules/aster-system';

import { voice as copy } from './copy';

export type NamedVoice = { name: string; label: string; locale: string };

/** "en-IN" from "en-IN", "en_IN" or "en-in-x-…". */
function localeTag(locale: string): string {
  const [language = '', region = ''] = locale.split(/[-_]/);
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

function languageName(tag: string): string | null {
  if (copy.settings.languages[tag]) return copy.settings.languages[tag];
  const [language, region] = tag.split('-');
  if (language === 'en') return region ? copy.settings.otherEnglish(region) : 'English';
  if (language === 'hi') return copy.settings.languages['hi-IN'];
  return null;
}

/**
 * English and Hindi voices, the phone's region first, then by language; within a language the
 * best quality first, numbered 1, 2, …
 */
export function nameVoices(voices: DeviceVoice[], phoneRegion: string | null = null): NamedVoice[] {
  const byTag = new Map<string, DeviceVoice[]>();
  for (const voice of voices) {
    const tag = localeTag(voice.locale);
    if (!languageName(tag)) continue;
    byTag.set(tag, [...(byTag.get(tag) ?? []), voice]);
  }
  const region = phoneRegion?.toUpperCase() ?? null;
  const tags = [...byTag.keys()].sort((a, b) => {
    const home = (tag: string) => (region && tag.endsWith(`-${region}`) ? 0 : 1);
    const hindi = (tag: string) => (tag.startsWith('hi') ? 1 : 0);
    return home(a) - home(b) || hindi(a) - hindi(b) || a.localeCompare(b);
  });
  return tags.flatMap((tag) =>
    byTag
      .get(tag)!
      .sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name))
      .map((voice, i) => ({
        name: voice.name,
        locale: tag,
        label: copy.settings.voiceName(languageName(tag)!, i + 1),
      })),
  );
}

/** The chosen voice's name for 5.1's row: "Device voice" for the phone's default or one gone. */
export function voiceLabel(chosen: string | null, voices: NamedVoice[]): string {
  if (!chosen) return copy.settings.deviceVoice;
  return voices.find((voice) => voice.name === chosen)?.label ?? copy.settings.deviceVoice;
}

/** "recognition on this phone" / "…by Google" / none. */
export function recognitionLabel(full = false): string {
  let availability = { available: false, onDevice: false };
  try {
    availability = AsterSystem.speechAvailability();
  } catch {
    // No native side.
  }
  const s = copy.settings;
  if (!availability.available) return full ? s.recognitionNoneFull : s.recognitionNone;
  if (availability.onDevice) return full ? s.recognitionHereFull : s.recognitionHere;
  return full ? s.recognitionGoogleFull : s.recognitionGoogle;
}

/** The phone's region ("IN"), from the JS locale. */
function phoneRegion(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return /[-_]([A-Za-z]{2})\b/.exec(locale)?.[1] ?? null;
  } catch {
    return null;
  }
}

let cache: NamedVoice[] | null = null;
let generation = 0;

/** The named voices, loaded once per launch. */
export function useDeviceVoices(): { voices: NamedVoice[]; loaded: boolean } {
  const [voices, setVoices] = useState<NamedVoice[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    let live = true;
    const mine = generation;
    AsterSystem.listVoices()
      .then((list) => nameVoices(list, phoneRegion()))
      .catch(() => [])
      .then((named) => {
        if (mine !== generation) return;
        cache = named;
        if (live) setVoices(named);
      });
    return () => {
      live = false;
    };
  }, []);
  return { voices: voices ?? [], loaded: voices != null };
}

/** Tests only. */
export function resetVoiceCache() {
  cache = null;
  generation += 1;
}
