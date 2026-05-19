import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  orgId?: string;
  orgRole?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
