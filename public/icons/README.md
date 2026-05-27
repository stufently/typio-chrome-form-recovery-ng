# Icons

Required sizes: `16.png`, `32.png`, `48.png`, `128.png`, `512.png` (store listing).

Will be generated at Stage 5 from a single SVG master via `sharp` inside the Docker build image. Until then this directory is empty and the manifest references missing files — `wxt build` will warn but not fail.
