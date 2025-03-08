# InfluxDB MCP Server

A Model Context Protocol (MCP) server that exposes access to an InfluxDB instance using the InfluxDB OSS API v2.

## Features

This MCP server provides:

- **Resources**: Access to organization, bucket, and measurement data
- **Tools**: Write data, execute queries, and manage database objects
- **Prompts**: Templates for common Flux queries and Line Protocol format

## Resources

The server exposes the following resources:

1. **Organizations List**: `influxdb://orgs`
   - Displays all organizations in the InfluxDB instance

2. **Buckets List**: `influxdb://buckets`
   - Shows all buckets with their metadata

3. **Bucket Measurements**: `influxdb://bucket/{bucketName}/measurements`
   - Lists all measurements within a specified bucket

4. **Query Data**: `influxdb://query/{orgName}/{fluxQuery}`
   - Executes a Flux query and returns results as a resource

## Tools

The server provides these tools:

1. `write-data`: Write time-series data in line protocol format
   - Parameters: org, bucket, data, precision (optional)

2. `query-data`: Execute Flux queries
   - Parameters: org, query

3. `create-bucket`: Create a new bucket
   - Parameters: name, orgID, retentionPeriodSeconds (optional)

4. `create-org`: Create a new organization
   - Parameters: name, description (optional)

## Prompts

The server offers these prompt templates:

1. `flux-query-examples`: Common Flux query examples
2. `line-protocol-guide`: Guide to InfluxDB line protocol format

## Configuration

The server requires these environment variables:

- `INFLUXDB_TOKEN` (required): Authentication token for the InfluxDB API
- `INFLUXDB_URL` (optional): URL of the InfluxDB instance (defaults to `http://localhost:8086`)
- `INFLUXDB_ORG` (optional): Default organization name for certain operations

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/influxdb-mcp-server.git
cd influxdb-mcp-server

# Install dependencies
npm install

# Run the server
INFLUXDB_TOKEN=your_token npm start
```

## Integration with Claude for Desktop

Add the server to your `claude_desktop_config.json`:

```json
{
  \"mcpServers\": {
    \"influxdb\": {
      \"command\": \"node\",
      \"args\": [\"/path/to/influxdb-mcp-server/src/index.js\"],
      \"env\": {
        \"INFLUXDB_TOKEN\": \"your_token\",
        \"INFLUXDB_URL\": \"http://localhost:8086\",
        \"INFLUXDB_ORG\": \"your_org\"
      }
    }
  }
}
```

## Testing

The repository includes comprehensive integration tests that:

1. Spin up a Docker container with InfluxDB
2. Populate it with sample data
3. Test all MCP server functionality

To run the tests:

```bash
npm test
```

## License

MIT
