# Personal digging in potcast

This integration was researched against potcast `d3209700ed4a6d59ff4968b5ad7f47072bc76282` and spottied `637a1a44c2836e788d1a53dbe74daac2c396207d` (their main branches on 2026-11-01). The original spottied repository and its `spottied` IndexedDB are never written or opened by this implementation.

## Using the integration

- Artist → Discography → **Start digging**. New projects include studio album candidates only. Singles/EPs, compilations and appearances start disabled. Spotify does not expose a reliable studio flag: known live/compilation/OST title markers are filtered, and **추적 범위** permits explicit studio/nonstudio classification and per-release inclusion or exclusion.
- **MY DIGGING** distinguishes reviewed percentage `(listened + skipped) / target tracks` from listened percentage `listened / target tracks`. These are personal assertions, not verified playback time. **Continue digging** uses the existing playback API with the next known unreviewed track's album context and track offset.
- Album → **MY LISTENING** → write/edit. Album and track ratings are independent, from 0.5 to 5 in half-star steps. Personal favorites never change Spotify Saved/Liked. Personal notes never change Editorial Notes.
- Track Sequence defaults to **재생**. **기록** exposes 44×44px listened/skipped controls; pressing the same status clears it. The title opens personal details. **일괄** supports all/unreviewed selection, three status operations, a target count and undo. None of these status operations create listen events.
- Track details show dated history and an explicit, backdatable **재청취 이벤트 추가** action. Resetting or undoing a state does not delete history. Undo refuses to replace subsequent edits, including edits on a verified edition alias.
- Library → existing **Artists** section contains recent unfinished projects, **전체 디깅** for all projects, and **기록 백업·청취 이력**. There is no new primary tab. The tools also offer explicit approval of recent Spotify plays; nothing is recorded just by opening that view.

## Safe migration from spottied

1. In the original spottied app's settings, export its schemaVersion 1 JSON backup. Keep that original backup.
2. In potcast, verify the intended Spotify account. Open Library → Artists → 기록 백업·청취 이력.
3. Choose the file under **백업 파일 미리보기**. Parsing, field validation, duplicate-ID checks, reference checks and a per-table preview happen before any write.
4. New records are selected, identical records are skipped, and conflicting IDs retain the existing value by default. Expand the comparison to inspect current and incoming fields. Approve each conflict explicitly if replacing it is intended. New records can also be deselected.
5. Press the button approving the selected changes. A single IndexedDB transaction applies them, validates the resulting references, rereads the changed fields and checks counts. A stale preview, broken selection, quota failure or verification failure aborts the entire transaction.
6. The completion message reports imported counts. Reimporting the unchanged file adds no duplicate records. Export a native potcast JSON backup after reviewing the result.

Legacy artist scopes (`album/single/compilation`), exclusions, genres, notes, half-star ratings, favorite dates, states, event IDs and original dates survive conversion. Imported projects use `studioOnly: false`, so the new default never shrinks the legacy scope. Missing/partial track lists remain incomplete. No historical completion date is fabricated, since spottied v1 does not contain completion snapshots. Credentials, auth state and recent-play caches are excluded by explicit field whitelists.

Native backups have `format: potcast-digging`, `schemaVersion: 1`, an account identifier and the eight domain tables. The UI identifies a different source account before approval. Legacy backups have no account identifier, so the UI asks the listener to verify ownership. Export/import transfers files between devices; a shared GitHub Pages origin is not synchronization.

## Storage and identity

`DigRepository` is a small asynchronous storage port without React, Spotify or IndexedDB types. `DigDatabase` implements it using Dexie in `potcast.digging.v1:<encoded account>`. Keep the database name stable and add Dexie schema versions for future migrations.

The tables separate artist projects, release memberships, cached catalogue snapshots, current track assertions, listen events, personal reviews and immutable completion snapshots. No cloud database or Life Hub service is added. All personal writes are local, so recording continues offline; cached artist/album/discography snapshots can also reconstruct the recording views on catalogue network failure. Offline snapshots do not claim current Spotify market playability.

Spotify `/me` supplies the account subject. Preview has its own database. A previously verified account may reopen offline only when a SHA-256 credential fingerprint matches the current stored session exactly. The binding contains no token. Authentication/permission errors, missing subjects, changed credentials and sign-out fail closed; the UI does not guess the last account. Switching accounts also closes personal editors, selections and import previews. If credentials rotate before a new binding is verified, one online verification is needed before a later offline reopen.

## Edition and completion policy

The existing `groupEditions` supplies candidate groups without changing the visible discography. Counting folds candidates only when both full sequences are known, artist credits and album type agree, and corresponding tracks agree on title, duration and credits. A single-track candidate requires the same Spotify ID. A manually included deluxe adds its bonus tracks while verified original tracks remain deduplicated. The same Spotify ID on multiple releases counts once. Different IDs on unrelated works are kept separate, even if a track's normalized title happens to match.

Verified edition aliases share the latest explicit review assertion, including resets to `none`. Aliasing never merges listen events, IDs, dates or personal reviews. Different IDs across unrelated releases cannot be proven to be one recording from album-track metadata alone; this intentionally conservative boundary may overcount such recordings. The implementation does not merge by title alone or infer missing ISRCs.

Full discovery of enabled release groups and complete target sequences are required for a 100% completion result. An incomplete catalogue cannot display 100%. An artist's reviewed/listened milestones independently preserve the completion date, exact release and track IDs, scope, studio setting and membership overrides. New releases update current progress without replacing past milestones.

## Life Hub album proposals

Claude can propose albums through Life Hub (`propose_album_listening`), either from conversation ("I listened to the whole album") or from a Spotify Extended Streaming History file the owner hands it. Background plays are not proposals: only albums the owner played intentionally, and only after the owner confirmed them to Claude album by album. Nothing reaches the records until the owner approves the album again here.

- **Connect** in the record tools drawer (only on the deployed app, not the preview). potcast is a public OAuth client (`public/lifehub-client.json`) with PKCE and receives `potcast:inbox` and `potcast:board` tokens for `/potcast` only (the second uploads the Life Board tiles; see the README's *Board tiles*). Life Hub returns to `public/lifehub/`, which hands the result to the library in this tab's `sessionStorage`; the app root stays reserved for the Spotify callback.
- **Review**: the album is resolved by Spotify album ID, then by a proposed track ID, then by an exact (normalised) name + artist search. Anything less is offered as a choice; tracks that match nothing are listed, never guessed. Every track can be set to listened, skipped or not recorded before approval.
- **Approve** writes through `DigService`: the album snapshot, one listen event per listened track (ID `lifehub:<proposal key>:<track id>`; source `spotify-sync` for history files, `manual` for conversation), listened states, and skipped states only for tracks that had no state (a skip never replaces "listened").
- **Receipts and rejections** are sent back on sync and retried until answered; receipts can be rebuilt from the listen events themselves. Rejecting changes no records.

**Hourly Spotify collection** (optional, set up in Life Hub at `/spotify`): Life Hub reads the recently-played list every hour and proposes albums played **from the album itself** (playlists, radio and autoplay never count), once a session has ended, with at least three distinct tracks. These arrive as `Spotify 자동 수집` (origin `spotify_sync`, key prefix `spotify:`) and are reviewed exactly like the others; their listen events use source `spotify-sync`.

**Claude conversation cards** (Life Hub cards stage 7): in Claude the owner can ask to review listened albums; Life Hub shows each pending album as a card with every track's 들음/건너뜀, editable, and an approve button. Sync now asks for open proposals (pending + approved in a card) and uses the owner's card edit. When the library opens, an approved album is recorded through the same `applyApproval` without asking only if no last check was asked, the setting 「Claude에서 승인된 항목 자동 반영」 (record tools drawer, default on) is on, the album resolves exactly, and every proposed track matched (`autoReady` in `src/lifehub/approve.ts`). Anything else waits in the drawer marked 「Claude 카드에서 승인함」.

The listened rule Claude applies to history files: `reason_end` = `trackdone`, or not skipped with at least two minutes played; everything else is "skipped" and only proposed when it helps the owner decide.

## Verification

- `npm run check`: typecheck, zero-warning lint, all existing/new Vitest tests and production build.
- `npm run test:e2e`: Playwright browser tests. Install Chromium with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed binary. `PLAYWRIGHT_OUTPUT_DIR` can direct test artifacts outside the checkout.
- Browser coverage: 320, 375, 390 and 430px portrait widths, touch landscape 844×390, desktop drawers, 2560px sticky artist composition, 15px mobile titles, durations/numbers/playing indicators, 44px controls, row geometry, focus restoration, offline editing, event preservation, batch undo, continued playback, explicit recent-play approval and JSON preview/conflict/idempotence.
- Direct baseline comparison: paused preview Now Playing at 1440×900 and 390×844, with a fixed playback clock, produced **zero differing pixels** against original main at both sizes. The relevant player geometry was identical as well.
- The existing Now Playing, curated translation, lyrics, notes, episode and Spotify engine suites remain part of `npm run check`.

Actual iPhone hardware/Safari and authenticated Spotify device playback were not available in this environment. Chromium verifies the requested iPhone viewport geometry, not WebKit-specific behavior. No user records or real OAuth credentials were used in verification. The existing production bundle-size advisory remains; this change does not rework the player or editorial assets to address that separate concern.
