// TTY-aware spinner. When stderr is not a TTY, falls back to plain
// "working..." text. Returns an object with stop() and fail() methods.

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
  stop(finalText?: string): void;
  fail(finalText?: string): void;
  update(text: string): void;
}

export interface SpinnerOptions {
  text: string;
  stream?: NodeJS.WritableStream;
  enabled?: boolean;
}

export function createSpinner(opts: SpinnerOptions): Spinner {
  const stream = opts.stream ?? process.stderr;
  const isTTY = (stream as { isTTY?: boolean }).isTTY ?? false;
  const enabled = opts.enabled ?? isTTY;

  if (!enabled) {
    stream.write(`${opts.text}...\n`);
    return {
      stop(finalText?: string) {
        if (finalText) stream.write(`${finalText}\n`);
      },
      fail(finalText?: string) {
        if (finalText) stream.write(`✗ ${finalText}\n`);
      },
      update(_text: string) {
        // no-op
      },
    };
  }

  let frame = 0;
  let currentText = opts.text;
  const interval = setInterval(() => {
    stream.write(`\r${FRAMES[frame % FRAMES.length]} ${currentText}`);
    frame++;
  }, 80);

  return {
    stop(finalText?: string) {
      clearInterval(interval);
      const text = finalText ?? currentText;
      stream.write(`\r✓ ${text}\n`);
    },
    fail(finalText?: string) {
      clearInterval(interval);
      const text = finalText ?? currentText;
      stream.write(`\r✗ ${text}\n`);
    },
    update(text: string) {
      currentText = text;
    },
  };
}
