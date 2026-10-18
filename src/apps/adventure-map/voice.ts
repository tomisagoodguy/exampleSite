/** 懶人包語音導覽：用瀏覽器內建 Web Speech API 逐段朗讀，不需後端也不花錢 */

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** 正在念哪個懶人包的第幾段；null 代表沒在念 */
export interface SpeechState {
  guideId: number;
  segment: number;
}

let state: SpeechState | null = null;
let listener: (state: SpeechState | null) => void = () => {};
/** 每次開始／停止都換一個 run，舊 run 被 cancel 後陸續觸發的 onend/onerror 一律忽略 */
let runId = 0;

export function setSpeechListener(fn: (state: SpeechState | null) => void): void {
  listener = fn;
}

export function currentSpeech(): SpeechState | null {
  return state;
}

function setState(next: SpeechState | null): void {
  state = next;
  listener(state);
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.replace('_', '-') === 'zh-TW')
    || voices.find((v) => v.lang.toLowerCase().startsWith('zh'));
}

/** emoji 會被部分語音引擎念成英文名稱；「13:10–16:00」的破折號念成「到」 */
function toSpeakable(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[–—~～]/g, '到')
    .replace(/\s*→\s*/g, '，到')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 一段一個 utterance：可以知道念到哪一站，也避開 Chrome 長句念到一半被截斷的問題 */
export function speak(guideId: number, segments: string[]): void {
  if (!speechSupported || !segments.length) return;
  stopSpeech();
  const run = ++runId;
  const voice = pickVoice();

  segments.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(toSpeakable(text));
    u.lang = 'zh-TW';
    if (voice) u.voice = voice;
    u.onstart = () => {
      if (run === runId) setState({ guideId, segment: i });
    };
    const finish = () => {
      if (run === runId && i === segments.length - 1) setState(null);
    };
    u.onend = finish;
    u.onerror = (e) => {
      if (run !== runId) return;
      console.warn('語音導覽播放失敗：', e.error);
      stopSpeech();
    };
    window.speechSynthesis.speak(u);
  });

  setState({ guideId, segment: 0 });
}

export function stopSpeech(): void {
  if (!speechSupported) return;
  runId++;
  window.speechSynthesis.cancel();
  if (state) setState(null);
}
