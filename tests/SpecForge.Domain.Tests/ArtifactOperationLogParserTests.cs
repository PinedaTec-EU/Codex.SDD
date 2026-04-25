using SpecForge.Domain.Application;

namespace SpecForge.Domain.Tests;

public sealed class ArtifactOperationLogParserTests
{
    [Fact]
    public void Parse_ExtractsSourceResultContextAndPrompt()
    {
        const string markdown = """
            # Artifact Operation Log · implementation

            This file records direct model-assisted operations over the current artifact.

            ## 2026-04-25T10:00:00.0000000+00:00 · `alice`

            - Source Artifact: `/tmp/03-implementation.md`
            - Result Artifact: `/tmp/03-implementation.v02.md`
            - Context Artifacts:
              - `/tmp/04-review.md`
            - Prompt:
            ```text
            Apply the review fixes.
            ```
            """;

        var entry = Assert.Single(ArtifactOperationLogParser.Parse(markdown));

        Assert.Equal("2026-04-25T10:00:00.0000000+00:00", entry.TimestampUtc);
        Assert.Equal("alice", entry.Actor);
        Assert.Equal("/tmp/03-implementation.md", entry.SourceArtifactPath);
        Assert.Equal("/tmp/03-implementation.v02.md", entry.ResultArtifactPath);
        Assert.Equal(["/tmp/04-review.md"], entry.ContextArtifactPaths);
        Assert.Equal("Apply the review fixes.", entry.Prompt);
    }
}
