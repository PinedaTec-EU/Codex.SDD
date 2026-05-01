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

    [Fact]
    public void RenderMarkdown_WrapsApprovalAnswersInHumanAnswerTags()
    {
        const string answer = "static\n- topK\nA < B & C";
        var document = new SpecDocument(
            Title: "Generated spec",
            HistoryLog: [],
            State: "pending_approval",
            BasedOn: "refinement.md",
            SpecSummary: "A valid spec baseline.",
            Inputs: ["A concrete source objective."],
            Outputs: ["A concrete spec artifact."],
            BusinessRules: ["The workflow must preserve the approved scope."],
            EdgeCases: ["Missing context should be surfaced explicitly."],
            ErrorsAndFailureModes: ["Invalid repository state should stop spec."],
            Constraints: ["Stay within the current repository."],
            DetectedAmbiguities: ["Non-functional targets remain explicit only when provided."],
            RedTeam: ["Implicit assumptions may still exist if the source is weak."],
            BlueTeam: ["Keep the spec executable and bounded."],
            AcceptanceCriteria: ["The spec is concrete enough for technical design."],
            HumanApprovalQuestions:
            [
                new SpecApprovalQuestionDocument(
                    "Should the validation error message be customizable or static?",
                    "resolved",
                    answer,
                    "Spec Analyst",
                    "2026-05-01T06:13:58.4821220+00:00")
            ]);

        var markdown = SpecJson.RenderMarkdown(document, "US-0001", version: 2);

        Assert.Contains("  - Answer:", markdown);
        Assert.Contains("    <specforge-human-answer>", markdown);
        Assert.Contains("    static", markdown);
        Assert.Contains("    - topK", markdown);
        Assert.Contains("    A &lt; B &amp; C", markdown);
        Assert.Contains("    </specforge-human-answer>", markdown);
        var parsed = SpecJson.Parse(markdown);
        var parsedQuestion = Assert.Single(parsed.HumanApprovalQuestions);
        Assert.Equal(answer, parsedQuestion.Answer);
        Assert.Equal("resolved", parsedQuestion.Status);
    }

    [Fact]
    public void ApprovalQuestionMarkdown_ParsesTaggedHumanAnswers()
    {
        const string markdown =
            """
            ## Human Approval Questions
            - [x] Should the validation error message be customizable or static?
              - Answer:
                <specforge-human-answer>
                static
                - topK
                A &lt; B &amp; C
                </specforge-human-answer>
              - Answered By: Spec Analyst
              - Answered At: 2026-05-01T06:13:58.4821220+00:00
            - [ ] Should unresolved questions remain pending?
            """;

        var items = ApprovalQuestionMarkdown.ParseFromMarkdown(markdown);

        Assert.Collection(
            items,
            item =>
            {
                Assert.True(item.Resolved);
                Assert.Equal("static\n- topK\nA < B & C", item.Answer);
                Assert.Equal("Spec Analyst", item.AnsweredBy);
            },
            item =>
            {
                Assert.False(item.Resolved);
                Assert.Null(item.Answer);
            });
    }
}
