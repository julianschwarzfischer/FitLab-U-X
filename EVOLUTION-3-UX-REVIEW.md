# FITNESS LAB · Evolution 3 Premium UX
## Code-grounded design review and next acceptance gate

Basis: `dev/evolution-3-exercise-atlas` at `3072d9f`. This design phase starts from the existing premium anatomy/pose assets and deliberately leaves the canonical training, nutrition, coach and IndexedDB calculation functions unchanged.

## Implemented in this step

- `premium-ux.css` is a shared visual foundation for all five major user areas: Today, Nutrition, Training, Progress (subview of Today), and Profile.
- Unifies content hierarchy, spacing, cards, inputs, actions, selected bottom navigation, focus visibility, mobile density and reduced-motion behavior.
- Retains all existing brand-dependent colors by using CSS variables, and preserves existing anatomical graphics and exercise pose assets.
- Added cross-area 320px Playwright checks and reduced-motion / read-only regression checks. Existing tests remain in place.
- New stylesheet included in versioned service-worker offline resources.

## Verified in source, but still requiring visual user acceptance

**Today:** Daily cockpit renders focus cards, check-in, macro/water/training and contextual coach actions, but the dashboard has multiple wrappers. Confirm that the next action is visually obvious without scrolling.

**Nutrition:** Day selector, search/barcode, diary overview, manual macro form, recipes, favorites and water share one module. Current evolutionary wrappers conceal less-used entry surfaces but may still create long pages. Verify with native keyboard and one-handed use.

**Training:** Active session emphasizes current exercise and set. Exercise atlas, detailed technique guide and progress/history coexist. Keep the set booking action primary; do not let the premium graphics displace critical inputs.

**Progress:** Weekly review, detailed analytics and chart filters overlap by design. Keep the weekly takeaway before the reference charts; avoid presenting an isolated best set as a long-term trend.

**Profile:** Core goal, body, activity/training, calorie settings, display/avatar/white-label and backups are extensive. Preserve access, but prioritize everyday profile editing over rare branding and QA controls.

## Acceptance sequence — without another large Work cycle

1. Automated regression gate runs on development branch. Report CI status accurately; no green claim until run evidence is available.
2. Compare representative synthetic-state screenshots on 320 and 390px for all five major areas in light and dark appearance.
3. A *single* targeted iPhone video walkthrough after design consolidation, exercising entry, meal logging, training, progress and profile. Compare with the original video only after its actual frames/video are available.
4. Prioritize clearly demonstrated friction (navigation, typing, layout, missed actions) before further cosmetic changes.
5. Independent release-candidate review only after combined design, interaction and device checks.

## Known limits

- CSS consistency and automated viewport checks are not proof of a better user experience.
- Real iOS keyboard, installed PWA update, native camera and background resume need physical-device acceptance.
- Static illustrated exercise keyframes remain distinct from validated continuous biomechanical animation.
- No main branch or MASTER 6.0 release is authorized here.
