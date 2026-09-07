# vanity

`phaedrus.io` is a personal pointer page: one full-viewport screen with a name,
three links, and a quote colophon. Project and studio material belongs on Misty
Step. Read `VISION.md` when changing page scope or promoting content.

- Do not add a bio, project grid, or scrolling surface without an explicit
  operator request. The operator authors any future bio; do not invent claims
  or explanatory copy about the design.
- Local drafts, including `bio.md` and `explore/`, stay out of the deployable
  Git surface until explicitly promoted. Private Daybook material is not
  automatically public because this site consumes a generated quote pool.
- Preserve viewport fit, stable layout as quotes change, and reduced-motion
  behavior. Telemetry must never make the page it observes fragile.
- The pinned `@misty-step/aesthetic` package owns the design system. Change it
  upstream and deliberately update the release pin; do not inline or fork it.

## Public automation boundary

The existing Allie workflow and `.allie/manifest.yml` apply to this public site
only. Their non-redacted evidence policy does not authorize including private
records, local drafts, or private browser/session state in captures or model
inputs, and must not be reused as policy for private repositories.

`README.md` owns preview, check, and deployment procedures. Use HTTP for
delivery QA when root-relative assets or API routes matter; `file://` is only
a layout preview. Publishing requires an operator-authorized task.
