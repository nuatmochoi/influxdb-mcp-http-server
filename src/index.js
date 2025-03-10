import {
  McpServer,
  ResourceTemplate,
} from "../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import { StdioServerTransport } from "../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// Configuration from environment variables
const INFLUXDB_URL = process.env.INFLUXDB_URL || "http://localhost:8086";
const INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN;
const DEFAULT_ORG = process.env.INFLUXDB_ORG;

if (!INFLUXDB_TOKEN) {
  console.error("Error: INFLUXDB_TOKEN environment variable is required");
  process.exit(1);
}

// Create MCP server
const server = new McpServer({
  name: "InfluxDB",
  version: "1.0.0",
});

// Helper function for InfluxDB API requests with timeout
async function influxRequest(endpoint, options = {}, timeoutMs = 5000) {
  const url = `${INFLUXDB_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      Authorization: `Token ${INFLUXDB_TOKEN}`,
      "Content-Type": "application/json",
    },
  };

  console.log(`Making request to: ${url}`);

  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(`InfluxDB API request timed out after ${timeoutMs}ms`),
        ),
      timeoutMs,
    );
  });

  // Create the fetch promise
  const fetchPromise = fetch(url, { ...defaultOptions, ...options });

  // Race the fetch against the timeout
  const response = await Promise.race([fetchPromise, timeoutPromise]);
  console.log(`Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`InfluxDB API Error (${response.status}): ${errorText}`);
  }

  return response;
}

// Resource: List Organizations
server.resource(
  "orgs",
  "influxdb://orgs",
  async (uri) => {
    console.log("Processing list organizations request - START");

    try {
      // Add detailed debug logging
      console.log(`INFLUXDB_URL: ${INFLUXDB_URL}`);
      console.log(`INFLUXDB_TOKEN set: ${INFLUXDB_TOKEN ? "Yes" : "No"}`);

      console.log("Making request to InfluxDB API...");
      // Our influxRequest function already has built-in timeout
      const response = await influxRequest("/api/v2/orgs", {}, 5000);
      console.log(
        "Organizations API response received, status:",
        response.status,
      );

      // Also add timeout for JSON parsing
      console.log("Parsing response body...");
      const data = await response.json();
      console.log(`Found ${data.orgs?.length || 0} organizations`);

      // If we have no orgs, return an empty list instead of failing
      if (!data.orgs || data.orgs.length === 0) {
        console.log("No organizations found, returning empty list");
        return {
          contents: [{
            uri: uri.href,
            text: `# InfluxDB Organizations\n\nNo organizations found.`,
          }],
        };
      }

      // Format the organization list
      console.log("Formatting organization data...");
      const orgList = data.orgs.map((org) =>
        `ID: ${org.id} | Name: ${org.name} | Description: ${
          org.description || "N/A"
        }`
      ).join("\n");

      // Prepare the result
      const result = {
        contents: [{
          uri: uri.href,
          text: `# InfluxDB Organizations\n\n${orgList}`,
        }],
      };

      console.log("Successfully processed list organizations request - END");
      return result;
    } catch (error) {
      console.error("Error in list organizations resource:", error.message);
      console.error(error.stack);

      // Return a formatted error
      return {
        contents: [{
          uri: uri.href,
          text:
            `# InfluxDB Organizations - Error\n\nError retrieving organizations: ${error.message}`,
        }],
      };
    }
  },
);

// Resource: List Buckets
server.resource(
  "buckets",
  "influxdb://buckets",
  async (uri) => {
    try {
      const response = await influxRequest("/api/v2/buckets");
      const data = await response.json();

      const bucketList = data.buckets.map((bucket) =>
        `ID: ${bucket.id} | Name: ${bucket.name} | Organization ID: ${bucket.orgID} | Retention Period: ${
          bucket.retentionRules?.[0]?.everySeconds || "∞"
        } seconds`
      ).join("\n");

      return {
        contents: [{
          uri: uri.href,
          text: `# InfluxDB Buckets\n\n${bucketList}`,
        }],
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error retrieving buckets: ${error.message}`,
        }],
      };
    }
  },
);

// Resource: Get Measurements in a Bucket
server.resource(
  "bucket-measurements",
  new ResourceTemplate("influxdb://bucket/{bucketName}/measurements", {
    list: undefined,
  }),
  async (uri, { bucketName }) => {
    if (!DEFAULT_ORG) {
      return {
        contents: [{
          uri: uri.href,
          text: "Error: INFLUXDB_ORG environment variable is not set",
        }],
      };
    }

    try {
      // Use Flux query to get measurements
      const queryBody = JSON.stringify({
        query: `import "influxdata/influxdb/schema"

schema.measurements(bucket: "${bucketName}")`,
        type: "flux",
      });

      const response = await influxRequest(
        "/api/v2/query?org=" + encodeURIComponent(DEFAULT_ORG),
        {
          method: "POST",
          body: queryBody,
        },
      );

      const responseText = await response.text();
      const lines = responseText.split("\n").filter((line) =>
        line.trim() !== ""
      );

      // Parse CSV response (Flux queries return CSV)
      const headers = lines[0].split(",");
      const valueIndex = headers.indexOf("_value");

      if (valueIndex === -1) {
        return {
          contents: [{
            uri: uri.href,
            text: `No measurements found in bucket: ${bucketName}`,
          }],
        };
      }

      const measurements = lines.slice(1)
        .map((line) => line.split(",")[valueIndex])
        .filter((m) => m && !m.startsWith("#"))
        .join("\n");

      return {
        contents: [{
          uri: uri.href,
          text: `# Measurements in Bucket: ${bucketName}\n\n${measurements}`,
        }],
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error retrieving measurements: ${error.message}`,
        }],
      };
    }
  },
);

// Resource: Query data as a resource
server.resource(
  "query",
  new ResourceTemplate("influxdb://query/{orgName}/{fluxQuery}", {
    list: undefined,
  }),
  async (uri, { orgName, fluxQuery }) => {
    try {
      const decodedQuery = decodeURIComponent(fluxQuery);
      const response = await influxRequest(
        `/api/v2/query?org=${encodeURIComponent(orgName)}`,
        {
          method: "POST",
          body: JSON.stringify({ query: decodedQuery, type: "flux" }),
        },
      );

      const responseText = await response.text();

      return {
        contents: [{
          uri: uri.href,
          text: responseText,
        }],
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: `Error executing query: ${error.message}`,
        }],
      };
    }
  },
);

// Tool: Write Data
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
  async ({ org, bucket, data, precision }) => {
    try {
      let endpoint = `/api/v2/write?org=${encodeURIComponent(org)}&bucket=${
        encodeURIComponent(bucket)
      }`;
      if (precision) {
        endpoint += `&precision=${precision}`;
      }

      const response = await influxRequest(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Authorization: `Token ${INFLUXDB_TOKEN}`,
        },
        body: data,
      });

      return {
        content: [{
          type: "text",
          text: "Data written successfully",
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error writing data: ${error.message}`,
        }],
        isError: true,
      };
    }
  },
);

// Tool: Query Data
server.tool(
  "query-data",
  {
    org: z.string().describe("The organization name"),
    query: z.string().describe("Flux query string"),
  },
  async ({ org, query }) => {
    try {
      const response = await influxRequest(
        `/api/v2/query?org=${encodeURIComponent(org)}`,
        {
          method: "POST",
          body: JSON.stringify({ query, type: "flux" }),
        },
      );

      const responseText = await response.text();

      return {
        content: [{
          type: "text",
          text: responseText,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing query: ${error.message}`,
        }],
        isError: true,
      };
    }
  },
);

// Tool: Create Bucket
server.tool(
  "create-bucket",
  {
    name: z.string().describe("The bucket name"),
    orgID: z.string().describe("The organization ID"),
    retentionPeriodSeconds: z.number().optional().describe(
      "Retention period in seconds (optional)",
    ),
  },
  async ({ name, orgID, retentionPeriodSeconds }) => {
    try {
      const bucketData = {
        name,
        orgID,
        retentionRules: retentionPeriodSeconds
          ? [
            { type: "expire", everySeconds: retentionPeriodSeconds },
          ]
          : undefined,
      };

      const response = await influxRequest("/api/v2/buckets", {
        method: "POST",
        body: JSON.stringify(bucketData),
      });

      const bucket = await response.json();

      return {
        content: [{
          type: "text",
          text:
            `Bucket created successfully:\nID: ${bucket.id}\nName: ${bucket.name}\nOrganization ID: ${bucket.orgID}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error creating bucket: ${error.message}`,
        }],
        isError: true,
      };
    }
  },
);

// Tool: Create Organization
server.tool(
  "create-org",
  {
    name: z.string().describe("The organization name"),
    description: z.string().optional().describe(
      "Organization description (optional)",
    ),
  },
  async ({ name, description }) => {
    try {
      const orgData = {
        name,
        description,
      };

      const response = await influxRequest("/api/v2/orgs", {
        method: "POST",
        body: JSON.stringify(orgData),
      });

      const org = await response.json();

      return {
        content: [{
          type: "text",
          text:
            `Organization created successfully:\nID: ${org.id}\nName: ${org.name}\nDescription: ${
              org.description || "N/A"
            }`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error creating organization: ${error.message}`,
        }],
        isError: true,
      };
    }
  },
);

// Prompt: Common Flux Queries
server.prompt(
  "flux-query-examples",
  {},
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Here are some example Flux queries for InfluxDB:

1. Get data from the last 5 minutes:
\`\`\`flux
from(bucket: "my-bucket")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "cpu_usage")
\`\`\`

2. Calculate the average value over time windows:
\`\`\`flux
from(bucket: "my-bucket")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "temperature")
  |> aggregateWindow(every: 5m, fn: mean)
\`\`\`

3. Find the maximum value:
\`\`\`flux
from(bucket: "my-bucket")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "temperature" and r.sensor_id == "TLM0201")
  |> max()
\`\`\`

4. Group by a tag and calculate statistics:
\`\`\`flux
from(bucket: "my-bucket")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "network_traffic")
  |> group(columns: ["host"])
  |> mean()
\`\`\`

5. Join two data sources:
\`\`\`flux
cpu = from(bucket: "my-bucket")
  |> range(start: -15m)
  |> filter(fn: (r) => r._measurement == "cpu")

mem = from(bucket: "my-bucket")
  |> range(start: -15m)
  |> filter(fn: (r) => r._measurement == "mem")

join(tables: {cpu: cpu, mem: mem}, on: ["_time", "host"])
\`\`\`

Please adjust these queries to match your specific bucket names, measurements, and requirements.`,
      },
    }],
  }),
);

// Prompt: Line Protocol Guide
server.prompt(
  "line-protocol-guide",
  {},
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `# InfluxDB Line Protocol Guide

Line protocol is the text format for writing data to InfluxDB. It follows this structure:

\`\`\`
measurement,tag-key=tag-value field-key="field-value" timestamp
\`\`\`

## Components:

1. **Measurement**: Name of the measurement (similar to a table in SQL)
2. **Tags**: Key-value pairs for metadata (used for indexing, optional)
3. **Fields**: Key-value pairs for the actual data values (required)
4. **Timestamp**: Unix timestamp in the specified precision (optional, defaults to current time)

## Examples:

1. Basic point:
\`\`\`
temperature,room=kitchen value=72.1 1631025259000000000
\`\`\`

2. Multiple fields:
\`\`\`
weather,location=us-midwest temperature=82.0,humidity=54.0,pressure=1012.1 1631025259000000000
\`\`\`

3. Multiple tags:
\`\`\`
cpu_usage,host=server01,region=us-west cpu=64.2,mem=47.3 1631025259000000000
\`\`\`

4. Different data types:
\`\`\`
readings,device=thermostat temperature=72.1,active=true,status="normal" 1631025259000000000
\`\`\`

## Notes:
- Escape special characters in string field values with double quotes and backslashes
- Do not use double quotes for tag values
- Timestamps are in nanoseconds by default, but can be in other precisions (set with the precision parameter)
- Multiple points can be written by separating them with newlines

## Common Issues:
- Field values require a type indicator (no quotes for numbers, true/false for booleans, quotes for strings)
- At least one field is required per point
- Special characters (spaces, commas) in measurement names, tag keys, tag values, or field keys must be escaped
- Timestamps should match the specified precision`,
      },
    }],
  }),
);

// Start the server with stdio transport
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Error starting MCP server:", err);
  process.exit(1);
});
