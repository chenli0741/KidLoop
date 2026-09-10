# Driver pickup camera

2026-09-08 implementation, pending physical iPhone acceptance.

## Interaction

Only the driver trip page enables the icon-only camera entry. It appears between route details and the pickup manifest. A dialog opens a rear-camera live preview. Capture freezes the frame and stops the video tracks. Recognized faces show candidate student names; unmatched faces remain numbered and marked Unknown. Recognized eligible riders are checked by default and can be unchecked. Unknown faces have no manual identity selector and do not block confirmation. Retake and close remain available. Confirm pickup shows the selected count; when no pending riders are selected, Done closes without changing any status. Only Confirm pickup writes statuses, using one transaction and one captured device location for the selected group.

Recognition references include all riders in the displayed trip segment; only scheduled, non-absent, unclaimed riders can be confirmed for pickup. Shared assignments are claimed through the existing serialized claim path. A stale selection, already claimed child, completed segment, unauthorized trip or exceeded capacity fails the whole batch. Other drivers continue receiving the existing shared-manifest updates. No camera recognition result bypasses the final confirmation.

## Processing and data

YuNet detection and SFace embeddings run locally with ONNX Runtime Web WASM in a dedicated, per-scan Web Worker. This is not Apple Vision, Apple Intelligence or a native Apple recognition API. Models are served from `/models/pickup/`; runtime files are self-hosted under `/onnx/`, copied by postinstall. No external CDN is required. First use downloads approximately 50 MB. Runtime is pinned to 1.29.0; model checksums and original licenses accompany the files.

The app compares the captured image to authorized student photo URLs already used in the manifest. Reference images with zero/multiple faces and Test-account avatars are excluded. Cosine >= 0.40 and a >= 0.05 margin select a candidate; duplicate assignments are cleared. The looser threshold is intended for small, shadowed or partial-profile faces in a vehicle, while the margin still rejects ambiguous candidates. Thresholds are initial settings, not field-calibrated. No identity result has been tested on production children's photos during development.

Cabin image and embeddings remain transient in browser memory. Cancel/retake/unmount stops video, terminates the worker and discards state. Input/output tensors and decoded reference images are released after use; the worker and its WASM heap are discarded after completion. A 60-second scan deadline terminates stalled work while keeping the dialog usable. Reference image loads time out after 8 seconds; the optional belt request times out after 15 seconds without blocking pickup. No-face scans skip the larger SFace model. No album write, database image record or application image storage is used. Browser reference/model caching follows existing HTTP behavior.

Seatbelt assistance sends the frame and numbered normalized face boxes (no names or student reference photos) to the authenticated `/api/pickup-camera/seatbelts` endpoint. It checks the driver's trip, bounds payload size, strips metadata and calls OpenAI with `store:false`. The explanatory paragraph was removed from the camera dialog at user request; processing behavior is unchanged. KidLoop does not persist or log the image. `store:false` is not a promise about provider retention; provider account policy still applies.

`OPENAI_API_KEY` enables belt analysis; `OPENAI_PICKUP_VISION_MODEL` defaults to `gpt-4o-mini`. Results are VISIBLE / CHECK / UNCLEAR; a missing key or provider failure displays unavailable and does not block manual pickup confirmation. Visible means a belt was seen, not that its fit or restraint is certified. The per-process 5-second throttle prevents repeated taps but is not a distributed billing quota.

## Verification

- TypeScript, lint and production build.
- Matching tests: ambiguous, weak and duplicate identity rejection; affine alignment; detection suppression.
- Isolated local PostgreSQL: driver authorization, batch capacity rollback, competing-driver rejection, shared pickup and location-history behavior.
- Browser smoke: real model load and blank-tensor inference; mocked camera preview/capture, no-face Done without writes, retake and close. No production pickup writes.
- Still required: physical iPhone camera permissions, real vehicle lighting/angles, speed and recognition usefulness, and actual provider seatbelt output. Do not describe desktop checks as iPhone acceptance.

Speech remains a separate deferred task in `docs/pending-local-speech.md`.

## Temporary photo-library test entry

An image icon sits beside the camera entry and in the camera dialog. In the iPhone App it calls the native photo-library source directly, with no app source-selection menu. Web uses the browser's image-file chooser; any system-provided chooser options are controlled by the browser/OS. Selecting a photo compresses it locally and feeds the same recognition/confirmation flow without opening the camera or uploading to the student-photo store. Cancel leaves the current scan unchanged. The existing final confirmation is still required to write Pickup.

Enabled for testing by default. Set `NEXT_PUBLIC_PICKUP_GALLERY_ENABLED=false` and rebuild/redeploy to hide both image buttons. Native album selection still needs physical iPhone acceptance.

### Photo-library read compatibility

Native selection now requests JPEG Base64 content from the camera bridge instead of requesting a URI and fetching its temporary `webPath` from the remotely hosted WebView. This removes the temporary-file URL dependency. Native plugin unavailability is reported separately and does not fall back to a source menu. Byte conversion and invalid/oversized response tests pass; the reported device failure still requires an iPhone retry to establish whether the cause was URI reading or native plugin availability.

### Recognition candidate scope correction

Recognition now uses every rider in the displayed segment, including picked-up and dropped-off riders. Previously the detector ran but reference matching received an empty list whenever no scheduled riders remained. Identity labels and eligible pickup selection are now separate: non-pending riders can be labeled but cannot be submitted again. Final server-side status/ownership/capacity checks remain unchanged. Missing photos, demo avatars, load failures, no reference face, multiple reference faces and processing failures are reported separately, alongside matched-face and usable-reference counts.

## 2026-09-09 waiting and confirmation correction

The reported 14:41 error screen does not establish its device-side cause. Production requests around the screenshot returned HTTP 200; the error log contained PostgreSQL deprecation warnings, not a failed camera API request. Previous recognition ran on the page thread and lacked a scan deadline and explicit per-inference tensor disposal. The new worker isolation, timeout and resource cleanup address those verified weaknesses; physical iPhone reproduction is still pending.

Chrome and WebKit passed actual YuNet worker loading and no-face processing, plus deterministic partial-recognition confirmation against an isolated database. One matched and one unknown face allowed confirming only the matched child. No production pickup statuses were changed by verification. Worker success, cancellation, deadline and pre-canceled requests are covered by regression tests. Completed/absent/already claimed riders remain protected by existing server checks.
