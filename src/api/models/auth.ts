/** Auth API request/response models */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token?: string | null;
  name?: string | null;
  email?: string | null;
  error?: string | null;
  success?: boolean;
  message?: string | null;
}

export interface SignupRequest {
  name: string;
  email: string;
  mobilno: number | string;
}

export interface SignupResponse {
  success?: boolean;
  message?: string | null;
  error?: string | null;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  success?: boolean;
  message?: string | null;
  error?: string | null;
}
