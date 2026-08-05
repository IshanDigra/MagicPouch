## 2023-10-27 - Added ARIA labels to primary Action Buttons
**Learning:** Found multiple floating action buttons in the main application that were icon-only, lacking screen reader accessibility support.
**Action:** Always ensure any icon-only button contains an `aria-label` attribute and its internal `<i class="...">` has `aria-hidden="true"`.
