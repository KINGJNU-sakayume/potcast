import { usePreferences } from '../preferences/preferences';
import { Slider } from '../components/Slider';
import { speechText } from './speechText';
import { chooseVoices, koreanVoices, useVoices } from './voices';

const PACES = [0.9, 1, 1.1, 1.25] as const;
const HOST_LABELS = ['First host', 'Second host'];
const SAMPLE = ['안녕하세요. 이 목소리로 앨범을 같이 듣겠습니다.', '저는 이 목소리로 곡 이야기를 덧붙이겠습니다.'];

/** The "Hear it" sample being said, kept reachable until it has ended. */
const samples = new Set<SpeechSynthesisUtterance>();

/** "Microsoft SunHi Online (Natural) - Korean (Korea)" → "SunHi (Natural)". */
function shortName(voice: SpeechSynthesisVoice): string {
  return voice.name
    .replace(/^(Microsoft|Google)\s+/i, (match) => (/google/i.test(match) ? 'Google ' : ''))
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+Online\b/i, '')
    .trim();
}

/**
 * Settings for episodes: each host's voice, the pace they speak at, and what
 * the music does under a talk-over. The voices are the browser's own, so the
 * list is whatever this browser and system offer for Korean.
 */
export function EpisodeSettings() {
  const [preferences, setPreferences] = usePreferences();
  const voices = useVoices();
  const korean = koreanVoices(voices);
  const chosen = chooseVoices(HOST_LABELS.length, voices, preferences.episodeVoices);

  const setVoice = (slot: number, uri: string) => {
    const next = [...preferences.episodeVoices];
    while (next.length < HOST_LABELS.length) next.push(null);
    next[slot] = uri || null;
    setPreferences({ episodeVoices: next });
  };

  const hear = (slot: number) => {
    const choice = chosen[slot];
    if (!choice?.voice || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(speechText(SAMPLE[slot]!));
    utterance.voice = choice.voice;
    utterance.lang = choice.voice.lang;
    utterance.rate = preferences.episodeRate;
    utterance.pitch = choice.pitch;
    // Chrome drops an utterance spoken right after cancel(), and one nothing refers to may never finish.
    const synth = window.speechSynthesis;
    const busy = synth.speaking || synth.pending;
    if (busy) synth.cancel();
    samples.clear();
    samples.add(utterance);
    utterance.onend = () => samples.delete(utterance);
    window.setTimeout(() => synth.speak(utterance), busy ? 200 : 0);
  };

  return (
    <>
      <div className="label">Episodes</div>
      {korean.length === 0 ? (
        <p>
          This browser has no Korean voice, so an episode shows the hosts’ lines instead of speaking them. Microsoft Edge comes with natural-sounding
          Korean voices; Chrome uses the ones installed in Windows or macOS.
        </p>
      ) : (
        <>
          <p>The hosts speak with this browser’s Korean voices{korean.length === 1 ? ' — there is one, so the second host uses it at a lower pitch' : ''}.</p>
          <div className="settings-fields">
            {HOST_LABELS.map((label, slot) => (
              <label key={label} className="settings-field">
                <span>{label}</span>
                <select value={preferences.episodeVoices[slot] ?? ''} onChange={(event) => setVoice(slot, event.target.value)}>
                  <option value="">Automatic{chosen[slot]?.voice && !preferences.episodeVoices[slot] ? ` · ${shortName(chosen[slot].voice)}` : ''}</option>
                  {korean.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {shortName(voice)}
                    </option>
                  ))}
                </select>
                <button type="button" className="note-more" onClick={() => hear(slot)}>
                  Hear it
                </button>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="settings-fields">
        <div className="settings-field" role="group" aria-label="Pace">
          <span>Pace</span>
          <span className="settings-choices">
            {PACES.map((pace) => (
              <button
                key={pace}
                type="button"
                className="text-toggle"
                aria-pressed={preferences.episodeRate === pace}
                onClick={() => setPreferences({ episodeRate: pace })}
              >
                {pace}×
              </button>
            ))}
          </span>
        </div>
        <div className="settings-field" role="group" aria-label="Music while a host talks over it">
          <span>Under talk</span>
          <span className="settings-choices">
            <button type="button" className="text-toggle" aria-pressed={preferences.episodeTalkOver === 'duck'} onClick={() => setPreferences({ episodeTalkOver: 'duck' })}>
              Music turned down
            </button>
            <button type="button" className="text-toggle" aria-pressed={preferences.episodeTalkOver === 'pause'} onClick={() => setPreferences({ episodeTalkOver: 'pause' })}>
              Music stops
            </button>
          </span>
        </div>
        {preferences.episodeTalkOver === 'duck' && (
          <div className="settings-field">
            <span>Level</span>
            <Slider
              className="volume-slider settings-slider"
              label="Music level under talk"
              value={preferences.episodeDuckLevel / 0.6}
              step={0.05 / 0.6}
              bigStep={0.15 / 0.6}
              scale={60}
              valueText={(fraction) => `${Math.round(fraction * 60)} percent of your volume`}
              onCommit={(fraction) => setPreferences({ episodeDuckLevel: Math.round(Math.max(0.05, fraction * 0.6) * 100) / 100 })}
            />
            <span className="settings-value">{Math.round(preferences.episodeDuckLevel * 100)}%</span>
          </div>
        )}
      </div>
    </>
  );
}
