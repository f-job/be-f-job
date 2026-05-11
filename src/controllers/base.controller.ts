import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "@/utils/apiResponse";

export abstract class BaseController {
  protected async handleRequest(
    req: Request,
    res: Response,
    next: NextFunction,
    action: () => Promise<any>
  ): Promise<void> {
    try {
      const result = await action();
      ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }
} 