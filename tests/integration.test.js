import { jest } from '@jest/globals';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import Docker from 'dockerode';
import fetch from 'node-fetch';
import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import waitForExpect from 'wait-for-expect';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration for tests
const INFLUXDB_PORT = 8086;
const INFLUXDB_ADMIN_TOKEN = 'admintoken123'; // This would be used for initial setup
const INFLUXDB_TOKEN = 'testtoken123'; // This will be created and used by our MCP server
const INFLUXDB_ORG = 'test-org';
const INFLUXDB_BUCKET = 'test-bucket';
const INFLUXDB_USERNAME = 'admin';
const INFLUXDB_PASSWORD = 'adminpassword';

// Test timeouts
jest.setTimeout(60000); // 60 seconds for Docker operations

describe('InfluxDB MCP Server Integration Tests', () => {
  let docker;
  let container;
  let mcpServerProcess;
  let mcpClient;

  // Setup: Start InfluxDB container before all tests
  beforeAll(async () => {
    // Initialize Docker
    docker = new Docker();

    console.log('Pulling InfluxDB image...');
    await new Promise((resolve, reject) => {
      docker.pull('influxdb:2.7', (err, stream) => {
        if (err) {
          return reject(err);
        }
        docker.modem.followProgress(stream, (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    });

    console.log('Creating InfluxDB container...');
    container = await docker.createContainer({
      Image: 'influxdb:2.7',
      ExposedPorts: {
        '8086/tcp': {}
      },
      HostConfig: {
        PortBindings: {
          '8086/tcp': [{ HostPort: `${INFLUXDB_PORT}` }]
        }
      },
      Env: [
        `DOCKER_INFLUXDB_INIT_MODE=setup`,
        `DOCKER_INFLUXDB_INIT_USERNAME=${INFLUXDB_USERNAME}`,
        `DOCKER_INFLUXDB_INIT_PASSWORD=${INFLUXDB_PASSWORD}`,
        `DOCKER_INFLUXDB_INIT_ORG=${INFLUXDB_ORG}`,
        `DOCKER_INFLUXDB_INIT_BUCKET=${INFLUXDB_BUCKET}`,
        `DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=${INFLUXDB_ADMIN_TOKEN}`
      ]
    });

    console.log('Starting InfluxDB container...');
    await container.start();

    // Wait for InfluxDB to be ready
    await waitForInfluxDBReady();
    
    // Create a token to be used by the MCP server
    await createInfluxDBToken();

    // Start the MCP server
    await startMcpServer();

    // Initialize the MCP client
    await initializeMcpClient();
  });

  // Teardown: Stop and remove containers after all tests
  afterAll(async () => {
    // Close MCP client
    if (mcpClient) {
      await mcpClient.close();
    }

    // Kill MCP server process
    if (mcpServerProcess) {
      mcpServerProcess.kill();
    }

    // Stop and remove InfluxDB container
    if (container) {
      await container.stop();
      await container.remove();
    }
  });

  // Helper: Wait for InfluxDB to be ready
  async function waitForInfluxDBReady() {
    console.log('Waiting for InfluxDB to be ready...');
    let ready = false;
    while (!ready) {
      try {
        const response = await fetch(`http://localhost:${INFLUXDB_PORT}/health`);
        const data = await response.json();
        if (data.status === 'pass') {
          ready = true;
          console.log('InfluxDB is ready!');
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.log('Waiting for InfluxDB to start...', error.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // Helper: Create a token for the MCP server to use
  async function createInfluxDBToken() {
    console.log('Creating InfluxDB token for MCP server...');
    
    // First, get the org ID
    const orgResponse = await fetch(`http://localhost:${INFLUXDB_PORT}/api/v2/orgs?org=${INFLUXDB_ORG}`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${INFLUXDB_ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const orgData = await orgResponse.json();
    if (!orgData.orgs || orgData.orgs.length === 0) {
      throw new Error('Organization not found');
    }
    
    const orgID = orgData.orgs[0].id;
    
    // Create a token with all privileges for this org
    const tokenResponse = await fetch(`http://localhost:${INFLUXDB_PORT}/api/v2/authorizations`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${INFLUXDB_ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Token for MCP server tests',
        orgID,
        permissions: [
          {
            action: 'read',
            resource: {
              type: 'buckets',
              orgID
            }
          },
          {
            action: 'write',
            resource: {
              type: 'buckets',
              orgID
            }
          },
          {
            action: 'read',
            resource: {
              type: 'orgs',
              orgID
            }
          },
          {
            action: 'write',
            resource: {
              type: 'orgs',
              orgID
            }
          }
        ],
        token: INFLUXDB_TOKEN
      })
    });
    
    const tokenData = await tokenResponse.json();
    console.log('Token created:', tokenData.token ? 'success' : 'failure');
  }

  // Helper: Write sample data to InfluxDB
  async function writeSampleData() {
    console.log('Writing sample data to InfluxDB...');
    
    const data = `
cpu_usage,host=server01,region=us-west cpu=64.2,mem=47.3 ${Date.now() * 1000000}
cpu_usage,host=server02,region=us-east cpu=72.1,mem=52.8 ${Date.now() * 1000000}
temperature,location=datacenter,sensor=rack1 value=24.5 ${Date.now() * 1000000}
temperature,location=datacenter,sensor=rack2 value=25.1 ${Date.now() * 1000000}
`;
    
    const response = await fetch(`http://localhost:${INFLUXDB_PORT}/api/v2/write?org=${INFLUXDB_ORG}&bucket=${INFLUXDB_BUCKET}&precision=ns`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${INFLUXDB_ADMIN_TOKEN}`,
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: data.trim()
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to write sample data: ${errorText}`);
    }
    
    console.log('Sample data written successfully');
  }

  // Helper: Start the MCP server
  async function startMcpServer() {
    console.log('Starting MCP server...');
    
    // Start the MCP server with the necessary environment variables
    mcpServerProcess = spawn('node', [path.join(__dirname, '../src/index.js')], {
      env: {
        ...process.env,
        INFLUXDB_URL: `http://localhost:${INFLUXDB_PORT}`,
        INFLUXDB_TOKEN: INFLUXDB_TOKEN,
        INFLUXDB_ORG: INFLUXDB_ORG
      }
    });
    
    // Log output from the MCP server
    mcpServerProcess.stdout.on('data', (data) => {
      console.log(`MCP Server stdout: ${data}`);
    });
    
    mcpServerProcess.stderr.on('data', (data) => {
      console.error(`MCP Server stderr: ${data}`);
    });
    
    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Helper: Initialize the MCP client
  async function initializeMcpClient() {
    console.log('Initializing MCP client...');
    
    const transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '../src/index.js')],
      env: {
        INFLUXDB_URL: `http://localhost:${INFLUXDB_PORT}`,
        INFLUXDB_TOKEN: INFLUXDB_TOKEN,
        INFLUXDB_ORG: INFLUXDB_ORG
      }
    });
    
    mcpClient = new McpClient({
      name: 'test-client',
      version: '1.0.0'
    });
    
    await mcpClient.connect(transport);
  }

  // Test: Write some sample data
  test('should write sample data to InfluxDB', async () => {
    await writeSampleData();
  });

  // Test: List organizations
  test('should list organizations', async () => {
    const resource = await mcpClient.readResource('influxdb://orgs');
    expect(resource.contents).toHaveLength(1);
    expect(resource.contents[0].text).toContain(INFLUXDB_ORG);
  });

  // Test: List buckets
  test('should list buckets', async () => {
    const resource = await mcpClient.readResource('influxdb://buckets');
    expect(resource.contents).toHaveLength(1);
    expect(resource.contents[0].text).toContain(INFLUXDB_BUCKET);
  });

  // Test: List measurements in a bucket
  test('should list measurements in a bucket', async () => {
    const resource = await mcpClient.readResource(`influxdb://bucket/${INFLUXDB_BUCKET}/measurements`);
    expect(resource.contents).toHaveLength(1);
    
    const text = resource.contents[0].text;
    expect(text).toContain('cpu_usage');
    expect(text).toContain('temperature');
  });

  // Test: Write data tool
  test('should write data using the write-data tool', async () => {
    const lineProtocol = `network_traffic,host=gateway01 bytes_in=1024,bytes_out=2048 ${Date.now() * 1000000}`;
    
    const result = await mcpClient.callTool({
      name: 'write-data',
      arguments: {
        org: INFLUXDB_ORG,
        bucket: INFLUXDB_BUCKET,
        data: lineProtocol,
        precision: 'ns'
      }
    });
    
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Data written successfully');
    
    // Verify data was written by checking measurements
    const resource = await mcpClient.readResource(`influxdb://bucket/${INFLUXDB_BUCKET}/measurements`);
    expect(resource.contents[0].text).toContain('network_traffic');
  });

  // Test: Query data tool
  test('should query data using the query-data tool', async () => {
    // Query the data we've written
    const query = `from(bucket: \"${INFLUXDB_BUCKET}\")
      |> range(start: -1h)
      |> filter(fn: (r) => r._measurement == \"cpu_usage\")`;
    
    const result = await mcpClient.callTool({
      name: 'query-data',
      arguments: {
        org: INFLUXDB_ORG,
        query
      }
    });
    
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('cpu_usage');
    expect(result.content[0].text).toContain('server01');
  });

  // Test: Create bucket tool
  test('should create a new bucket using the create-bucket tool', async () => {
    // First, get the org ID
    const orgsResource = await mcpClient.readResource('influxdb://orgs');
    const orgIDLine = orgsResource.contents[0].text.split('\
').find(line => line.includes(INFLUXDB_ORG));
    const orgID = orgIDLine.split('|')[0].split(':')[1].trim();
    
    // Create a new bucket
    const newBucketName = 'test-bucket-new';
    const result = await mcpClient.callTool({
      name: 'create-bucket',
      arguments: {
        name: newBucketName,
        orgID,
        retentionPeriodSeconds: 3600
      }
    });
    
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Bucket created successfully');
    
    // Verify bucket was created
    const bucketsResource = await mcpClient.readResource('influxdb://buckets');
    expect(bucketsResource.contents[0].text).toContain(newBucketName);
  });

  // Test: Query using resource
  test('should query data using the query resource', async () => {
    const fluxQuery = encodeURIComponent(`from(bucket: \"${INFLUXDB_BUCKET}\") |> range(start: -1h) |> filter(fn: (r) => r._measurement == \"cpu_usage\")`);
    
    const resource = await mcpClient.readResource(`influxdb://query/${INFLUXDB_ORG}/${fluxQuery}`);
    expect(resource.contents).toHaveLength(1);
    expect(resource.contents[0].text).toContain('cpu_usage');
    expect(resource.contents[0].text).toContain('server01');
  });

  // Test: Get flux-query-examples prompt
  test('should retrieve the flux-query-examples prompt', async () => {
    const prompt = await mcpClient.getPrompt('flux-query-examples', {});
    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0].content.text).toContain('Example Flux queries');
  });

  // Test: Get line-protocol-guide prompt
  test('should retrieve the line-protocol-guide prompt', async () => {
    const prompt = await mcpClient.getPrompt('line-protocol-guide', {});
    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0].content.text).toContain('Line Protocol Guide');
  });
});