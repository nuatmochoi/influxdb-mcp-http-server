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

Available tools:

1. **`write-data`**: Write time-series data in line protocol format
2. **`query-data`**: Execute Flux queries
3. **`create-bucket`**: Create a new bucket
4. **`create-org`**: Create a new organization

## 📝 Prompts

Template prompts:

1. **`flux-query-examples`**: Common Flux query patterns
2. **`line-protocol-guide`**: InfluxDB line protocol format guide

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

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- HTTP transport based on MCP Streamable HTTP specification
- Original STDIO implementation inspired by various MCP server examples

---

**Need help?** Check the [Issues](https://github.com/nuatmochoi/influxdb-mcp-http-server/issues) page or create a new issue.