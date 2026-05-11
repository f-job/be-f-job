import helmet from "helmet";
import { Express } from "express";
import { ENV } from "@/config/env";

export const setupSecurityHeaders = (app: Express) => {
  // Remove the X-Powered-By header to avoid exposing the technology stack
  app.disable("x-powered-by");

  // Configure Helmet middleware with comprehensive security headers
  app.use(
    helmet({
      // Content Security Policy (CSP) - Controls which resources can be loaded
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],                                    // Only allow resources from same origin
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for Swagger UI
          styleSrc: ["'self'", "'unsafe-inline'"],                   // Allow inline styles for Swagger UI
          imgSrc: ["'self'", "data:", "https:"],                     // Allow images from same origin, data URIs, and HTTPS
          connectSrc: ["'self'", ENV.FRONTEND_URL],                  // Allow API calls to same origin and frontend
          fontSrc: ["'self'", "https:", "data:"],                    // Allow fonts from same origin, HTTPS, and data URIs
          objectSrc: ["'none'"],                                     // Block <object>, <embed>, and <applet> elements
          mediaSrc: ["'none'"],                                      // Block media elements
          frameSrc: ["'none'"],                                      // Block iframes
          frameAncestors: ["'none'"],                               // Prevent site from being embedded
          formAction: ["'self'"],                                   // Only allow forms to submit to same origin
          ...(ENV.NODE_ENV === 'production' ? {
            upgradeInsecureRequests: [],                            // Force HTTPS in production
            blockAllMixedContent: []                                // Block mixed content in production
          } : {})
        }
      },
      // Cross-Origin Policies
      crossOriginEmbedderPolicy: false,                            // Required for Swagger UI
      crossOriginOpenerPolicy: { policy: "same-origin" },          // Isolate cross-origin windows
      crossOriginResourcePolicy: { policy: "same-origin" },        // Restrict cross-origin resource sharing

      // Browser Feature Policies
      dnsPrefetchControl: { allow: false },                        // Disable DNS prefetching
      frameguard: { action: "deny" },                              // Prevent clickjacking
      hsts: {                                                      // HTTP Strict Transport Security
        maxAge: 31536000,                                          // 1 year in seconds
        includeSubDomains: true,                                   // Apply to subdomains
        preload: true                                              // Allow preloading HSTS
      },
      ieNoOpen: true,                                              // Prevent IE from executing downloads
      noSniff: true,                                               // Prevent MIME type sniffing
      originAgentCluster: true,                                    // Improve performance isolation
      permittedCrossDomainPolicies: { permittedPolicies: "none" },// Restrict Adobe Flash and PDFs
      referrerPolicy: { policy: "no-referrer" },                   // Control referrer information
      xssFilter: true                                              // Enable XSS filtering
    })
  );

  // Additional custom security headers
  app.use((req, res, next) => {
    // Restrict browser features and APIs
    res.setHeader('Permissions-Policy', 
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');           // Prevent MIME type sniffing
    res.setHeader('X-Frame-Options', 'DENY');                     // Prevent clickjacking
    res.setHeader('X-XSS-Protection', '1; mode=block');          // Enable XSS protection
    next();
  });

  // Production-specific CORS configuration
  if (ENV.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      const allowedOrigins = [ENV.FRONTEND_URL];                  // Whitelist of allowed origins
      const origin = req.headers.origin;
      
      // Only allow requests from whitelisted origins
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      next();
    });
  }
};
