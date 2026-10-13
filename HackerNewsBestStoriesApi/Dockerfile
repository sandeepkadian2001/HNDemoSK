# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project files and restore dependencies
COPY ["src/HackerNewsBestStoriesApi/HackerNewsBestStoriesApi.csproj", "src/HackerNewsBestStoriesApi/"]
COPY ["tests/HackerNewsBestStoriesApi.Tests/HackerNewsBestStoriesApi.Tests.csproj", "tests/HackerNewsBestStoriesApi.Tests/"]
RUN dotnet restore "src/HackerNewsBestStoriesApi/HackerNewsBestStoriesApi.csproj"

# Copy full source and build
COPY . .
WORKDIR "/src/src/HackerNewsBestStoriesApi"
RUN dotnet build "HackerNewsBestStoriesApi.csproj" -c Release -o /app/build

# Publish stage
FROM build AS publish
RUN dotnet publish "HackerNewsBestStoriesApi.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Final runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

ENV ASPNETCORE_URLS="http://+:8080"
ENV ASPNETCORE_ENVIRONMENT="Production"

COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "HackerNewsBestStoriesApi.dll"]
