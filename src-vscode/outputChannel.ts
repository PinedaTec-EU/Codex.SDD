import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

export function getSpecForgeOutputChannel(): vscode.OutputChannel {
  outputChannel ??= vscode.window.createOutputChannel("SpecForge.AI");
  return outputChannel;
}

export function appendSpecForgeLog(message: string): void {
  getSpecForgeOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function showSpecForgeOutput(preserveFocus = true): void {
  getSpecForgeOutputChannel().show(preserveFocus);
}
