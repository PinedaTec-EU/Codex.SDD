using SpecForge.Domain.Application;

namespace SpecForge.Domain.Tests;

public sealed class WorkflowArtifactMarkdownReaderTests
{
    [Theory]
    [InlineData("- Result: `pass`", "pass")]
    [InlineData("- Final result: pass", "pass")]
    [InlineData("- State: `passed`", "pass")]
    [InlineData("- State: failed", "fail")]
    [InlineData("- Result: `fail`", "fail")]
    public void ParseReviewResult_AcceptsCanonicalAndObservedReviewResultLines(string resultLine, string expected)
    {
        var markdown = string.Join(
            Environment.NewLine,
            [
                "## State",
                resultLine,
                string.Empty,
                "## Findings",
                "- Example finding."
            ]);

        var result = WorkflowArtifactMarkdownReader.ParseReviewResult(markdown);

        Assert.Equal(expected, result);
    }
}
