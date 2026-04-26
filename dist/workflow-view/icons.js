"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playIcon = playIcon;
exports.rewindIcon = rewindIcon;
exports.firstPhaseRewindIcon = firstPhaseRewindIcon;
exports.pauseIcon = pauseIcon;
exports.stopIcon = stopIcon;
exports.fileIcon = fileIcon;
exports.lockClosedIcon = lockClosedIcon;
exports.lockOpenIcon = lockOpenIcon;
function playIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.14v13.72c0 .72.78 1.17 1.4.8l10.2-6.86a.94.94 0 0 0 0-1.6L9.4 4.34A.94.94 0 0 0 8 5.14Z"></path>
    </svg>
  `;
}
function rewindIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M11.14 6.47a1 1 0 0 1 0 1.41L7.01 12l4.13 4.12a1 1 0 1 1-1.42 1.42l-4.83-4.83a1 1 0 0 1 0-1.42l4.83-4.83a1 1 0 0 1 1.42 0Zm8 0a1 1 0 0 1 0 1.41L15.01 12l4.13 4.12a1 1 0 1 1-1.42 1.42l-4.83-4.83a1 1 0 0 1 0-1.42l4.83-4.83a1 1 0 0 1 1.42 0Z"></path>
    </svg>
  `;
}
function firstPhaseRewindIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 5.25A1.25 1.25 0 0 1 7.25 4h.5A1.25 1.25 0 0 1 9 5.25v13.5A1.25 1.25 0 0 1 7.75 20h-.5A1.25 1.25 0 0 1 6 18.75V5.25Zm13.14 1.22a1 1 0 0 1 0 1.41L15.01 12l4.13 4.12a1 1 0 1 1-1.42 1.42l-4.83-4.83a1 1 0 0 1 0-1.42l4.83-4.83a1 1 0 0 1 1.42 0Z"></path>
    </svg>
  `;
}
function pauseIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z"></path>
    </svg>
  `;
}
function stopIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 14.5v-7Z"></path>
    </svg>
  `;
}
function fileIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 3A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V9.2a2.5 2.5 0 0 0-.73-1.77l-3.7-3.7A2.5 2.5 0 0 0 12.8 3H7.5Zm5.3 1.75c.2 0 .39.08.53.22l3.7 3.7c.14.14.22.33.22.53v9.3c0 .41-.34.75-.75.75h-9a.75.75 0 0 1-.75-.75v-13c0-.41.34-.75.75-.75h5.3Zm-3.55 6.5h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Zm0 3.5h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Z"></path>
    </svg>
  `;
}
function lockClosedIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8.5 10V8.25a3.5 3.5 0 1 1 7 0V10h.75A1.75 1.75 0 0 1 18 11.75v7.5A1.75 1.75 0 0 1 16.25 21h-8.5A1.75 1.75 0 0 1 6 19.25v-7.5A1.75 1.75 0 0 1 7.75 10h.75Zm1.5 0h4V8.25a2 2 0 1 0-4 0V10Z"></path>
    </svg>
  `;
}
function lockOpenIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M15 10V8.25a2 2 0 1 0-4 0 .75.75 0 0 1-1.5 0 3.5 3.5 0 1 1 7 0V10h.75A1.75 1.75 0 0 1 19 11.75v7.5A1.75 1.75 0 0 1 17.25 21h-8.5A1.75 1.75 0 0 1 7 19.25v-7.5A1.75 1.75 0 0 1 8.75 10H15Zm2.5 1.75A.25.25 0 0 0 17.25 11h-8.5a.25.25 0 0 0-.25.25v7.5c0 .14.11.25.25.25h8.5a.25.25 0 0 0 .25-.25v-7.5Z"></path>
    </svg>
  `;
}
//# sourceMappingURL=icons.js.map