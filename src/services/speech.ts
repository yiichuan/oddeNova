type SpeechCallback = (text: string) => void;

interface SpeechRecognitionResult {
  readonly transcript: string;
}
interface SpeechRecognitionAlternative {
  readonly [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResultList {
  readonly [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const SpeechRecognitionAPI: SpeechRecognitionConstructor | undefined =
  (window as Record<string, unknown>).SpeechRecognition as SpeechRecognitionConstructor ||
  (window as Record<string, unknown>).webkitSpeechRecognition as SpeechRecognitionConstructor;

export function isSpeechSupported(): boolean {
  return !!SpeechRecognitionAPI;
}

let recognition: SpeechRecognitionInstance | null = null;

export function createRecognition(
  onResult: SpeechCallback,
  onEnd: () => void,
  lang = 'zh-CN'
) {
  if (!SpeechRecognitionAPI) return null;

  recognition = new SpeechRecognitionAPI();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };

  recognition.onend = onEnd;
  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    console.error('Speech error:', event.error);
    onEnd();
  };

  return recognition;
}

export function startListening(): void {
  if (recognition) {
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech:', e);
    }
  }
}

export function stopListening(): void {
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.error('Failed to stop speech:', e);
    }
  }
}
