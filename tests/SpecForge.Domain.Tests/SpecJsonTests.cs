using SpecForge.Domain.Application;

namespace SpecForge.Domain.Tests;

public sealed class SpecJsonTests
{
    [Fact]
    public void ParseCanonicalJson_NormalizesStructuredHistoryLogEntries_ToCanonicalStrings()
    {
        const string json =
            """
            {
              "title": "Generated spec",
              "historyLog": [
                {
                  "timestamp": "2026-04-23T01:21:33Z",
                  "actor": "system",
                  "message": "Initial spec baseline generated."
                },
                {
                  "entry": "User scope note preserved."
                }
              ],
              "state": "pending_approval",
              "basedOn": "refinement.md",
              "specSummary": "A valid spec baseline.",
              "inputs": ["A concrete source objective."],
              "outputs": ["A concrete spec artifact."],
              "businessRules": ["The workflow must preserve the approved scope."],
              "edgeCases": ["Missing context should be surfaced explicitly."],
              "errorsAndFailureModes": ["Invalid repository state should stop spec."],
              "constraints": ["Stay within the current repository."],
              "detectedAmbiguities": ["Non-functional targets remain explicit only when provided."],
              "redTeam": ["Implicit assumptions may still exist if the source is weak."],
              "blueTeam": ["Keep the spec executable and bounded."],
              "acceptanceCriteria": ["The spec is concrete enough for technical design."],
              "humanApprovalQuestions": [
                { "question": "Is the scope bounded enough for design?", "status": "pending" }
              ]
            }
            """;

        var document = SpecJson.ParseCanonicalJson(json);

        Assert.Equal(2, document.HistoryLog.Count);
        Assert.Equal("`2026-04-23T01:21:33Z` · system Initial spec baseline generated.", document.HistoryLog[0]);
        Assert.Equal("User scope note preserved.", document.HistoryLog[1]);
    }

    [Fact]
    public void ParseCanonicalJson_WhenApprovalAnswerExists_NormalizesQuestionToResolved()
    {
        const string json =
            """
            {
              "title": "Generated spec",
              "historyLog": [],
              "state": "pending_approval",
              "basedOn": "refinement.md",
              "specSummary": "A valid spec baseline.",
              "inputs": ["A concrete source objective."],
              "outputs": ["A concrete spec artifact."],
              "businessRules": ["The workflow must preserve the approved scope."],
              "edgeCases": ["Missing context should be surfaced explicitly."],
              "errorsAndFailureModes": ["Invalid repository state should stop spec."],
              "constraints": ["Stay within the current repository."],
              "detectedAmbiguities": ["Non-functional targets remain explicit only when provided."],
              "redTeam": ["Implicit assumptions may still exist if the source is weak."],
              "blueTeam": ["Keep the spec executable and bounded."],
              "acceptanceCriteria": ["The spec is concrete enough for technical design."],
              "humanApprovalQuestions": [
                {
                  "question": "Does the runtime inherit the persisted setting?",
                  "status": "pending",
                  "answer": "Yes, the runtime follows the persisted effective state.",
                  "answeredBy": "Spec Analyst",
                  "answeredAtUtc": "2024-05-21T10:00:00Z"
                }
              ]
            }
            """;

        var document = SpecJson.ParseCanonicalJson(json);

        var question = Assert.Single(document.HumanApprovalQuestions);
        Assert.Equal("resolved", question.Status);
        Assert.Empty(SpecJson.GetUnresolvedQuestions(document));
    }
}
