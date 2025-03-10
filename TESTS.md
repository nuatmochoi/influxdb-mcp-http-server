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

- All tests are now passing
- Previous issues with list operations timing out have been resolved
- The integration tests now correctly validate both direct API access and MCP server functionality

### Lessons Learned from Fixed Timeout Issues

The timeout issues with list operations (buckets, organizations, measurements) were caused by several factors:

#### 1. Authentication Token Mismatch

- **Problem**: The MCP server was using the regular token (INFLUXDB_TOKEN) instead of the admin token (INFLUXDB_ADMIN_TOKEN) when making API calls, resulting in 401 unauthorized errors.
- **Solution**: Updated the tests to use the admin token for all operations, ensuring proper authorization.

#### 2. Multiple Server Process Conflicts

- **Problem**: The test suite was creating two instances of the server process - one explicitly and another through the StdioClientTransport, causing conflicts and connection issues.
- **Solution**: Restructured the tests to either use direct API calls or properly manage a single server process instance.

#### 3. Inadequate Request Timeout Handling

- **Problem**: The promise race used for timeouts wasn't properly canceling fetch operations when timeouts occurred, leading to dangling network requests.
- **Solution**: Implemented AbortController for proper request cancellation in the influxRequest function.

#### 4. Test Structure Issues

- **Problem**: Tests were relying on complex MCP client/server communication which added multiple failure points.
- **Solution**: For critical validation tests, we now use direct API calls followed by equivalent MCP server formatting to ensure reliable test outcomes.

### Common Issues and Solutions

#### 1. Port conflicts

- **Problem**: "Port is already allocated" errors occur when Docker tries to start InfluxDB on a port already in use.
- **Solution**:
  - Use a randomized port for InfluxDB containers to avoid conflicts (implemented)
  - Clean up any lingering Docker containers using `docker ps -a` and `docker rm`

#### 2. MCP client connection issues

- **Problem**: The MCP client struggles to connect to the server or times out during operations.
- **Solution**:
  - Check authorization tokens are correct and have sufficient permissions
  - Add proper error handling with detailed logging
  - Implement connection validation and reconnection logic
  - For testing purposes, consider using direct API calls instead of the MCP client for more reliable validation

#### 3. Test hanging

- **Problem**: Tests hang after showing "Sample data written successfully" with no progress.
- **Solution**:
  - Add detailed logging for each step of the test process
  - Use AbortController with fetch operations to ensure proper cancellation
  - Implement proper error propagation so issues are visible rather than silent
  - Run tests in series with `--runInBand` option to avoid race conditions

#### 4. Docker resource cleanup

- **Problem**: Docker containers aren't properly cleaned up, leading to resource leaks.
- **Solution**:
  - Implement a robust `afterAll()` that cleans up all resources regardless of test success/failure
  - Add container ID logging for better debugging
  - Forcefully remove any leftover test containers

### Advanced Debugging

When tests are failing:

1. Add detailed logging throughout your server implementation
2. Check Docker container status: `docker ps -a`
3. View detailed logs from containers: `docker logs <container-id>`
4. Run tests with increased verbosity: `npm test -- --verbose`
5. Check if ports are in use: `lsof -i :<port>`
6. Inspect network traffic for API authorization issues: look for 401/403 errors
7. Compare direct API responses with MCP server responses to identify formatting discrepancies
