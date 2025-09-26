#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Import config
import { validateEnvironment } from "./config/env.js";

// Import utilities
import { configureLogger } from "./utils/loggerConfig.js";
import { HttpTransport } from "./utils/httpTransport.js";

// Import resource handlers
import { listOrganizations } from "./handlers/organizationsHandler.js";
import { listBuckets } from "./handlers/bucketsHandler.js";
import { bucketMeasurements } from "./handlers/measurementsHandler.js";
import { executeQuery } from "./handlers/queryHandler.js";

// Import tool handlers
import { writeData } from "./handlers/writeDataTool.js";
import { queryData } from "./handlers/queryDataTool.js";
import { createBucket } from "./handlers/createBucketTool.js";
import { createOrg } from "./handlers/createOrgTool.js";
import { listDatabases } from "./handlers/listDatabasesTool.js";
import { healthCheck } from "./handlers/healthCheckTool.js";
import { getMeasurements } from "./handlers/getMeasurementsTool.js";
import { getMeasurementSchema } from "./handlers/getMeasurementSchemaTool.js";
import { getBucketInfo } from "./handlers/getBucketInfoTool.js";
import { getTagValues } from "./handlers/getTagValuesTool.js";

// Import prompt handlers
import { fluxQueryExamplesPrompt } from "./prompts/fluxQueryExamplesPrompt.js";
import { lineProtocolGuidePrompt } from "./prompts/lineProtocolGuidePrompt.js";

// Configure logger and validate environment
configureLogger();
validateEnvironment();

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all interfaces for deployment

// Create Express app
const app = express();

// CORS configuration - be restrictive for security
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow localhost for development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

    // Add your production domains here
    const allowedOrigins = [
      'https://your-domain.com'
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Create MCP server instance
const server = new McpServer({
  name: "InfluxDB",
  version: "0.1.1",
});

// Register resources
server.resource("orgs", "influxdb://orgs", listOrganizations);
server.resource("buckets", "influxdb://buckets", listBuckets);

// Register tools
server.tool(
  "write-data",
  {
    org: z.string().describe("The organization name"),
    bucket: z.string().describe("The bucket name"),
    data: z.string().describe("Data in InfluxDB line protocol format"),
    precision: z.enum(["ns", "us", "ms", "s"]).optional().describe(
      "Timestamp precision (ns, us, ms, s)",
    ),
  },
  writeData,
);

server.tool(
  "query-data",
  {
    org: z.string().describe("The organization name"),
    query: z.string().describe("Flux query string"),
  },
  queryData,
);

server.tool(
  "create-bucket",
  {
    name: z.string().describe("The bucket name"),
    orgID: z.string().describe("The organization ID"),
    retentionPeriodSeconds: z.number().optional().describe(
      "Retention period in seconds (optional)",
    ),
  },
  createBucket,
);

server.tool(
  "create-org",
  {
    name: z.string().describe("The organization name"),
    description: z.string().optional().describe(
      "Organization description (optional)",
    ),
  },
  createOrg,
);

// Register prompts
server.prompt("flux-query-examples", {}, fluxQueryExamplesPrompt);
server.prompt("line-protocol-guide", {}, lineProtocolGuidePrompt);

// Create HTTP transport
const httpTransport = new HttpTransport();

// Configure MCP server to handle HTTP requests
httpTransport.messageHandler = async (message) => {
  try {
    if (message.method === 'initialize') {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          serverInfo: {
            name: "InfluxDB MCP Server",
            version: "0.1.1"
          }
        }
      };
    }

    if (message.method === 'tools/list') {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            {
              name: "write-data",
              description: "Write time-series data to InfluxDB using line protocol format. Line protocol is a text-based format for writing points to InfluxDB. Format: 'measurement,tag1=value1,tag2=value2 field1=value1,field2=value2 [timestamp]'. Example: 'temperature,location=office,sensor=A temp=23.5 1609459200000000000'",
              inputSchema: {
                type: "object",
                properties: {
                  org: {
                    type: "string",
                    description: "InfluxDB organization name (logical workspace for users, buckets, and resources)"
                  },
                  bucket: {
                    type: "string",
                    description: "InfluxDB bucket name (container for time-series data with retention policy)"
                  },
                  data: {
                    type: "string",
                    description: "Data in InfluxDB line protocol format. Each line represents one data point. Format: 'measurement[,tag_set] field_set [timestamp]'. Multiple lines separated by newlines for batch writes."
                  },
                  precision: {
                    type: "string",
                    enum: ["ns", "us", "ms", "s"],
                    description: "Timestamp precision: 'ns' (nanoseconds), 'us' (microseconds), 'ms' (milliseconds), 's' (seconds). Defaults to nanoseconds if not specified."
                  }
                },
                required: ["org", "bucket", "data"]
              }
            },
            {
              name: "query-data",
              description: "Execute Flux queries to retrieve and analyze time-series data from InfluxDB. Flux is InfluxDB's functional data scripting language for querying, analyzing, and acting on time-series data. Supports filtering, aggregation, transformations, and more. Example query: 'from(bucket: \"my-bucket\") |> range(start: -1h) |> filter(fn: (r) => r._measurement == \"temperature\")'",
              inputSchema: {
                type: "object",
                properties: {
                  org: {
                    type: "string",
                    description: "InfluxDB organization name that contains the data to query"
                  },
                  query: {
                    type: "string",
                    description: "Flux query string. Must start with from() function to specify bucket. Common patterns: range() for time filtering, filter() for field/tag filtering, aggregateWindow() for downsampling, group() for grouping data. Returns CSV-formatted results."
                  }
                },
                required: ["org", "query"]
              }
            },
            {
              name: "create-bucket",
              description: "Create a new InfluxDB bucket (data container). Buckets are containers for time-series data with configurable retention policies. Each bucket belongs to an organization and stores measurements with automatic data expiration based on retention rules. Used to organize and manage data lifecycle.",
              inputSchema: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Unique bucket name within the organization. Use descriptive names like 'sensors-prod', 'metrics-dev', etc."
                  },
                  orgID: {
                    type: "string",
                    description: "Organization ID (not name) that will own this bucket. Get this from the organizations list or create-org response."
                  },
                  retentionPeriodSeconds: {
                    type: "number",
                    description: "Optional data retention period in seconds. Data older than this will be automatically deleted. Examples: 3600 (1 hour), 86400 (1 day), 2592000 (30 days). If not specified, data is kept indefinitely."
                  }
                },
                required: ["name", "orgID"]
              }
            },
            {
              name: "create-org",
              description: "Create a new InfluxDB organization (workspace). Organizations are logical workspaces that contain users, buckets, dashboards, and other resources. They provide multi-tenancy and access control. Each organization has its own isolated data and user management. Typically represents a company, team, or project.",
              inputSchema: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Unique organization name. Use descriptive names like 'my-company', 'dev-team', 'production-env'. Must be unique across the InfluxDB instance."
                  },
                  description: {
                    type: "string",
                    description: "Optional human-readable description of the organization's purpose, team, or use case. Example: 'Production monitoring for web services'"
                  }
                },
                required: ["name"]
              }
            },
            {
              name: "list-databases",
              description: "List all InfluxDB buckets/databases with metadata information including retention policies, creation dates, and basic statistics.",
              inputSchema: {
                type: "object",
                properties: {},
                required: []
              }
            },
            {
              name: "health-check",
              description: "Check InfluxDB server connection, health status, version information, and response time. Useful for monitoring and troubleshooting.",
              inputSchema: {
                type: "object",
                properties: {},
                required: []
              }
            },
            {
              name: "get-measurements",
              description: "List all measurements (tables) in a specific bucket. Shows what data is available for querying in the last 30 days.",
              inputSchema: {
                type: "object",
                properties: {
                  org: {
                    type: "string",
                    description: "Organization name that contains the bucket"
                  },
                  bucket: {
                    type: "string",
                    description: "Bucket name to list measurements from"
                  }
                },
                required: ["org", "bucket"]
              }
            },
            {
              name: "get-measurement-schema",
              description: "Get detailed schema information for a specific measurement including all field keys (values) and tag keys (indexed metadata) with usage examples.",
              inputSchema: {
                type: "object",
                properties: {
                  org: {
                    type: "string",
                    description: "Organization name"
                  },
                  bucket: {
                    type: "string",
                    description: "Bucket name containing the measurement"
                  },
                  measurement: {
                    type: "string",
                    description: "Measurement name to get schema for"
                  }
                },
                required: ["org", "bucket", "measurement"]
              }
            },
            {
              name: "get-bucket-info",
              description: "Get comprehensive information about a specific bucket including configuration, retention policy, statistics, and creation details.",
              inputSchema: {
                type: "object",
                properties: {
                  bucketName: {
                    type: "string",
                    description: "Name of the bucket to get information for"
                  },
                  org: {
                    type: "string",
                    description: "Organization name (used for statistics queries)"
                  }
                },
                required: ["bucketName", "org"]
              }
            },
            {
              name: "get-tag-values",
              description: "Get all unique values for a specific tag key, optionally filtered by measurement. Useful for discovering available filter options.",
              inputSchema: {
                type: "object",
                properties: {
                  org: {
                    type: "string",
                    description: "Organization name"
                  },
                  bucket: {
                    type: "string",
                    description: "Bucket name to search in"
                  },
                  tagKey: {
                    type: "string",
                    description: "Tag key to get values for (e.g., 'location', 'sensor', 'host')"
                  },
                  measurement: {
                    type: "string",
                    description: "Optional: specific measurement to filter by"
                  }
                },
                required: ["org", "bucket", "tagKey"]
              }
            }
          ]
        }
      };
    }

    if (message.method === 'tools/call') {
      const { name, arguments: args } = message.params;

      try {
        let result;
        switch (name) {
          case 'write-data':
            result = await writeData(args);
            break;
          case 'query-data':
            result = await queryData(args);
            break;
          case 'create-bucket':
            result = await createBucket(args);
            break;
          case 'create-org':
            result = await createOrg(args);
            break;
          case 'list-databases':
            result = await listDatabases(args);
            break;
          case 'health-check':
            result = await healthCheck(args);
            break;
          case 'get-measurements':
            result = await getMeasurements(args);
            break;
          case 'get-measurement-schema':
            result = await getMeasurementSchema(args);
            break;
          case 'get-bucket-info':
            result = await getBucketInfo(args);
            break;
          case 'get-tag-values':
            result = await getTagValues(args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          jsonrpc: "2.0",
          id: message.id,
          result: result
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: error.message
          }
        };
      }
    }

    if (message.method === 'resources/list') {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          resources: [
            {
              uri: "influxdb://orgs",
              name: "Organizations",
              description: "List InfluxDB organizations",
              mimeType: "application/json"
            },
            {
              uri: "influxdb://buckets",
              name: "Buckets",
              description: "List InfluxDB buckets",
              mimeType: "application/json"
            }
          ]
        }
      };
    }

    if (message.method === 'resources/read') {
      const { uri } = message.params;

      try {
        let result;
        if (uri === 'influxdb://orgs') {
          result = await listOrganizations();
        } else if (uri === 'influxdb://buckets') {
          result = await listBuckets();
        } else {
          throw new Error(`Unknown resource: ${uri}`);
        }

        return {
          jsonrpc: "2.0",
          id: message.id,
          result: result
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: error.message
          }
        };
      }
    }

    if (message.method === 'prompts/list') {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          prompts: [
            {
              name: "flux-query-examples",
              description: "Examples of Flux query patterns"
            },
            {
              name: "line-protocol-guide",
              description: "Guide for InfluxDB line protocol format"
            }
          ]
        }
      };
    }

    if (message.method === 'prompts/get') {
      const { name, arguments: args } = message.params;

      try {
        let result;
        if (name === 'flux-query-examples') {
          result = await fluxQueryExamplesPrompt(args);
        } else if (name === 'line-protocol-guide') {
          result = await lineProtocolGuidePrompt(args);
        } else {
          throw new Error(`Unknown prompt: ${name}`);
        }

        return {
          jsonrpc: "2.0",
          id: message.id,
          result: result
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: error.message
          }
        };
      }
    }

    // Handle ping
    if (message.method === 'ping') {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {}
      };
    }

    // Unknown method
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: `Method not found: ${message.method}`
      }
    };

  } catch (error) {
    console.error('Error handling message:', error);
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32603,
        message: "Internal error"
      }
    };
  }
};

// Main MCP endpoint
app.all('/mcp', async (req, res) => {
  await httpTransport.handleRequest(req, res);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'influxdb-mcp-server' });
});

// Root endpoint with server info
app.get('/', (req, res) => {
  res.json({
    name: 'InfluxDB MCP Server',
    version: '0.1.1',
    transport: 'streamable-http',
    endpoints: {
      mcp: '/mcp',
      health: '/health'
    },
    documentation: 'https://github.com/idoru/influxdb-mcp-server'
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`InfluxDB MCP Server running on http://${HOST}:${PORT}`);
  console.log(`MCP endpoint available at: http://${HOST}:${PORT}/mcp`);
  console.log(`Health check at: http://${HOST}:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down HTTP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down HTTP server...');
  process.exit(0);
});