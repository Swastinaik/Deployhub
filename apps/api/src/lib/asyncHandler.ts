import { Request, Response, NextFunction } from "express";

type AsyncRequestHandler = (req: any, res: Response, next: NextFunction) => Promise<any>;

/**
 * A wrapper to handle asynchronous middleware/route exceptions and pass them to the global Express error handler.
 */
export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
