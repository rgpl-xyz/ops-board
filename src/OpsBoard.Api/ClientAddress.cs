using System.Globalization;
using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.HttpOverrides;
using OpsBoard.Application.Assistant;

namespace OpsBoard.Api;

/// The visitor's network address. In the container stack the API sits behind
/// the web container's nginx, and on a server possibly behind another proxy,
/// so the address arrives in X-Forwarded-For. That header is believed only
/// from loopback and the networks in ForwardedHeaders:KnownNetworks, and for
/// at most ForwardedHeaders:ForwardLimit hops, so a visitor cannot choose
/// their own address.
public static class ClientAddress
{
    public static IServiceCollection AddClientAddress(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection("ForwardedHeaders");
        var limit = 1;
        if (section["ForwardLimit"] is { } limitText
            && (!int.TryParse(limitText, NumberStyles.Integer, CultureInfo.InvariantCulture, out limit) || limit < 1))
        {
            throw new InvalidOperationException("ForwardedHeaders:ForwardLimit must be a whole number of at least 1.");
        }

        var networks = (section["KnownNetworks"] ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(text => System.Net.IPNetwork.TryParse(text, out var network)
                ? network
                : throw new InvalidOperationException(
                    $"ForwardedHeaders:KnownNetworks entry '{text}' is not a network such as 10.0.0.0/8."))
            .ToList();

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
            options.ForwardLimit = limit;
            foreach (var network in networks)
            {
                options.KnownIPNetworks.Add(network);
            }
        });
        return services;
    }

    /// Outside Development the API normally sits behind a proxy. Without a
    /// trusted proxy network every visitor looks like that proxy, so all share
    /// one per-visitor allowance; nothing fails, so the log has to say it.
    public static void WarnIfNoProxyIsTrusted(this WebApplication app)
    {
        if (app.Services.GetRequiredService<AssistantSettings>().Enabled
            && !app.Environment.IsDevelopment()
            && string.IsNullOrWhiteSpace(app.Configuration["ForwardedHeaders:KnownNetworks"]))
        {
            app.Logger.LogWarning(
                "AI assistance is on, but ForwardedHeaders:KnownNetworks is not set. Behind a proxy, every visitor "
                + "then shares one allowance of new briefs. Set it, and ForwardedHeaders:ForwardLimit, to match the "
                + "proxies; see Client addresses in docs/deployment.md.");
        }
    }

    /// One key per address. An IPv6 visitor usually holds a whole /64, so the
    /// prefix counts as one visitor. Without an address, all requests share a key.
    public static string VisitorOf(IPAddress? address)
    {
        if (address is null)
        {
            return "unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return address.ToString();
        }

        var bytes = address.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return new IPAddress(bytes) + "/64";
    }
}
