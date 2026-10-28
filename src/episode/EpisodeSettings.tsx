import { usePreferences } from '../preferences/preferences';
import { Slider } from '../components/Slider';
import { RECORDED_VOICES, VOICE_CHARACTER } from './narration/clip';
import { narrationLibrary } from './narration/library';
import { useNarrationManifest } from './narration/useNarration';
import { speechText } from './speechText';
import { chooseVoices, koreanVoices, useVoices } from './voices';

const PACES = [0.9, 1, 1.1, 1.25] as const;
const HOST_LABELS = ['First host', 'Second host'];
const SAMPLE = ['안녕하세요. 이 목소리로 앨범을 같이 듣겠습니다.', '저는 이 목소리로 곡 이야기를 덧붙이겠습니다.'];

/** The "Hear it" sample being said, kept reachable until it has ended. */
const samples = new Set<SpeechSynthesisUtterance>();

/** The element the recorded samples play through: one, so a new sample stops the one before it. */
let samplePlayer: HTMLAudioElement | null = null;

/** Plays a recorded voice's sample. Called from a click, which is what lets the audio start. */
function hearRecorded(clipKey: string, rate: number): void {
  if (typeof Audio !== 'function') return;
  samplePlayer ??= new Audio();
  const player = samplePlayer;
  player.pause();
  void narrationLibrary
    .clip(clipKey)
    .then((url) => {
      player.src = url;
      player.defaultPlaybackRate = rate;
      player.playbackRate = rate;
      return player.play();
    })
    .catch(() => undefined);
}

/** "Microsoft SunHi Online (Natural) - Korean (Korea)" → "SunHi (Natural)". */
function shortName(voice: SpeechSynthesisVoice): string {
  return voice.name
    .replace(/^(Microsoft|Google)\s+/i, (match) => (/google/i.test(match) ? 'Google ' : ''))
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+Online\b/i, '')
    .trim();
}

/**
 * Settings for episodes: the pace the hosts speak at and what the music does
 * under a talk-over, for every listener; and the voices. On a site with
 * recordings the hosts' voices belong to each episode's script (the ten
 * Supertonic voices can be heard here, for choosing them), and the browser's
 * own voices only say the lines that have no recording.
 */
export function EpisodeSettings() {
  const [preferences, setPreferences] = usePreferences();
  const narration = useNarrationManifest();
  const sampled = narration ? RECORDED_VOICES.filter((voice) => narration.samples[voice] !== undefined) : [];
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
      {narration && (
        <>
          <p>
            The hosts are recorded with {narration.engine.name}, a machine-generated voice. Which of its voices each host has is written in the episode’s
            script; a line without a recording is said by this browser’s voice.
          </p>
          {sampled.length > 0 && (
            <div className="settings-fields">
              <div className="settings-field" role="group" aria-label="The recorded voices">
                <span>Voices</span>
                <span className="settings-choices settings-voices">
                  {sampled.map((voice) => (
                    <button
                      key={voice}
                      type="button"
                      className="text-toggle"
                      title={`Hear ${voice}: ${VOICE_CHARACTER[voice]}`}
                      aria-label={`Hear voice ${voice}, ${VOICE_CHARACTER[voice]}`}
                      onClick={() => hearRecorded(narration.samples[voice]!, preferences.episodeRate)}
                    >
                      {voice}
                    </button>
                  ))}
                </span>
              </div>
            </div>
          )}
        </>
      )}
      {korean.length === 0 ? (
        <p>
          {narration
            ? 'This browser has no Korean voice, so a line without a recording is shown instead of spoken.'
            : 'This browser has no Korean voice, so an episode shows the hosts’ lines instead of speaking them.'}{' '}
          Microsoft Edge comes with natural-sounding Korean voices; Chrome uses the ones installed in Windows or macOS.
        </p>
      ) : (
        <>
          <p>
            {narration ? 'Lines without a recording are said by' : 'The hosts speak with'} this browser’s Korean voices
            {korean.length === 1 ? ' — there is one, so the second host uses it at a lower pitch' : ''}.
          </p>
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
        <div className="settings-field" role="group" aria-label="Who plays the music">
          <span>Music</span>
          <span className="settings-choices">
            <button type="button" className="text-toggle" aria-pressed={preferences.episodeMusic === 'auto'} onClick={() => setPreferences({ episodeMusic: 'auto' })}>
              Played for me
            </button>
            <button type="button" className="text-toggle" aria-pressed={preferences.episodeMusic === 'manual'} onClick={() => setPreferences({ episodeMusic: 'manual' })}>
              I play it myself
            </button>
          </span>
        </div>
        {preferences.episodeMusic === 'auto' && (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
