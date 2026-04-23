using SpecForge.Domain.Application;

namespace SpecForge.Domain.Tests;

public sealed class RefinementSpecJsonTests
{
    [Fact]
    public void ParseCanonicalJson_NormalizesStructuredHistoryLogEntries_ToCanonicalStrings()
    {
        const string json =
            """
            {
              "title": "Generated refinement",
              "historyLog": [
                {
                  "timestamp": "2026-04-23T01:21:33Z",
                  "actor": "system",
                  "message": "Initial refinement baseline generated."
                },
                {
                  "entry": "User scope note preserved."
                }
              ],
              "state": "pending_approval",
              "basedOn": "clarification.md",
              "specSummary": "A valid refinement baseline.",
              "inputs": ["A concrete source objective."],
              "outputs": ["A concrete refinement artifact."],
              "businessRules": ["The workflow must preserve the approved scope."],
              "edgeCases": ["Missing context should be surfaced explicitly."],
              "errorsAndFailureModes": ["Invalid repository state should stop refinement."],
              "constraints": ["Stay within the current repository."],
              "detectedAmbiguities": ["Non-functional targets remain explicit only when provided."],
              "redTeam": ["Implicit assumptions may still exist if the source is weak."],
              "blueTeam": ["Keep the refinement executable and bounded."],
              "acceptanceCriteria": ["The spec is concrete enough for technical design."],
              "humanApprovalQuestions": [
                { "question": "Is the scope bounded enough for design?", "status": "pending" }
              ]
            }
            """;

        var document = RefinementSpecJson.ParseCanonicalJson(json);

        Assert.Equal(2, document.HistoryLog.Count);
        Assert.Equal("`2026-04-23T01:21:33Z` · system Initial refinement baseline generated.", document.HistoryLog[0]);
        Assert.Equal("User scope note preserved.", document.HistoryLog[1]);
    }
}
