namespace SpecForge.OpenAICompatible;

public static class LocalEndpointHelper
{
    public static bool IsLocal(string baseUrl)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var parsed))
        {
            return false;
        }

        return parsed.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
               || parsed.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
               || parsed.Host.Equals("0.0.0.0", StringComparison.OrdinalIgnoreCase)
               || parsed.Host.Equals("::1", StringComparison.OrdinalIgnoreCase);
    }
}
