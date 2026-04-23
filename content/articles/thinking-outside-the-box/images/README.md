# Article images

Drop image files here (`.jpg`, `.png`, `.webp`). Name them semantically — the filename goes in the `import` line.

Used by `../index.mdx`:

- `orange-prototype.*` — orange carved/prototyped for a class project
- `meter-face.*` — street meter with a sticker face
- `cat-jelly.*` — cat photo with jelly-cat drawing overlay
- `arduino-plushie.*` — physical computing with sun plushie + Arduino
- `smiley-sand.*` — smiley face traced in sand / concrete

To add a new image:

1. Save it in this folder with a semantic name.
2. Open `../index.mdx`.
3. Add an `import` line at the top: `import newName from './images/new-name.jpg'`.
4. Add a matching item to the `<Collage items={...}>` array.

The collage auto-arranges; no need to pick position — rotation and layout are deterministic from item order.
