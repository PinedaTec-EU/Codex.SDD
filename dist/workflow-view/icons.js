"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playIcon = playIcon;
exports.rewindIcon = rewindIcon;
exports.firstPhaseRewindIcon = firstPhaseRewindIcon;
exports.pauseIcon = pauseIcon;
exports.stopIcon = stopIcon;
exports.fileIcon = fileIcon;
exports.externalLinkIcon = externalLinkIcon;
exports.cameraIcon = cameraIcon;
exports.lockClosedIcon = lockClosedIcon;
exports.lockOpenIcon = lockOpenIcon;
exports.userPhaseIcon = userPhaseIcon;
exports.automationPhaseIcon = automationPhaseIcon;
exports.graphLayoutModeIcon = graphLayoutModeIcon;
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
function externalLinkIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.25 4a.75.75 0 0 0 0 1.5h3.19l-7.72 7.72a.75.75 0 1 0 1.06 1.06L18.5 6.56v3.19a.75.75 0 0 0 1.5 0V4.75A.75.75 0 0 0 19.25 4h-5Zm-7.5 3A2.75 2.75 0 0 0 4 9.75v7.5A2.75 2.75 0 0 0 6.75 20h7.5A2.75 2.75 0 0 0 17 17.25v-4a.75.75 0 0 0-1.5 0v4c0 .69-.56 1.25-1.25 1.25h-7.5c-.69 0-1.25-.56-1.25-1.25v-7.5c0-.69.56-1.25 1.25-1.25h4a.75.75 0 0 0 0-1.5h-4Z"></path>
    </svg>
  `;
}
function cameraIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9.7 4.5a1.75 1.75 0 0 0-1.43.74l-.82 1.16H6.25A3.25 3.25 0 0 0 3 9.65v7.1A3.25 3.25 0 0 0 6.25 20h11.5A3.25 3.25 0 0 0 21 16.75v-7.1a3.25 3.25 0 0 0-3.25-3.25h-1.2l-.82-1.16a1.75 1.75 0 0 0-1.43-.74H9.7Zm0 1.5h4.6c.08 0 .16.04.2.1l1.04 1.46c.28.4.74.64 1.23.64h1.98c.97 0 1.75.78 1.75 1.75v7.1c0 .97-.78 1.75-1.75 1.75H6.25c-.97 0-1.75-.78-1.75-1.75v-7.1c0-.97.78-1.75 1.75-1.75h1.98c.5 0 .95-.24 1.24-.64l1.03-1.45c.05-.07.12-.11.2-.11ZM12 8.75A4.25 4.25 0 1 0 12 17.25 4.25 4.25 0 0 0 12 8.75Zm0 1.5A2.75 2.75 0 1 1 12 15.75 2.75 2.75 0 0 1 12 10.25Z"></path>
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
function userPhaseIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Zm0 9c-4.13 0-7.5 2.54-7.5 5.67 0 .46.37.83.83.83h13.34c.46 0 .83-.37.83-.83 0-3.13-3.37-5.67-7.5-5.67Z"></path>
    </svg>
  `;
}
function automationPhaseIcon() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.13 2.63a1 1 0 0 1 1.74 0l.78 1.37a8.2 8.2 0 0 1 1.72.7l1.5-.44a1 1 0 0 1 1.23.56l.74 1.6a1 1 0 0 1-.24 1.2l-1.1 1.1c.08.4.12.8.12 1.21 0 .4-.04.8-.12 1.2l1.1 1.1a1 1 0 0 1 .24 1.21l-.74 1.6a1 1 0 0 1-1.22.56l-1.51-.44c-.54.3-1.11.53-1.72.7l-.78 1.37a1 1 0 0 1-1.74 0l-.78-1.37a8.2 8.2 0 0 1-1.72-.7l-1.5.44a1 1 0 0 1-1.23-.56l-.74-1.6a1 1 0 0 1 .24-1.2l1.1-1.1a6.34 6.34 0 0 1 0-2.42l-1.1-1.1a1 1 0 0 1-.24-1.21l.74-1.6a1 1 0 0 1 1.22-.56l1.51.44c.54-.3 1.11-.53 1.72-.7l.78-1.37ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"></path>
    </svg>
  `;
}
function graphLayoutModeIcon(layoutMode) {
    if (layoutMode === "horizontal") {
        return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 6A1.75 1.75 0 0 0 3 7.75v3.5C3 12.22 3.78 13 4.75 13h3.5C9.22 13 10 12.22 10 11.25v-.5h4v.5c0 .97.78 1.75 1.75 1.75h3.5C20.22 13 21 12.22 21 11.25v-3.5C21 6.78 20.22 6 19.25 6h-3.5C14.78 6 14 6.78 14 7.75v.5h-4v-.5C10 6.78 9.22 6 8.25 6h-3.5ZM4.5 7.75c0-.14.11-.25.25-.25h3.5c.14 0 .25.11.25.25v3.5a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25v-3.5Zm11 0c0-.14.11-.25.25-.25h3.5c.14 0 .25.11.25.25v3.5a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25v-3.5ZM9.75 16A1.75 1.75 0 0 0 8 17.75v1.5C8 20.22 8.78 21 9.75 21h4.5c.97 0 1.75-.78 1.75-1.75v-1.5c0-.97-.78-1.75-1.75-1.75h-4.5Zm-.25 1.75c0-.14.11-.25.25-.25h4.5c.14 0 .25.11.25.25v1.5a.25.25 0 0 1-.25.25h-4.5a.25.25 0 0 1-.25-.25v-1.5Z"></path>
      </svg>
    `;
    }
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.75 3A1.75 1.75 0 0 0 5 4.75v3.5C5 9.22 5.78 10 6.75 10h.5v4h-.5C5.78 14 5 14.78 5 15.75v3.5C5 20.22 5.78 21 6.75 21h3.5C11.22 21 12 20.22 12 19.25v-3.5c0-.97-.78-1.75-1.75-1.75h-.5v-4h4v4h-.5c-.97 0-1.75.78-1.75 1.75v3.5c0 .97.78 1.75 1.75 1.75h3.5c.97 0 1.75-.78 1.75-1.75v-3.5c0-.97-.78-1.75-1.75-1.75h-.5v-4h.5C18.22 10 19 9.22 19 8.25v-3.5C19 3.78 18.22 3 17.25 3h-3.5C12.78 3 12 3.78 12 4.75v.5H9.75v-.5C9.75 3.78 8.97 3 8 3h-1.25Zm-.25 1.75c0-.14.11-.25.25-.25h3.5c.14 0 .25.11.25.25v3.5a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25v-3.5Zm7 0c0-.14.11-.25.25-.25h3.5c.14 0 .25.11.25.25v3.5a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25v-3.5Zm-7 11c0-.14.11-.25.25-.25h3.5c.14 0 .25.11.25.25v3.5a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25v-3.5Zm7 0c0-.14.11-.25.25-.25h3.5c.14 0 .25.11.25.25v3.5a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25v-3.5Z"></path>
    </svg>
  `;
}
//# sourceMappingURL=icons.js.map