type SpeechCallback = (text: string) => void;

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function isSpeechSupported(): boolean {
  return !!SpeechRecognitionAPI;
}

let recognition: any = null;

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

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };

  recognition.onend = onEnd;
  recognition.onerror = (event: any) => {
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
