## 2023-10-27 - Added ARIA labels to primary Action Buttons
**Learning:** Found multiple floating action buttons in the main application that were icon-only, lacking screen reader accessibility support.
**Action:** Always ensure any icon-only button contains an `aria-label` attribute and its internal `<i class="...">` has `aria-hidden="true"`.

## 2023-11-20 - Modernized layout and aesthetics
**Learning:** Found elements like the search bar, FAB buttons, empty states, and nav items to be looking a bit dated.
**Action:** Replaced hard shadows with subtle `shadow-sm`, squared off pills and squircles (`rounded-2xl`) for key elements, updated empty state to feature a soft center-aligned card, and added interactive scale hovers.
