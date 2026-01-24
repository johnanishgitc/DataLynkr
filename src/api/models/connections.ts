/** User connections (AdminDashboard) API models */

export interface UserConnection {
  tallyloc_id?: number;
  company?: string | null;
  guid?: string | null;
  conn_name?: string | null;
  shared_email?: string | null;
  status?: string | null;
  access_type?: string | null;
  address?: string | null;
  pincode?: string | null;
  statename?: string | null;
  countryname?: string | null;
  email?: string | null;
  phonenumber?: string | null;
  mobilenumbers?: string | null;
  gstinno?: string | null;
  startingfrom?: string | null;
  booksfrom?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

export interface UserConnectionsResponse {
  data?: UserConnection[] | null;
  error?: string | null;
  message?: string | null;
  success?: boolean;
}
