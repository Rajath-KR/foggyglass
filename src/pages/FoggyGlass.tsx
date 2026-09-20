import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "../components/ui/button";
import { useGlass } from "../hooks/use-glass";
import { createDriftAudio } from "../lib/drift-audio";

type Hint = "wipe" | "hold";
const HINT_TEXT: Record<Hint, { touch: string; mouse: string }> = {
  wipe: { touch: "drag a finger across the glass", mouse: "click and drag to wipe the glass" },
  hold: { touch: "now try pressing and holding, then let go", mouse: "now try clicking and holding, then let go" },
};

const PHOTO: { night: string; dawn?: string } | undefined = { night: "/night-sky.png" };

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      {muted ? (
        <>
          <path d="m16 9 5 6" />
          <path d="m21 9-5 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

export function FoggyGlass() {
  const audioRef = useRef<ReturnType<typeof createDriftAudio> | null>(null);
  const [hint, setHint] = useState<Hint>("wipe");
  const [hintVisible, setHintVisible] = useState(true);
  const stage = useRef<"wipe" | "waiting" | "hold" | "done">("wipe");
  const interacted = useRef(false);
  const wipeFrames = useRef(0);
  const timers = useRef<number[]>([]);
  const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const [muted, setMuted] = useState(false);

  const getAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createDriftAudio();
    return audioRef.current;
  }, []);

  const handleDrag = useCallback((level: number) => {
    audioRef.current?.drag(level);
    if (!interacted.current || level < 0.15) return;
    wipeFrames.current += 1;
    if (stage.current === "wipe" && wipeFrames.current > 25) {
      stage.current = "waiting";
      setHintVisible(false);
      timers.current.push(
        window.setTimeout(() => {
          if (stage.current !== "waiting") return;
          stage.current = "hold";
          setHint("hold");
          setHintVisible(true);
          timers.current.push(
            window.setTimeout(() => {
              if (stage.current === "hold") {
                stage.current = "done";
                setHintVisible(false);
              }
            }, 7000),
          );
        }, 6000),
      );
    }
  }, []);

  const handleBurst = useCallback((power: number) => {
    audioRef.current?.thup(power);
    stage.current = "done";
    setHintVisible(false);
  }, []);

  const { canvasRef, overlayRef, handlers, reset } = useGlass({
    onDrag: handleDrag,
    onBurst: handleBurst,
    photo: PHOTO,
  });

  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const onFirstPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const audio = getAudio();
      audio.start();
      audio.setMuted(muted);
      interacted.current = true;
      handlers.onPointerDown(event);
    },
    [getAudio, handlers, muted],
  );

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") handleReset();
      if (event.key.toLowerCase() === "m") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleReset, toggleMute]);

  return (
    <main className="glass-shell" onContextMenu={(e) => e.preventDefault()}>
      <div className="artwork-frame is-loaded">
        <canvas ref={canvasRef} className="glass-canvas" aria-hidden="true" />
        <canvas
          ref={overlayRef}
          className="lens-canvas"
          aria-label="A fogged window at night. Drag to wipe a patch clear, or press and hold to warm the glass and release to clear an area. The longer you wipe, the closer it gets to dawn."
          {...handlers}
          onPointerDown={onFirstPointerDown}
        />
      </div>

      <div className="window-frame" aria-hidden="true">
        <span className="mullion" />
      </div>

      <header className="corner top-left" aria-label="FOGGED">
        <h1>Foggy Glass</h1>
      </header>

      <div className="controls">
        <Button
          className="control-button sound-button"
          variant="ghost"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Turn sound on" : "Mute sound"}
        >
          <SoundIcon muted={muted} />
          {muted ? "SOUND OFF" : "SOUND ON"} <span aria-hidden="true">M</span>
        </Button>
        <Button className="control-button" variant="ghost" onClick={handleReset} aria-label="Fog it back over">
          FOG IT <span aria-hidden="true">R</span>
        </Button>
      </div>

      <div className={`instruction ${hintVisible ? "is-visible" : ""}`} aria-live="polite">
        <span className={`hint-glyph hint-${hint}`} aria-hidden="true" />
        <span>{isTouch ? HINT_TEXT[hint].touch : HINT_TEXT[hint].mouse}</span>
      </div>

      <div className="paper-grain" aria-hidden="true" />
    </main>
  );
}

export default FoggyGlass;