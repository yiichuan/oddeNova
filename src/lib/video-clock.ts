// [video] The Remotion renderer's clock: seconds of video time, pushed every
// frame. Wall-clock animations (Lottie, CSS) run at render speed rather than
// video speed — a frame can take half a second to capture, so a loop that
// plays at the right pace live flickers far too fast in the video. Animations
// that need to hold their real pace seek to this clock instead. Stays null in
// normal use, where nothing ever sets it.

let time: number | null = null;
const listeners = new Set<() => void>();

export function setVideoClock(t: number): void {
  time = t;
  listeners.forEach((l) => l());
}

export function subscribeVideoClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVideoClock(): number | null {
  return time;
}
