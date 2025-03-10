# InfluxDB MCP Server Integration Tests

This directory contains a comprehensive integration test suite for the InfluxDB MCP Server. The tests verify that the server correctly interacts with an InfluxDB instance and exposes all the functionality through the Model Context Protocol.

## Prerequisites

- Node.js 16 or higher
- Docker (for running InfluxDB during tests)
- npm or yarn

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Make sure Docker is running on your system

## Running Tests

To run the integration tests:

```
npm test
```

## What the Tests Cover

The test suite:

1. Starts an InfluxDB 2.7 container in Docker
2. Initializes the database with an organization, bucket, and authentication token
3. Starts the InfluxDB MCP Server
4. Connects an MCP client to the server
5. Tests all MCP server functionality:
   - Writing data to InfluxDB
   - Listing organizations and buckets
   - Querying measurements in a bucket
   - Using the write-data and query-data tools
   - Creating new buckets
   - Accessing query resources
   - Retrieving prompt templates

## Test Environment

The tests use the following configuration:

- InfluxDB running on port 8086
- A test organization named "test-org"
- A test bucket named "test-bucket"
- A test admin token and a separate token for the MCP server

## Automatic Cleanup

After the tests complete, the suite:

1. Closes the MCP client connection
2. Terminates the MCP server process
3. Stops and removes the InfluxDB Docker container

## Note on Docker Usage

The integration tests require Docker to be installed and running on your system. Make sure you have proper permissions to create and manage Docker containers before running the tests.

## Running Individual Tests

You can run specific tests to isolate issues:

```bash
# Run a single test by name
npm test -- -t "should list organizations"

# Skip integration tests
npm test -- --testPathIgnorePatterns=integration.test.js
```

## Direct API Test

The integration tests include a direct API test that bypasses the MCP protocol to directly verify connectivity with InfluxDB. This test is useful for isolating issues between the InfluxDB API and the MCP protocol layer.

If the direct API test passes but the MCP client tests fail, the issue is likely with the MCP protocol implementation rather than InfluxDB connectivity.

## Troubleshooting Guide

### Current Status

- The direct API test passes, confirming that the InfluxDB API is working correctly
- The MCP protocol tests (list organizations, list buckets, etc.) timeout
- The issue appears to be related to the MCP client/server communication rather than InfluxDB connectivity

### Common Issues and Solutions

#### 1. Port conflicts

- **Problem**: "Port is already allocated" errors occur when Docker tries to start InfluxDB on a port already in use.
- **Solution**:
  - Use a randomized port for InfluxDB containers to avoid conflicts
  - Clean up any lingering Docker containers using `docker ps -a` and `docker rm`

#### 2. MCP client connection issues

- **Problem**: The MCP client struggles to connect to the server or times out during operations.
- **Solution**:
  - Increase timeouts for the client connection to at least 30 seconds
  - Add proper error handling and retry mechanisms for MCP client operations
  - Ensure proper environmental variables are passed to both server and client

#### 3. Test hanging

- **Problem**: Tests hang after showing "Sample data written successfully" with no progress.
- **Solution**:
  - Add detailed logging to show progress of each test
  - Use Promise.race() with timeouts to prevent infinite hanging
  - Implement retry logic for flaky operations
  - Run tests in series with `--runInBand` option

#### 4. Docker resource cleanup

- **Problem**: Docker containers aren't properly cleaned up, leading to resource leaks.
- **Solution**:
  - Implement a robust `afterAll()` that cleans up all resources regardless of test success/failure
  - Add container ID logging for better debugging
  - Forcefully remove any leftover test containers

### Advanced Debugging

When tests are failing:

1. Check Docker container status: `docker ps -a`
2. View detailed logs from containers: `docker logs <container-id>`
3. Run tests with increased verbosity: `npm test -- --verbose`
4. Check if ports are in use: `lsof -i :<port>`
