# NOTICE

Bsky-Spider is an independent, local-first Bluesky media downloader.

## Interface inspiration

The four-page interaction model (Home, Download Management, Settings, About) and
visual direction are inspired by:

- **X-Spider** — Copyright (C) MiningCattiva and contributors
- Source: https://github.com/MiningCattiva/x-spider
- License: GNU General Public License v3.0

The download pipeline also follows X-Spider's approach of preferring the direct
original file and using multi-connection transfers. Bsky-Spider is a new
implementation for Bluesky and is not affiliated with the X-Spider project. In
accordance with the GPL, this project is distributed under GPL-3.0-only; see
LICENSE.

## Login and media extraction reference

The App Password login flow and the approach to walking an author feed for
images/video are informed by:

- **Bluesky-Media-Downloader** — Copyright (c) maxreinartz
- Source: https://github.com/maxreinartz/Bluesky-Media-Downloader
- License: MIT

## Video muxing

Bluesky's HLS fallback streams (MPEG-TS with H.264/AAC) are converted to MP4 by
`server/remux`, a TypeScript demuxer/muxer written for this project. It performs
stream copying only — no re-encoding — and replaces the FFmpeg binary that older
versions bundled. No external media tool is required at runtime.

## Other components

- React, Ant Design, Vite, Express, undici and other libraries retain their
  respective licenses.
- Bluesky and AT Protocol are projects of their respective owners. This project
  is not affiliated with Bluesky, PBC.
