# Fogged

A small interactive window that you can clear with your hand.

**Live:** \[[https://foggyglass.netlify.app/]

## What it does

Drag across the glass to wipe away the condensation.

The glass reacts as you interact with it:

-   Water beads and streaks move with the wipe.
-   Drips form and slowly run down the glass.
-   The condensation gradually comes back when you stop interacting.
-   Press and hold to warm an area of the glass, then release to clear a
    larger circle.
-   As more of the glass is cleared, the scene slowly moves from night
    towards dawn.
-   There is also a small ambient sound layer that reacts to the
    interaction.

I kept the instructions minimal. A couple of small hints appear as you
use it instead of putting a full instruction panel on screen.

## Controls

  Action                               Effect
  ------------------------------------ ---------------------
  Click / touch + drag                 Wipe the glass
  Click / touch + hold, then release   Clear a larger area
  `R`                                  Fog the glass again
  `M`                                  Mute / unmute

## How it's built

The project is built with React, TypeScript, and Canvas.

There are two visible canvases:

-   **`glass-canvas`** handles the main scene, fog, wipe mask, and
    night-to-dawn transition.
-   **`lens-canvas`** handles the water beads, pointer feedback, and
    hold/charge interaction.

An offscreen canvas is used for the wipe mask, drip movement, fog
returning, and ripple effects.

The main pieces are:

``` text
components/
  FoggyGlass.tsx

hooks/
  use-glass.ts

lib/
  paper-glass-layer.ts
  window-scene.ts
  drift-audio.ts
```

## Why Canvas?

I started by looking at the Paper Shaders presets from the brief, but
they didn't quite give me the condensation effect I was looking for.

I wanted individual droplets, streaks, drips, fog returning over time,
and a clean undistorted view underneath the glass. Canvas gave me more
control over those details and also kept the implementation fairly
lightweight.

## Running locally

``` bash
npm install
npm run dev
```

Add the scene image here:

``` text
public/night-sk.png
```

Or change the `PHOTO` reference in `FoggyGlass.tsx`.

If the image isn't available, the project falls back to a procedurally
generated scene.

## What I'd explore next

If I had more time, I'd probably explore:

-   Drawing on the fogged glass and letting the writing slowly
    disappear.
-   More realistic refraction through individual water droplets using
    WebGL.
-   Rain interacting with the glass and condensation.
-   A few different weather and time-of-day variations.
-   Better touch and multi-touch support.
