using SpecForge.Domain.Application;

namespace SpecForge.Domain.Tests;

public sealed class SpecBaselineSchemaValidatorTests
{
    [Fact]
    public void Validate_WithCompleteSpec_ReturnsValid()
    {
        var result = SpecBaselineSchemaValidator.Validate(CompleteSpec);

        Assert.True(result.IsValid);
        Assert.Empty(result.MissingSections);
        Assert.Empty(result.PlaceholderSections);
    }

    [Fact]
    public void Validate_WithMissingAndPlaceholderSections_ReturnsDetailedFailures()
    {
        const string invalidSpec = """
# Spec · US-0001 · v01

## History Log
- `2026-04-20T10:15:00Z` · Initial spec creation.

## State
- State: `pending_approval`
- Based on: `us.md`

## Spec Summary
Concrete baseline.

## Inputs
- Marketing editor provides localized article content.

## Outputs
- Article page renders localized content.

## Business Rules
- Locale must select the article variant.

## Edge Cases
- Missing locale falls back to repository default.

## Errors and Failure Modes
- Unknown slug returns not found.

## Constraints
- ...

## Detected Ambiguities
- Analytics tracking rule still needs explicit confirmation.

## Red Team
- Hidden scope could leak into unrelated content management work.

## Blue Team
- Keep the baseline bounded to persisted article rendering only.

## Acceptance Criteria
- [ ] ...
""";

        var result = SpecBaselineSchemaValidator.Validate(invalidSpec);

        Assert.False(result.IsValid);
        Assert.Contains("Constraints", result.PlaceholderSections);
        Assert.Contains("Acceptance Criteria", result.PlaceholderSections);
        Assert.Contains("Human Approval Questions", result.MissingSections);
    }

    private const string CompleteSpec = """
# Spec · US-0001 · v01

## History Log
- `2026-04-20T10:15:00Z` · Initial spec creation.

## State
- State: `pending_approval`
- Based on: `us.md`

## Spec Summary
Baseline for bilingual article publishing.

## Inputs
- Marketing editor publishes content in Spanish and English.

## Outputs
- Landing page renders the article in the requested locale.

## Business Rules
- Locale determines the rendered article variant.

## Edge Cases
- Missing locale falls back to the repository default locale.

## Errors and Failure Modes
- Unknown article slug returns a not-found response.

## Constraints
- Keep the first pass within the current repository.

## Detected Ambiguities
- Analytics tracking remains out of scope unless approved later.

## Red Team
- The request could overreach into content management workflows.

## Blue Team
- Keep scope bounded to persisted article rendering.

## Acceptance Criteria
- [ ] Articles can be selected by slug and locale.

## Human Approval Questions
- [x] Is the bilingual scope bounded enough for technical design?
  - Answer: Yes, keep it limited to persisted article rendering and locale selection.
  - Answered By: analyst
  - Answered At: 2026-04-20T10:20:00Z
""";
}
