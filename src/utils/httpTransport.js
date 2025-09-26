/**
 * HTTP Transport for MCP Server using Streamable HTTP
 * Implements MCP-compatible HTTP transport with SSE support
 */

export class HttpTransport {
  constructor() {
    this.sessionId = null;
    this.callbacks = new Map();
    this.responseStream = null;
  }

  /**
   * Handle incoming HTTP request according to MCP Streamable HTTP specification
   */
  async handleRequest(req, res) {
    try {
      // Security: Validate Origin header to prevent DNS rebinding attacks
      const origin = req.headers.origin;
      if (origin && !this.isAllowedOrigin(origin)) {
        res.status(403).json({ error: 'Forbidden origin' });
        return;
      }

      if (req.method === 'POST') {
        await this.handlePost(req, res);
      } else if (req.method === 'GET') {
        await this.handleGet(req, res);
      } else {
        res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Error handling HTTP request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle POST requests - main message sending
   */
  async handlePost(req, res) {
    const acceptHeader = req.headers.accept || '';
    const supportsSSE = acceptHeader.includes('text/event-stream');

    try {
      // Parse JSON-RPC message from request body
      const message = req.body;

      if (!message || !message.jsonrpc) {
        res.status(400).json({ error: 'Invalid JSON-RPC message' });
        return;
      }

      // Handle different message types
      if (message.method) {
        // This is a request or notification
        const response = await this.messageHandler(message);

        if (message.id && response) {
          // Request - needs response
          if (supportsSSE && this.shouldStream(message.method)) {
            // Use SSE for streaming response
            this.sendSSEResponse(res, response, message.id);
          } else {
            // Send immediate JSON response
            res.json(response);
          }
        } else {
          // Notification - send 202 Accepted
          res.status(202).end();
        }
      } else if (message.result || message.error) {
        // This is a response to a previous request
        res.status(202).end();
        if (this.messageHandler) {
          await this.messageHandler(message);
        }
      }
    } catch (error) {
      console.error('Error processing POST request:', error);
      res.status(400).json({
        error: 'Failed to process message',
        details: error.message
      });
    }
  }

  /**
   * Handle GET requests - for connection establishment or session management
   */
  async handleGet(req, res) {
    res.json({
      name: 'InfluxDB MCP Server',
      version: '0.1.1',
      transport: 'streamable-http',
      capabilities: ['sse']
    });
  }

  /**
   * Send SSE response for streaming messages
   */
  sendSSEResponse(res, response, requestId) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send the response as SSE
    const eventData = JSON.stringify(response);
    res.write(`id: ${requestId}\n`);
    res.write(`data: ${eventData}\n\n`);

    // Close the stream after sending response
    res.end();
  }

  /**
   * Determine if a method should use streaming
   */
  shouldStream(method) {
    // Stream for potentially long-running operations
    const streamingMethods = ['query-data', 'write-data'];
    return streamingMethods.includes(method);
  }

  /**
   * Security check for allowed origins
   */
  isAllowedOrigin(origin) {
    // Allow localhost and local development
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8080'
    ];
    return allowedOrigins.includes(origin) || origin.startsWith('http://localhost:');
  }

  /**
   * Set message handler callback
   */
  onMessage(handler) {
    this.messageHandler = handler;
  }

  /**
   * Send message through HTTP transport
   */
  async send(message) {
    // For HTTP transport, messages are sent as responses to POST requests
    // This method would be used by the MCP server to send notifications
    if (this.responseStream) {
      const eventData = JSON.stringify(message);
      this.responseStream.write(`data: ${eventData}\n\n`);
    }
  }

  /**
   * Start the transport (placeholder for interface compatibility)
   */
  async start() {
    // HTTP transport starts when the server starts
    console.log('HTTP transport ready');
  }

  /**
   * Close the transport
   */
  async close() {
    if (this.responseStream) {
      this.responseStream.end();
      this.responseStream = null;
    }
  }
}