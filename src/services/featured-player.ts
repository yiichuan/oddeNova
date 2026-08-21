import { getErrorMessage } from '../lib/errors';
import { applySeekCycle, seekTargetCycle, type SeekableScheduler } from './scheduler-seek';
import { strudelService } from './strudel';
import { claimTransport } from './transport';

/**
 * The Featured page's own transport.
 *
 * It used to borrow the studio's engine, which meant an audition wrote someone
 * else's code into your editor, and — because `setcps` is global to a
 * scheduler — inherited whatever tempo the studio was last playing at. This
 * runs a scheduler of its own instead: separate clock, separate playhead,
 * separate evaluation state. Nothing an audition does can be seen from the
 * studio side.
 *
 * What it does *not* have of its own is audio. superdough is a single audio
 * backend — one AudioContext, one master chain, one set of sample banks — and
 * a second one is not something this app can have (see CLAUDE.md). So the
 * sound, the master volume and the loaded samples are shared, and only the
 * clock is private. `strudelService` still owns bringing that backend up;
 * this asks it to, then schedules against it.
 *
 * One consequence worth knowing: a repl re-registers the globals it owns
 * (`setcps`, `hush`, `cpm`) at the top of every evaluate, bound to itself. So
 * whichever transport evaluated last is the one a bare `setcps` reaches — which
 * is exactly right as long as playing always evaluates first, and it does.
 */

export interface FeaturedPlayerState {
  isPlaying: boolean;
  /** Stopped mid-play, holding its playhead for the next `play`. */
  isPaused: boolean;
  error: string | null;
}

type StateCallback = (state: FeaturedPlayerState) => void;

interface ReplInstance {
  scheduler: SeekableScheduler & { started?: boolean; pause?: () => void; stop?: () => void };
  evaluate: (code: string, autostart?: boolean) => Promise<unknown>;
  stop: () => void;
}

class FeaturedPlayer {
  private replInstance: ReplInstance | null = null;
  private building: Promise<ReplInstance | null> | null = null;
  private stateCallbacks: StateCallback[] = [];
  private _state: FeaturedPlayerState = { isPlaying: false, isPaused: false, error: null };
  /** A seek made while silent, applied the moment the piece starts. */
  private pendingSeekCycle: number | null = null;
  /** What was last evaluated — a different piece drops a held playhead. */
  private currentCode = '';

  get state(): FeaturedPlayerState {
    return this._state;
  }

  onStateChange(callback: StateCallback): () => void {
    this.stateCallbacks.push(callback);
    callback(this._state);
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter((registered) => registered !== callback);
    };
  }

  private notify(partial: Partial<FeaturedPlayerState>): void {
    this._state = { ...this._state, ...partial };
    for (const callback of this.stateCallbacks) callback(this._state);
  }

  /**
   * Built on first play rather than at import: the scheduler is worth nothing
   * until the shared engine has finished loading its samples, and most visits
   * to this page never play anything.
   */
  private async ensureRepl(): Promise<ReplInstance | null> {
    if (this.replInstance) return this.replInstance;
    if (this.building) return this.building;

    this.building = (async () => {
      try {
        const { repl } = await import('@strudel/core');
        const { transpiler } = await import('@strudel/transpiler');
        const { webaudioOutput } = await import('@strudel/webaudio');
        const { getAudioContext } = await import('superdough');

        const instance = repl({
          defaultOutput: webaudioOutput,
          getTime: () => getAudioContext().currentTime,
          transpiler,
          onUpdateState: (state: { started?: boolean; evalError?: unknown }) => {
            const error = state.evalError ? getErrorMessage(state.evalError) : null;
            const started = state.started ?? false;
            this.notify({
              isPlaying: started,
              // Starting clears a held playhead; stopping is either a pause,
              // which set the flag already, or a stop, which cleared it.
              isPaused: started ? false : this._state.isPaused,
              error,
            });
          },
          onEvalError: (error: unknown) => this.notify({ error: getErrorMessage(error) }),
        }) as unknown as ReplInstance;

        this.replInstance = instance;
        return instance;
      } catch (error) {
        this.notify({ error: getErrorMessage(error) });
        return null;
      } finally {
        this.building = null;
      }
    })();

    return this.building;
  }

  /**
   * Play `code` from the top, or from where a pause left it when it is the
   * same code. Resolves false when the engine could not take it, which is what
   * keeps the page from claiming a piece is sounding in silence.
   */
  play = async (code: string): Promise<boolean> => {
    if (!strudelService.isReady) return false;

    claimTransport('featured', this.stop);

    const instance = await this.ensureRepl();
    if (!instance) return false;

    if (code !== this.currentCode) {
      // Another piece: nothing about the last one's position applies.
      this.pendingSeekCycle = null;
      this.currentCode = code;
    }

    try {
      this.notify({ error: null });
      await strudelService.prepareAudioForPlayback();
      await instance.evaluate(code);
      this.applyPendingSeek();
      this.notify({ isPlaying: true, isPaused: false });
      return true;
    } catch (error) {
      this.notify({ error: getErrorMessage(error), isPlaying: false });
      return false;
    }
  };

  /** Silence, holding the playhead where it is. */
  pause = (): void => {
    const scheduler = this.replInstance?.scheduler;
    if (!scheduler) return;

    const currentCycle = scheduler.now?.();
    if (Number.isFinite(currentCycle)) this.pendingSeekCycle = currentCycle as number;

    if (typeof scheduler.pause === 'function') scheduler.pause();
    else if (typeof scheduler.stop === 'function') scheduler.stop();
    else this.replInstance?.stop();

    this.notify({ isPlaying: false, isPaused: true });
  };

  /** Silence, and rewind. */
  stop = (): void => {
    this.pendingSeekCycle = null;
    this.replInstance?.stop();
    this.notify({ isPlaying: false, isPaused: false });
  };

  /**
   * Move the playhead to `progress` (0..1) of a loop `loopCycles` long. Held
   * until the next play when nothing is sounding, so scrubbing a stopped bar
   * decides where it starts.
   */
  seek = (progress: number, loopCycles: number): boolean => {
    const targetCycle = seekTargetCycle(progress, loopCycles);
    if (targetCycle === null) return false;

    if (!this._state.isPlaying) {
      this.pendingSeekCycle = targetCycle;
      return true;
    }

    return applySeekCycle(this.replInstance?.scheduler, targetCycle);
  };

  private applyPendingSeek(): void {
    if (this.pendingSeekCycle === null) return;
    if (applySeekCycle(this.replInstance?.scheduler, this.pendingSeekCycle)) {
      this.pendingSeekCycle = null;
    }
  }
}

export const featuredPlayer = new FeaturedPlayer();
