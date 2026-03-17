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
  is_first_login?: number;
  user_type?: string | null;
  user_type_details?: Record<string, unknown> | null;
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

export interface ChangePasswordRequest {
  email: string;
  oldPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  message?: string | null;
  error?: string | null;
}

/** Send OTP to email – api/login/send-otp */
export interface SendOtpRequest {
  email: string;
}

export interface SendOtpResponse {
  message?: string | null;
  error?: string | null;
}

/** Verify OTP – api/login/verify-otp. Success response matches LoginResponse. */
export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

export type VerifyOtpResponse = LoginResponse;
