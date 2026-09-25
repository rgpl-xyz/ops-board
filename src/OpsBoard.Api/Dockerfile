# Build from the repository root: docker build -f src/OpsBoard.Api/Dockerfile .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo

COPY global.json Directory.Build.props ./
COPY .config/dotnet-tools.json .config/
RUN dotnet tool restore

COPY src/ src/
RUN dotnet restore src/OpsBoard.Api/OpsBoard.Api.csproj
RUN dotnet publish src/OpsBoard.Api/OpsBoard.Api.csproj -c Release --no-restore -o /app/publish
# Applies the schema from the same image, without shipping the SDK. The
# design-time factory needs a connection string to construct the context; the
# bundle reads the real one from the environment when it runs.
RUN ConnectionStrings__OpsBoard="Host=unused" dotnet ef migrations bundle \
      --project src/OpsBoard.Infrastructure \
      --startup-project src/OpsBoard.Api \
      --configuration Release \
      --output /app/efbundle

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY --from=build /app/efbundle .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "OpsBoard.Api.dll"]
