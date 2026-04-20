import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;
let debugLoggingEnabled = false;

export function getSpecForgeOutputChannel(): vscode.OutputChannel {
  outputChannel ??= vscode.window.createOutputChannel("SpecForge.AI");
  return outputChannel;
}

export function setSpecForgeDebugLoggingEnabled(enabled: boolean): void {
  debugLoggingEnabled = enabled;
}

export function isSpecForgeDebugLoggingEnabled(): boolean {
  return debugLoggingEnabled;
}

export function appendSpecForgeLog(message: string): void {
  getSpecForgeOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function appendSpecForgeDebugLog(message: string): void {
  if (!debugLoggingEnabled) {
    return;
  }

  appendSpecForgeLog(`[debug] ${message}`);
}

export function showSpecForgeOutput(preserveFocus = true): void {
  getSpecForgeOutputChannel().show(preserveFocus);
}
