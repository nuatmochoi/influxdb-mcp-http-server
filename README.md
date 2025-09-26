# InfluxDB MCP Server with HTTP Support

A Model Context Protocol (MCP) server for InfluxDB that supports both **STDIO** and **HTTP/SSE** transports. This allows deployment as a web service accessible via HTTP endpoints.

## 🚀 Features

This enhanced MCP server provides:

- **Dual Transport Support**:
  - Traditional STDIO transport for Claude Desktop
  - HTTP/SSE transport for web deployment and remote access
- **Resources**: Access to organization, bucket, and measurement data
- **Tools**: Write data, execute queries, and manage database objects
- **Prompts**: Templates for common Flux queries and Line Protocol format
- **Web Security**: CORS protection, Origin validation, DNS rebinding prevention

## 🌐 HTTP Transport Features

### Endpoints
- **`/mcp`** - Main MCP protocol endpoint (POST/GET)
- **`/health`** - Health check endpoint
- **`/`** - Server information and documentation

### Supported Features
- **JSON-RPC 2.0** protocol compliance
- **Server-Sent Events (SSE)** for streaming responses
- **CORS** security with configurable origins
- **Session management** for stateful connections
- **Multiple response formats**: JSON and streaming

## 📋 Resources

The server exposes these resources:

1. **Organizations List**: `influxdb://orgs`
2. **Buckets List**: `influxdb://buckets`
3. **Bucket Measurements**: `influxdb://bucket/{bucketName}/measurements`
4. **Query Data**: `influxdb://query/{orgName}/{fluxQuery}`

## 🔧 Tools

### Data Operations

1. **`write-data`**: Write time-series data using InfluxDB line protocol
   - **Purpose**: Insert time-series data points into InfluxDB
   - **Format**: `measurement[,tag_set] field_set [timestamp]`
   - **Example**: `temperature,location=office,sensor=A temp=23.5 1609459200000000000`
   - **Parameters**:
     - `org`: Organization name (workspace)
     - `bucket`: Bucket name (data container)
     - `data`: Line protocol formatted data (single line or batch)
     - `precision`: Optional timestamp precision (ns/us/ms/s)

2. **`query-data`**: Execute Flux queries to retrieve and analyze data
   - **Purpose**: Query and analyze time-series data using Flux language
   - **Example**: `from(bucket: "sensors") |> range(start: -1h) |> filter(fn: (r) => r._measurement == "temperature")`
   - **Parameters**:
     - `org`: Organization name containing the data
     - `query`: Flux query string (starts with `from()` function)
   - **Returns**: CSV-formatted query results

### Administrative Operations

3. **`create-bucket`**: Create data containers with retention policies
   - **Purpose**: Create buckets to organize and store time-series data
   - **Use Cases**: Separate environments (dev/prod), data types, retention needs
   - **Parameters**:
     - `name`: Unique bucket name (e.g., "sensors-prod", "metrics-dev")
     - `orgID`: Organization ID (from organization list)
     - `retentionPeriodSeconds`: Optional auto-deletion period (3600=1h, 86400=1d)

4. **`create-org`**: Create organizational workspaces
   - **Purpose**: Create logical workspaces for multi-tenancy and access control
   - **Use Cases**: Company divisions, teams, projects, environments
   - **Parameters**:
     - `name`: Unique organization name (e.g., "my-company", "dev-team")
     - `description`: Optional purpose description

## 📝 Prompts

Template prompts:

1. **`flux-query-examples`**: Common Flux query patterns and examples
2. **`line-protocol-guide`**: Complete guide to InfluxDB line protocol format

## 📚 Usage Examples

### Basic Data Workflow

```bash
# 1. Create organization
curl -X POST http://127.0.0.1:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create-org",
      "arguments": {
        "name": "my-company",
        "description": "Production monitoring organization"
      }
    }
  }'

# 2. Create bucket (use orgID from previous response)
curl -X POST http://127.0.0.1:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "create-bucket",
      "arguments": {
        "name": "sensors",
        "orgID": "YOUR_ORG_ID_HERE",
        "retentionPeriodSeconds": 2592000
      }
    }
  }'

# 3. Write data
curl -X POST http://127.0.0.1:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "write-data",
      "arguments": {
        "org": "my-company",
        "bucket": "sensors",
        "data": "temperature,location=office,sensor=A temp=23.5,humidity=65.2\ntemperature,location=warehouse,sensor=B temp=18.3,humidity=72.1"
      }
    }
  }'

# 4. Query data
curl -X POST http://127.0.0.1:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "query-data",
      "arguments": {
        "org": "my-company",
        "query": "from(bucket: \"sensors\") |> range(start: -1h) |> filter(fn: (r) => r._measurement == \"temperature\")"
      }
    }
  }'
```

### Line Protocol Examples

```
# Simple measurement
temperature value=23.5

# With tags
temperature,location=office,sensor=A value=23.5

# With multiple fields
weather,location=office temp=23.5,humidity=65.2,pressure=1013.25

# With timestamp (nanoseconds)
temperature,location=office value=23.5 1609459200000000000

# Batch write (multiple lines)
temperature,location=office value=23.5 1609459200000000000
temperature,location=warehouse value=18.3 1609459260000000000
humidity,location=office value=65.2 1609459200000000000
```

### Common Flux Query Patterns

```flux
# Basic range query
from(bucket: "sensors")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "temperature")

# Aggregation over time windows
from(bucket: "sensors")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "temperature")
  |> aggregateWindow(every: 1h, fn: mean)

# Filter by tags and group by location
from(bucket: "sensors")
  |> range(start: -6h)
  |> filter(fn: (r) => r._measurement == "temperature")
  |> filter(fn: (r) => r.location != "")
  |> group(columns: ["location"])
  |> mean()

# Multiple measurements
from(bucket: "sensors")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "temperature" or r._measurement == "humidity")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

## ⚙️ Configuration

Required environment variables:

- **`INFLUXDB_TOKEN`** (required): InfluxDB authentication token
- **`INFLUXDB_URL`** (optional): InfluxDB instance URL (default: `http://localhost:8086`)
- **`INFLUXDB_ORG`** (optional): Default organization name

Optional HTTP server variables:

- **`PORT`** (optional): HTTP server port (default: `3001`)
- **`HOST`** (optional): HTTP server host (default: `127.0.0.1`)

## 🚀 Installation & Usage

### Option 1: HTTP Server Deployment

```bash
# Clone the repository
git clone https://github.com/nuatmochoi/influxdb-mcp-http-server.git
cd influxdb-mcp-http-server

# Install dependencies
npm install

# Set environment variables
export INFLUXDB_TOKEN=your_token_here
export INFLUXDB_URL=http://localhost:8086
export INFLUXDB_ORG=your_org_name

# Start HTTP server
npm run start:http
```

The server will be available at:
- **Main endpoint**: http://127.0.0.1:3001/mcp
- **Health check**: http://127.0.0.1:3001/health
- **Server info**: http://127.0.0.1:3001/

### Option 2: Traditional STDIO Mode

```bash
# For Claude Desktop integration
npm start
```

### Option 3: Docker Deployment

```bash
# Build Docker image
docker build -t influxdb-mcp-http .

# Run with environment variables
docker run -p 3001:3001 \
  -e INFLUXDB_TOKEN=your_token \
  -e INFLUXDB_URL=http://your-influxdb:8086 \
  influxdb-mcp-http
```

## 🔌 Integration Examples

### Claude Desktop (STDIO)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "influxdb": {
      "command": "node",
      "args": ["/path/to/influxdb-mcp-http-server/src/index.js"],
      "env": {
        "INFLUXDB_TOKEN": "your_token",
        "INFLUXDB_URL": "http://localhost:8086",
        "INFLUXDB_ORG": "your_org"
      }
    }
  }
}
```

### HTTP Client Integration

```javascript
// Example HTTP client request
const response = await fetch('http://127.0.0.1:3001/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  })
});

const result = await response.json();
console.log(result);
```

### Remote Access Setup

For production deployment, update CORS settings in `src/http-server.js`:

```javascript
const allowedOrigins = [
  'https://your-domain.com',
  'https://app.your-domain.com'
];
```

## 🔒 Security Considerations

The HTTP server includes several security features:

- **CORS Protection**: Configurable allowed origins
- **Origin Validation**: Prevents DNS rebinding attacks
- **Local Binding**: Default binding to 127.0.0.1 (localhost only)
- **No Token Exposure**: All credentials via environment variables

For production deployment:
1. Use HTTPS with proper SSL certificates
2. Configure firewall rules appropriately
3. Update CORS origins for your domain
4. Consider adding rate limiting
5. Use strong authentication tokens

## 📁 Code Structure

```
src/
├── index.js                 # STDIO server entry point
├── http-server.js           # HTTP server entry point (NEW)
├── utils/
│   ├── httpTransport.js     # HTTP transport implementation (NEW)
│   ├── influxClient.js      # InfluxDB API client
│   └── loggerConfig.js      # Logger configuration
├── config/
│   └── env.js              # Environment configuration
├── handlers/                # MCP request handlers
│   ├── organizationsHandler.js
│   ├── bucketsHandler.js
│   ├── measurementsHandler.js
│   ├── queryHandler.js
│   └── *Tool.js            # Tool implementations
└── prompts/                # Prompt templates
    ├── fluxQueryExamplesPrompt.js
    └── lineProtocolGuidePrompt.js
```

## 🧪 Testing

Run the test suite:

```bash
# Unit and integration tests
npm test

# Test HTTP server (requires Docker)
npm run start:http &
curl http://127.0.0.1:3001/health
```

## 📚 API Documentation

### Health Check
```bash
GET /health
# Response: {"status":"healthy","service":"influxdb-mcp-server"}
```

### Server Information
```bash
GET /
# Response: Server metadata and endpoint information
```

### MCP Protocol
```bash
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "test-client"}
  }
}
```

## 🔄 Version History

- **v0.1.1**: HTTP/SSE transport support added
- **v0.1.0**: Initial STDIO-only version

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **Original InfluxDB MCP Server**: Created by [Sam Coward (idoru)](https://github.com/idoru/influxdb-mcp-server)
- **HTTP Transport Extensions**: Added by nuatmochoi
- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- HTTP transport based on MCP Streamable HTTP specification

---

**Need help?** Check the [Issues](https://github.com/nuatmochoi/influxdb-mcp-http-server/issues) page or create a new issue.