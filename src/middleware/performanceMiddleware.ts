import compression from "compression";
import { Request } from "express";

// Skip compressing responses for small payloads
const shouldCompress = (req: Request, res: any) => {
  if (req.headers["x-no-compression"]) {
    return false;
  }
  return compression.filter(req, res);
};

export const compressionMiddleware = compression({
  filter: shouldCompress,
  level: 6, // Default compression level
  threshold: 1024, // Only compress responses above 1KB
});
