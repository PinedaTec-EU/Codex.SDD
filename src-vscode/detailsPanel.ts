import * as vscode from "vscode";
import type { UserStorySummary } from "./backendClient";
import { buildUserStoryDetailsHtml } from "./detailsView";

export async function showUserStoryDetails(summary: UserStorySummary): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "specForge.userStoryDetails",
    `${summary.usId} details`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: false
    }
  );

  panel.webview.html = buildHtml(summary);
  await Promise.resolve();
}

function buildHtml(summary: UserStorySummary): string {
  return buildUserStoryDetailsHtml(summary);
}
