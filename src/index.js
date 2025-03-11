import {
  McpServer,
  ResourceTemplate,
} from "../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import { StdioServerTransport } from "../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// Redirect console.log and console.error to stderr to avoid interfering with MCP protocol messages
// MCP uses stdout for protocol communication
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function() {
  process.stderr.write("[INFO] " + Array.from(arguments).join(" ") + "\n");
};

console.error = function() {
  process.stderr.write("[ERROR] " + Array.from(arguments).join(" ") + "\n");
};

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

  try {
    // Use AbortController for proper request cancellation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(`InfluxDB API request timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    // Properly merge headers to avoid conflicts
    // This ensures custom headers (like Content-Type) aren't overridden
    const mergedHeaders = {
      ...defaultOptions.headers,
      ...options.headers || {},
    };

    // Add the abort signal to the request options
    const requestOptions = {
      ...defaultOptions,
      ...options,
      headers: mergedHeaders,
      signal: controller.signal,
    };

    console.log(`Request options: ${JSON.stringify({
      method: requestOptions.method,
      headers: Object.keys(requestOptions.headers),
    })
      }`);

    // Make the request
    const response = await fetch(url, requestOptions);

    // Clear the timeout since the request completed
    clearTimeout(timeoutId);

    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await Promise.race([
        response.text(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Response text timeout")), 3000)
        ),
      ]);
      throw new Error(`InfluxDB API Error (${response.status}): ${errorText}`);
    }

    return response;
  } catch (error) {
    // Log the error with more details
    console.error(`Error in influxRequest to ${url}:`, error.message);
    // Rethrow to be handled by the caller
    throw error;
  }
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

      // If we have no orgs, return an empty array as stringified JSON in text field
      if (!data.orgs || data.orgs.length === 0) {
        console.log("No organizations found, returning empty list as JSON");
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ orgs: [] }),
          }],
        };
      }

      // Return the organizations data as stringified JSON in text field
      console.log("Returning organization data as JSON...");

      // Prepare the result as JSON data in the text field
      const result = {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(data),
        }],
      };

      console.log("Successfully processed list organizations request - END");
      return result;
    } catch (error) {
      console.error("Error in list organizations resource:", error.message);
      console.error(error.stack);

      // Return error as stringified JSON in text field
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error retrieving organizations: ${error.message}`,
          }),
        }],
        error: true,
      };
    }
  },
);

// Resource: List Buckets
server.resource(
  "buckets",
  "influxdb://buckets",
  async (uri) => {
    console.log("Processing list buckets request - START");

    try {
      // Add detailed debug logging
      console.log(`INFLUXDB_URL: ${INFLUXDB_URL}`);
      console.log(`INFLUXDB_TOKEN set: ${INFLUXDB_TOKEN ? "Yes" : "No"}`);

      console.log("Making request to InfluxDB API for buckets...");
      // Our influxRequest function already has built-in timeout
      const response = await influxRequest("/api/v2/buckets", {}, 5000);
      console.log(
        "Buckets API response received, status:",
        response.status,
      );

      // Also add timeout for JSON parsing
      console.log("Parsing response body for buckets...");
      const data = await response.json();
      console.log(`Found ${data.buckets?.length || 0} buckets`);

      // If we have no buckets, return an empty array as stringified JSON in text field
      if (!data.buckets || data.buckets.length === 0) {
        console.log("No buckets found, returning empty list as JSON");
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ buckets: [] }),
          }],
        };
      }

      // Return the buckets data as stringified JSON in text field
      console.log("Returning bucket data as JSON...");

      // Prepare the result as JSON data in text field
      const result = {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(data),
        }],
      };

      console.log("Successfully processed list buckets request - END");
      return result;
    } catch (error) {
      console.error("Error in list buckets resource:", error.message);
      console.error(error.stack);

      // Return error as stringified JSON in text field
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error retrieving buckets: ${error.message}`,
          }),
        }],
        error: true,
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
    console.log(
      `Processing measurements in bucket '${bucketName}' request - START`,
    );

    if (!DEFAULT_ORG) {
      console.error("Error: INFLUXDB_ORG environment variable is not set");
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: "INFLUXDB_ORG environment variable is not set",
          }),
        }],
        error: true,
      };
    }

    try {
      // Use Flux query to get measurements
      console.log(
        `Creating Flux query for bucket '${bucketName}' measurements`,
      );
      const queryBody = JSON.stringify({
        query: `import "influxdata/influxdb/schema"

schema.measurements(bucket: "${bucketName}")`,
        type: "flux",
      });

      console.log(`Making InfluxDB API request for measurements...`);
      const response = await influxRequest(
        "/api/v2/query?org=" + encodeURIComponent(DEFAULT_ORG),
        {
          method: "POST",
          body: queryBody,
        },
        5000, // Explicit timeout
      );
      console.log(
        "Measurements API response received, status:",
        response.status,
      );

      console.log("Reading response text...");
      const responseText = await response.text();

      console.log("Parsing CSV response...");
      const lines = responseText.split("\n").filter((line) =>
        line.trim() !== ""
      );
      console.log(`Found ${lines.length} lines in the response`);

      // Parse CSV response (Flux queries return CSV)
      const headers = lines[0].split(",");
      const valueIndex = headers.indexOf("_value");
      console.log("Headers:", headers);
      console.log("Value index:", valueIndex);

      if (valueIndex === -1) {
        console.log("No _value column found in the response");
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              bucket: bucketName,
              measurements: [],
            }),
          }],
        };
      }

      console.log("Extracting measurement values...");
      const measurements = lines.slice(1)
        .map((line) => line.split(",")[valueIndex])
        .filter((m) => m && !m.startsWith("#"))
        .join("\n");

      console.log(`Found ${measurements.split("\n").length} measurements`);
      console.log("Successfully processed measurements request - END");

      // Create a proper JSON structure for measurements
      const measurementsArray = measurements.split("\n").filter((m) =>
        m.trim() !== ""
      );

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            bucket: bucketName,
            measurements: measurementsArray,
          }),
        }],
      };
    } catch (error) {
      console.error(`Error in bucket measurements resource: ${error.message}`);
      console.error(error.stack);

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error retrieving measurements: ${error.message}`,
          }),
        }],
        error: true,
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
    console.log(`=== QUERY RESOURCE CALLED ===`);
    console.log(`Query for org: ${orgName}, query length: ${fluxQuery.length}`);

    try {
      const decodedQuery = decodeURIComponent(fluxQuery);
      console.log(`Decoded query: ${decodedQuery.substring(0, 50)}...`);

      // Direct fetch approach
      const queryUrl = `${INFLUXDB_URL}/api/v2/query?org=${encodeURIComponent(orgName)
        }`;
      console.log(`Query URL: ${queryUrl}`);

      const response = await fetch(queryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${INFLUXDB_TOKEN}`,
        },
        body: JSON.stringify({ query: decodedQuery, type: "flux" }),
      });

      console.log(`Query response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to execute query: ${response.status} ${errorText}`,
        );
      }

      const responseText = await response.text();
      console.log(`Query response length: ${responseText.length}`);

      console.log(`=== QUERY RESOURCE COMPLETED SUCCESSFULLY ===`);

      // Parse CSV to JSON
      const lines = responseText.split("\n").filter((line) =>
        line.trim() !== ""
      );
      let result;

      if (lines.length > 1) {
        const headers = lines[0].split(",");
        const data = lines.slice(1).map((line) => {
          const values = line.split(",");
          const record = {};
          headers.forEach((header, index) => {
            record[header] = values[index];
          });
          return record;
        });

        result = {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              query: decodedQuery,
              organization: orgName,
              headers: headers,
              data: data,
            }),
          }],
        };
      } else {
        // No results or headers only
        result = {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              query: decodedQuery,
              organization: orgName,
              data: [],
            }),
          }],
        };
      }

      return result;
    } catch (error) {
      console.error(`=== QUERY RESOURCE ERROR: ${error.message} ===`);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            error: `Error executing query: ${error.message}`,
          }),
        }],
        error: true,
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
    // Add extremely clear logging
    console.log(`=== WRITE-DATA TOOL CALLED ===`);
    console.log(
      `Writing to org: ${org}, bucket: ${bucket}, data length: ${data.length}`,
    );

    try {
      // Simplified approach focusing on core functionality
      let endpoint = `/api/v2/write?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)
        }`;
      if (precision) {
        endpoint += `&precision=${precision}`;
      }

      console.log(`Write URL: ${INFLUXDB_URL}${endpoint}`);

      // Use fetch directly instead of our wrapper to eliminate any potential issues
      const response = await fetch(`${INFLUXDB_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Authorization": `Token ${INFLUXDB_TOKEN}`,
        },
        body: data,
      });

      console.log(`Write response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to write data: ${response.status} ${errorText}`,
        );
      }

      console.log(`=== WRITE-DATA TOOL COMPLETED SUCCESSFULLY ===`);
      return {
        content: [{
          type: "text",
          text: "Data written successfully",
        }],
      };
    } catch (error) {
      console.error(`=== WRITE-DATA TOOL ERROR: ${error.message} ===`);
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
    console.log(`=== CREATE-BUCKET TOOL CALLED ===`);
    console.log(`Creating bucket: ${name}, orgID: ${orgID}`);

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

      console.log(`Creating bucket with data: ${JSON.stringify(bucketData)}`);

      // Use fetch directly instead of our wrapper
      const response = await fetch(`${INFLUXDB_URL}/api/v2/buckets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${INFLUXDB_TOKEN}`,
        },
        body: JSON.stringify(bucketData),
      });

      console.log(`Create bucket response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create bucket: ${response.status} ${errorText}`,
        );
      }

      const bucketResponse = await response.json();

      console.log(`=== CREATE-BUCKET TOOL COMPLETED SUCCESSFULLY ===`);
      return {
        content: [{
          type: "text",
          text:
            `Bucket created successfully:\nID: ${bucketResponse.id}\nName: ${bucketResponse.name}\nOrganization ID: ${bucketResponse.orgID}`,
        }],
      };
    } catch (error) {
      console.error(`=== CREATE-BUCKET TOOL ERROR: ${error.message} ===`);
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
            `Organization created successfully:\nID: ${org.id}\nName: ${org.name}\nDescription: ${org.description || "N/A"
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
  async () => {
    console.log(`=== FLUX-QUERY-EXAMPLES PROMPT CALLED ===`);

    // Simple, direct approach - no dependencies
    const promptResponse = {
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
    };

    console.log(`=== FLUX-QUERY-EXAMPLES PROMPT COMPLETED SUCCESSFULLY ===`);
    return promptResponse;
  },
);

// Prompt: Line Protocol Guide
server.prompt(
  "line-protocol-guide",
  {},
  async () => {
    console.log(`=== LINE-PROTOCOL-GUIDE PROMPT CALLED ===`);

    // Simple, direct approach - no dependencies
    const promptResponse = {
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
    };

    console.log(`=== LINE-PROTOCOL-GUIDE PROMPT COMPLETED SUCCESSFULLY ===`);
    return promptResponse;
  },
);

// Add a global error handler
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit - just log the error, as this could be caught and handled elsewhere
});

// Start the server with stdio transport
console.log("Starting MCP server with stdio transport...");
const transport = new StdioServerTransport();

// Connect immediately without any setTimeout
console.log("Connecting server to transport...");
server.connect(transport).catch((err) => {
  console.error("Error starting MCP server:", err);
  process.exit(1);
});
